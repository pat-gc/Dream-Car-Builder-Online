import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { addNode, addBeam, createNetworkState } from './network'
import type { NetworkState } from './network'
import type { Node3D } from '../types/nodeGraph'
import { stepPhysics } from './physics'
import type { PhysicsOptions } from './physics'

function freeNodeAt(x: number, y: number, z: number, mass = 1): NetworkState {
  return addNode(createNetworkState(), new THREE.Vector3(x, y, z), mass).state
}

function fixedNodeAt(x: number, y: number, z: number): NetworkState {
  return addNode(createNetworkState(), new THREE.Vector3(x, y, z), 1, true).state
}

function settle(
  state: NetworkState,
  iterations: number,
  dt = 1 / 60,
  options?: Partial<PhysicsOptions>,
): NetworkState {
  let s = state
  for (let i = 0; i < iterations; i++) {
    s = stepPhysics(s, dt, options)
  }
  return s
}

function isFinite(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
}

function firstNode(state: NetworkState): Node3D {
  const node = state.nodes.values().next().value
  if (node === undefined) {
    throw new Error('expected at least one node in the network')
  }
  return node
}

describe('stepPhysics — fixed nodes', () => {
  it('a single fixed node under gravity never moves', () => {
    const s = fixedNodeAt(1, 5, -3)
    const after = settle(s, 240)
    const node = firstNode(after)
    expect(node.position.equals(new THREE.Vector3(1, 5, -3))).toBe(true)
    expect(node.velocity.length()).toBe(0)
  })
})

describe('stepPhysics — gravity & ground', () => {
  it('a single free node under gravity falls and settles at groundY=0', () => {
    const s = freeNodeAt(0, 2, 0, 1)
    const after = settle(s, 1000)
    const node = firstNode(after)
    expect(node.position.y).toBeGreaterThanOrEqual(-1e-6)
    expect(node.position.y).toBeLessThanOrEqual(1e-3)
    expect(node.velocity.length()).toBeLessThan(0.05)
    expect(node.position.x).toBeCloseTo(0, 5)
    expect(node.position.z).toBeCloseTo(0, 5)
  })
})

describe('stepPhysics — beam spring forces', () => {
  it('a beam at rest length exerts zero spring force initially', () => {
    let s = createNetworkState()
    const ka = addNode(s, new THREE.Vector3(0, 0, 0))
    s = ka.state
    const kb = addNode(s, new THREE.Vector3(2, 0, 0))
    s = kb.state
    const r = addBeam(s, ka.node.id, kb.node.id, 1000, 0)
    s = r!.state

    const beam = r!.beam
    expect(beam.restLength).toBeCloseTo(2, 10)

    const after = stepPhysics(s, 1 / 60)
    const updatedBeam = after.beams.get(beam.id)!
    expect(updatedBeam.currentStress).toBeCloseTo(0, 6)
  })

  it('a stretched beam pulls its free endpoints back together', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(-1.5, 1, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(1.5, 1, 0))
    s = b.state
    const r = addBeam(s, a.node.id, b.node.id, 500, 2)
    s = r!.state

    const beam = s.beams.get(r!.beam.id)!
    beam.restLength = 2
    s = { nodes: new Map(s.nodes), beams: new Map(s.beams) }

    const startingDistance = a.node.position.distanceTo(b.node.position)
    expect(startingDistance).toBeCloseTo(3, 10)

    const opts = { gravity: 0, groundDamping: 0.5, friction: 1 }
    const after = settle(s, 240, 1 / 60, opts)
    const na = after.nodes.get(a.node.id)!
    const nb = after.nodes.get(b.node.id)!

    const finalDistance = na.position.distanceTo(nb.position)
    expect(finalDistance).toBeLessThan(startingDistance)
    expect(finalDistance).toBeCloseTo(r!.beam.restLength, 1)
  })

  it('a stretched beam between one fixed and one free node pulls the free node toward the beam rest length', () => {
    let s = createNetworkState()
    const fixed = addNode(s, new THREE.Vector3(0, 0, 0), 1, true)
    s = fixed.state
    const free = addNode(s, new THREE.Vector3(2, 0, 0))
    s = free.state
    const r = addBeam(s, fixed.node.id, free.node.id, 1000, 5)
    s = r!.state

    const beam = s.beams.get(r!.beam.id)!
    beam.restLength = 1
    s = { nodes: new Map(s.nodes), beams: new Map(s.beams) }

    const opts = { gravity: 0 }
    const after = settle(s, 600, 1 / 60, opts)
    const fixedAfter = after.nodes.get(fixed.node.id)!
    const freeAfter = after.nodes.get(free.node.id)!

    expect(fixedAfter.position.equals(new THREE.Vector3(0, 0, 0))).toBe(true)
    expect(freeAfter.position.length()).toBeCloseTo(beam.restLength, 1)
    expect(freeAfter.velocity.length()).toBeLessThan(0.05)
  })
})

