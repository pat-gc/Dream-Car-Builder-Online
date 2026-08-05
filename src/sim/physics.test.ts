import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { addNode, addBeam, addWheelPart, addRigidMount, addTransmissionLink, createNetworkState } from './network'
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
    s = {
      nodes: new Map(s.nodes),
      beams: new Map(s.beams),
      wheels: new Map(),
      rigidMounts: new Map(),
      transmissions: new Map(),
    }

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
    s = {
      nodes: new Map(s.nodes),
      beams: new Map(s.beams),
      wheels: new Map(),
      rigidMounts: new Map(),
      transmissions: new Map(),
    }

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
    s = {
      nodes: new Map(s.nodes),
      beams: new Map(s.beams),
      wheels: new Map(),
      rigidMounts: new Map(),
      transmissions: new Map(),
    }

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
    s = {
      nodes: new Map(s.nodes),
      beams: new Map(s.beams),
      wheels: new Map(),
      rigidMounts: new Map(),
      transmissions: new Map(),
    }

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

describe('stepPhysics — rigid parts (Step 16b)', () => {
  // Common scenario: a hub node pinned at the top, an outer node hanging below
  // it at exactly restLength. Gravity then pulls the outer node down.
  // Helpers that build this geometry with a chosen link type.
  const HUB = new THREE.Vector3(0, 10, 0)
  const OUTER = new THREE.Vector3(0, 0, 0) // 10 units below hub
  const REST_LENGTH = 10
  const HEAVY_GRAVITY = -50

  function buildSpringChain(): NetworkState {
    let s = createNetworkState()
    const a = addNode(s, HUB.clone(), 1, true)
    s = a.state
    const b = addNode(s, OUTER.clone(), 1, false)
    s = b.state
    // Modest stiffness so the load visibly stretches it at equilibrium; default
    // damping (10) so the system settles to the static-stretch equilibrium
    // (x = mg/k) rather than oscillating forever.
    const r = addBeam(s, a.node.id, b.node.id, 100, 10)
    return r!.state
  }

  function buildWheelChain(wheelMass = 1): NetworkState {
    let s = createNetworkState()
    const a = addNode(s, HUB.clone(), 1, true)
    s = a.state
    const b = addNode(s, OUTER.clone(), 1, false)
    s = b.state
    const r = addWheelPart(s, a.node.id, b.node.id, 0.5, wheelMass)
    return r!.state
  }

  function nodeIds(s: NetworkState): { aId: string; bId: string } {
    const ids = [...s.nodes.keys()]
    return { aId: ids[0], bId: ids[1] }
  }

  it('a spring beam under heavy load visibly stretches (flexes)', () => {
    const s = buildSpringChain()
    const { aId, bId } = nodeIds(s)
    // Static equilibrium stretch for k=100, m=1, g=50: x = mg/k = 0.5, so the
    // settled distance is restLength + 0.5 = 10.5 (damping doesn't change the
    // steady-state stretch under a constant load).
    const after = settle(s, 1200, 1 / 60, { gravity: HEAVY_GRAVITY, groundY: -1000 })
    const a = after.nodes.get(aId)!
    const b = after.nodes.get(bId)!
    const dist = a.position.distanceTo(b.position)
    expect(dist).toBeCloseTo(REST_LENGTH + 0.5, 4) // visibly stretched (≈10.5)
  })

  it('a WheelPart under the same heavy load does NOT stretch (rigid constraint)', () => {
    const s = buildWheelChain()
    const { aId, bId } = nodeIds(s)
    const after = settle(s, 600, 1 / 60, { gravity: HEAVY_GRAVITY, groundY: -1000 })
    const a = after.nodes.get(aId)!
    const b = after.nodes.get(bId)!
    const dist = a.position.distanceTo(b.position)
    expect(dist).toBeCloseTo(REST_LENGTH, 8) // exactly rigid, zero flex
    expect(a.position.distanceTo(HUB)).toBeCloseTo(0, 8) // hub stayed put
  })

  it('a RigidMount triangle under load keeps all 3 pairwise distances exact', () => {
    let s = createNetworkState()
    // Triangle: pin the top vertex; the other two hang under gravity.
    const p0 = addNode(s, new THREE.Vector3(0, 10, 0), 1, true)
    s = p0.state
    const p1 = addNode(s, new THREE.Vector3(3, 0, 0), 1, false)
    s = p1.state
    const p2 = addNode(s, new THREE.Vector3(0, 0, 0), 1, false)
    s = p2.state
    const r = addRigidMount(s, 'ENGINE', [p0.node.id, p1.node.id, p2.node.id], 5)
    s = r!.state

    const [id0, id1, id2] = r!.part.nodeIds
    const [rl01, rl12, rl20] = r!.part.restLengths

    const after = settle(s, 300, 1 / 60, { gravity: HEAVY_GRAVITY, groundY: -1000 })
    const n0 = after.nodes.get(id0)!
    const n1 = after.nodes.get(id1)!
    const n2 = after.nodes.get(id2)!
    expect(n0.position.distanceTo(n1.position)).toBeCloseTo(rl01, 8)
    expect(n1.position.distanceTo(n2.position)).toBeCloseTo(rl12, 8)
    expect(n2.position.distanceTo(n0.position)).toBeCloseTo(rl20, 8)
  })

  it('a pinned node absorbs 100% of the rigid correction so the free node snaps to exact restLength', () => {
    // Two nodes: A pinned, B free. Start B at a wrong distance, no spring
    // (only the rigid wheel constraint), no gravity. After one step B must
    // land exactly restLength from A because A is fixed and absorbs nothing.
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0), 1, true)
    s = a.state
    const b = addNode(s, new THREE.Vector3(0, -3, 0), 1, false) // 3 away
    s = b.state
    const r = addWheelPart(s, a.node.id, b.node.id, 0.5, 1)
    const wheel = r!.part
    s = r!.state
    // restLength == 3 (current distance). Now displace B sideways so the
    // distance becomes wrong, then step once with no gravity.
    const displaced = {
      ...s,
      nodes: new Map(s.nodes),
      beams: new Map(s.beams),
      wheels: new Map(s.wheels),
      rigidMounts: new Map(s.rigidMounts),
      transmissions: new Map(s.transmissions),
    }
    const bNode = displaced.nodes.get(b.node.id)!
    displaced.nodes.set(b.node.id, { ...bNode, position: new THREE.Vector3(0, -5, 0) }) // 5 away

    const after = stepPhysics(displaced, 1 / 60, { gravity: 0, groundY: -1000 })
    const na = after.nodes.get(a.node.id)!
    const nb = after.nodes.get(b.node.id)!
    expect(na.position.distanceTo(new THREE.Vector3(0, 0, 0))).toBeCloseTo(0, 8) // pinned stays put
    expect(na.position.distanceTo(nb.position)).toBeCloseTo(wheel.restLength, 8) // free snapped exactly
  })

  it('a TransmissionLink exerts zero physics constraint (nodes move freely apart)', () => {
    // Two free nodes connected ONLY by a transmission link, set apart at
    // restLength, then give one an initial velocity outward. A rigid/spring
    // constraint would pull them back; the transmission link must not, so the
    // distance grows unbounded.
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 100, 0), 1, false)
    s = a.state
    const b = addNode(s, new THREE.Vector3(0, 100, 0), 1, false) // coincident, dist 0
    s = b.state
    const r = addTransmissionLink(s, a.node.id, b.node.id, 1)
    s = r!.state

    // Give A velocity -X and B velocity +X. No gravity. If the transmission
    // link constrained anything, the distance would be held; it must grow.
    const seeded = {
      ...s,
      nodes: new Map(s.nodes),
      beams: new Map(s.beams),
      wheels: new Map(s.wheels),
      rigidMounts: new Map(s.rigidMounts),
      transmissions: new Map(s.transmissions),
    }
    const aNode = seeded.nodes.get(a.node.id)!
    const bNode = seeded.nodes.get(b.node.id)!
    seeded.nodes.set(a.node.id, { ...aNode, velocity: new THREE.Vector3(-5, 0, 0) })
    seeded.nodes.set(b.node.id, { ...bNode, velocity: new THREE.Vector3(5, 0, 0) })

    const after = settle(seeded, 30, 1 / 60, { gravity: 0, groundY: -1000 })
    const na = after.nodes.get(a.node.id)!
    const nb = after.nodes.get(b.node.id)!
    const dist = na.position.distanceTo(nb.position)
    // Velocity magnitude 10 over 0.5s of steps (30 * 1/60) -> ≈5 apart.
    expect(dist).toBeGreaterThan(4)
    expect(after.transmissions.size).toBe(1) // link survives, just inert
  })

  it('ignores rigidIterations=0 by defaulting to at least one pass', () => {
    // Defensive: a user passing rigidIterations: 0 must not silently disable
    // the constraint (resolveOptions clamps via Math.max(1, ...)).
    const s = buildWheelChain()
    const { aId, bId } = nodeIds(s)
    const after = settle(s, 10, 1 / 60, { gravity: HEAVY_GRAVITY, groundY: -1000, rigidIterations: 0 })
    const a = after.nodes.get(aId)!
    const b = after.nodes.get(bId)!
    expect(a.position.distanceTo(b.position)).toBeCloseTo(REST_LENGTH, 6)
  })
})