describe('stepPhysics — beam breaking', () => {
  it('removes a beam whose currentStress exceeds maxStress', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(-5, 5, 0), 1, true)
    s = a.state
    const b = addNode(s, new THREE.Vector3(5, 5, 0), 1, true)
    s = b.state
    const r = addBeam(s, a.node.id, b.node.id, 2000, 0)
    s = r!.state

    const beamId = r!.beam.id
    const beam = s.beams.get(beamId)!
    beam.restLength = 1
    beam.maxStress = 100
    s = { nodes: new Map(s.nodes), beams: new Map(s.beams) }

    const after = stepPhysics(s, 1 / 60)
    expect(after.beams.has(beamId)).toBe(false)
    expect(after.nodes.size).toBe(2)
  })

  it('keeps a beam whose currentStress is below maxStress', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 5, 0), 1, true)
    s = a.state
    const b = addNode(s, new THREE.Vector3(1, 5, 0))
    s = b.state
    const r = addBeam(s, a.node.id, b.node.id, 1000, 0)
    s = r!.state

    const beamId = r!.beam.id
    const beam = s.beams.get(beamId)!
    beam.maxStress = 1e9
    s = { nodes: new Map(s.nodes), beams: new Map(s.beams) }

    const after = stepPhysics(s, 1 / 60)
    expect(after.beams.has(beamId)).toBe(true)
  })
})

describe('stepPhysics — numerical stability', () => {
  it('does not produce NaN/Infinity with a large dt and sub-stepping', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 1, 0), 1, true)
    s = a.state
    const b = addNode(s, new THREE.Vector3(0, 2, 0))
    s = b.state
    const c = addNode(s, new THREE.Vector3(1, 2, 0))
    s = c.state
    const ab = addBeam(s, a.node.id, b.node.id, 5000, 5)
    s = ab!.state
    const bc = addBeam(s, b.node.id, c.node.id, 5000, 5)
    s = bc!.state

    const opts = { subSteps: 10 }
    let current = s
    for (let i = 0; i < 100; i++) {
      current = stepPhysics(current, 0.1, opts)
    }

    for (const node of current.nodes.values()) {
      expect(isFinite(node.position)).toBe(true)
      expect(isFinite(node.velocity)).toBe(true)
      expect(Number.isFinite(node.force.length())).toBe(true)
      expect(node.mass).toBeGreaterThan(0)
    }
    for (const beam of current.beams.values()) {
      expect(Number.isFinite(beam.currentStress)).toBe(true)
      expect(Number.isFinite(beam.restLength)).toBe(true)
    }
  })
})

describe('stepPhysics — purity & options', () => {
  it('does not mutate the input state', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 1, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(0, 2, 0))
    s = b.state
    const r = addBeam(s, a.node.id, b.node.id, 1000, 1)
    s = r!.state

    const snapshotBefore = {
      aPos: a.node.position.clone(),
      aVel: a.node.velocity.clone(),
      beamStress: r!.beam.currentStress,
      beamsCount: s.beams.size,
    }

    stepPhysics(s, 1 / 60)

    expect(a.node.position.equals(snapshotBefore.aPos)).toBe(true)
    expect(a.node.velocity.equals(snapshotBefore.aVel)).toBe(true)
    expect(r!.beam.currentStress).toBe(snapshotBefore.beamStress)
    expect(s.beams.size).toBe(snapshotBefore.beamsCount)
  })

  it('respects a custom gravity of 0 (free node floats)', () => {
    const s = freeNodeAt(0, 5, 0, 1)
    const opts = { gravity: 0 }
    const after = settle(s, 100, 1 / 60, opts)
    const node = firstNode(after)
    expect(node.position.y).toBeCloseTo(5, 6)
    expect(node.velocity.length()).toBeCloseTo(0, 6)
  })

  it('subSteps default of 10 splits dt into 10 sub-iterations', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0), 1, true)
    s = a.state
    const b = addNode(s, new THREE.Vector3(0, 10, 0), 1, false)
    s = b.state

    const opts10 = { gravity: -10, groundY: -1000, subSteps: 10 }
    const opts1 = { gravity: -10, groundY: -1000, subSteps: 1 }

    const r10 = stepPhysics(s, 0.1, opts10)
    const r1 = stepPhysics(s, 0.1, opts1)

    const y10 = r10.nodes.get(b.node.id)!.position.y
    const y1 = r1.nodes.get(b.node.id)!.position.y

    expect(y10).not.toBeCloseTo(y1, 2)
    expect(y10).toBeGreaterThan(y1)
  })
})
