import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  addNode,
  addWheelPart,
  addRigidMount,
  addTransmissionLink,
  removePart,
  removeNode,
  createNetworkState,
} from './network'
import type { NetworkState } from './network'

let state: NetworkState

beforeEach(() => {
  state = createNetworkState()
})

describe('addWheelPart', () => {
  it('computes restLength as the distance between the two nodes', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: b } = addNode(s1, new THREE.Vector3(3, 0, 0))
    const res = addWheelPart(s2, a.id, b.id)
    expect(res).not.toBeNull()
    const part = (res as NonNullable<typeof res>).part
    expect(part.nodeAId).toBe(a.id)
    expect(part.nodeBId).toBe(b.id)
    expect(part.restLength).toBeCloseTo(3, 6)
    expect(part.wheelRadius).toBe(0.5) // DEFAULT_WHEEL_RADIUS
    expect(part.mass).toBe(5) // DEFAULT_WHEEL_MASS
    expect((res as NonNullable<typeof res>).state.wheels.size).toBe(1)
  })

  it('returns null for a self-loop (same node both ends)', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(0, 0, 0))
    expect(addWheelPart(s1, a.id, a.id)).toBeNull()
  })

  it('returns null when one of the nodes does not exist', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(0, 0, 0))
    expect(addWheelPart(s1, a.id, 'nope')).toBeNull()
  })
})

describe('addRigidMount', () => {
  it('computes the three pairwise restLengths for an ENGINE mount', () => {
    const { state: s1, node: n0 } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: n1 } = addNode(s1, new THREE.Vector3(3, 0, 0))
    const { state: s3, node: n2 } = addNode(s2, new THREE.Vector3(0, 4, 0))
    const res = addRigidMount(s3, 'ENGINE', [n0.id, n1.id, n2.id])
    expect(res).not.toBeNull()
    const part = (res as NonNullable<typeof res>).part
    expect(part.type).toBe('ENGINE')
    expect(part.nodeIds).toEqual([n0.id, n1.id, n2.id])
    // pairwise: n0-n1, n1-n2, n2-n0
    expect(part.restLengths[0]).toBeCloseTo(3, 6)
    expect(part.restLengths[1]).toBeCloseTo(5, 6) // 3-4-5 triangle
    expect(part.restLengths[2]).toBeCloseTo(4, 6)
    expect(part.mass).toBe(40) // DEFAULT_ENGINE_MASS
  })

  it('uses the SEAT default mass for a SEAT mount', () => {
    const { state: s1, node: n0 } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: n1 } = addNode(s1, new THREE.Vector3(1, 0, 0))
    const { state: s3, node: n2 } = addNode(s2, new THREE.Vector3(0, 1, 0))
    const res = addRigidMount(s3, 'SEAT', [n0.id, n1.id, n2.id])
    expect((res as NonNullable<typeof res>).part.mass).toBe(5)
  })

  it('rejects a second ENGINE once one already exists', () => {
    const { state: s1, node: n0 } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: n1 } = addNode(s1, new THREE.Vector3(1, 0, 0))
    const { state: s3, node: n2 } = addNode(s2, new THREE.Vector3(0, 1, 0))
    const first = addRigidMount(s3, 'ENGINE', [n0.id, n1.id, n2.id])
    expect(first).not.toBeNull()
    const working = (first as NonNullable<typeof first>).state
    // Same type, different node triplet -> still rejected.
    const { state: s4, node: p0 } = addNode(working, new THREE.Vector3(5, 0, 0))
    const { state: s5, node: p1 } = addNode(s4, new THREE.Vector3(6, 0, 0))
    const { state: s6, node: p2 } = addNode(s5, new THREE.Vector3(5, 1, 0))
    expect(addRigidMount(s6, 'ENGINE', [p0.id, p1.id, p2.id])).toBeNull()
  })

  it('allows one ENGINE and one SEAT simultaneously', () => {
    const { state: s1, node: n0 } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: n1 } = addNode(s1, new THREE.Vector3(1, 0, 0))
    const { state: s3, node: n2 } = addNode(s2, new THREE.Vector3(0, 1, 0))
    const engine = addRigidMount(s3, 'ENGINE', [n0.id, n1.id, n2.id])
    expect(engine).not.toBeNull()
    const { state: s4, node: q0 } = addNode((engine as NonNullable<typeof engine>).state, new THREE.Vector3(5, 0, 0))
    const { state: s5, node: q1 } = addNode(s4, new THREE.Vector3(6, 0, 0))
    const { state: s6, node: q2 } = addNode(s5, new THREE.Vector3(5, 1, 0))
    const seat = addRigidMount(s6, 'SEAT', [q0.id, q1.id, q2.id])
    expect(seat).not.toBeNull()
    expect((seat as NonNullable<typeof seat>).state.rigidMounts.size).toBe(2)
  })

  it('rejects a mount with fewer than 3 distinct nodes', () => {
    const { state: s1, node: n0 } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: n1 } = addNode(s1, new THREE.Vector3(1, 0, 0))
    // [n0, n0, n1] -> not distinct
    expect(addRigidMount(s2, 'ENGINE', [n0.id, n0.id, n1.id])).toBeNull()
    // [n0, n1, n0] -> not distinct
    expect(addRigidMount(s2, 'ENGINE', [n0.id, n1.id, n0.id])).toBeNull()
    // [n0, n0, n0] -> not distinct
    expect(addRigidMount(s2, 'ENGINE', [n0.id, n0.id, n0.id])).toBeNull()
  })

  it('returns null when a referenced node does not exist', () => {
    const { state: s1, node: n0 } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: n1 } = addNode(s1, new THREE.Vector3(1, 0, 0))
    expect(addRigidMount(s2, 'ENGINE', [n0.id, n1.id, 'missing'])).toBeNull()
  })
})

describe('addTransmissionLink', () => {
  it('creates a link between two valid distinct nodes with no restLength', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: b } = addNode(s1, new THREE.Vector3(2, 0, 0))
    const res = addTransmissionLink(s2, a.id, b.id)
    expect(res).not.toBeNull()
    const part = (res as NonNullable<typeof res>).part
    expect(part.nodeAId).toBe(a.id)
    expect(part.nodeBId).toBe(b.id)
    expect('restLength' in part).toBe(false)
    expect((res as NonNullable<typeof res>).state.transmissions.size).toBe(1)
  })

  it('returns null for a self-loop (same node both ends)', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(0, 0, 0))
    expect(addTransmissionLink(s1, a.id, a.id)).toBeNull()
  })

  it('returns null when a node does not exist', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(0, 0, 0))
    expect(addTransmissionLink(s1, a.id, 'nope')).toBeNull()
  })

  it('allows multiple independent transmission links', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: b } = addNode(s1, new THREE.Vector3(2, 0, 0))
    const { state: s3, node: c } = addNode(s2, new THREE.Vector3(4, 0, 0))
    const r1 = addTransmissionLink(s3, a.id, b.id)
    expect(r1).not.toBeNull()
    const r2 = addTransmissionLink((r1 as NonNullable<typeof r1>).state, b.id, c.id)
    expect(r2).not.toBeNull()
    expect((r2 as NonNullable<typeof r2>).state.transmissions.size).toBe(2)
  })
})

describe('cascade delete via removeNode', () => {
  it('removes wheels, rigidMounts, and transmissions referencing the deleted node', () => {
    const { state: s1, node: hub } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: axle } = addNode(s1, new THREE.Vector3(2, 0, 0))
    const { state: s3, node: m0 } = addNode(s2, new THREE.Vector3(5, 0, 0))
    const { state: s4, node: m1 } = addNode(s3, new THREE.Vector3(6, 0, 0))
    const { state: s5, node: m2 } = addNode(s4, new THREE.Vector3(5, 1, 0))
    const { state: s6, node: tA } = addNode(s5, new THREE.Vector3(10, 0, 0))
    const s7 = s6

    // hub is referenced by a wheel (as nodeA) AND a transmission (as nodeA).
    const w = addWheelPart(s7, hub.id, axle.id) as NonNullable<
      ReturnType<typeof addWheelPart>
    >
    const e = addRigidMount(w.state, 'ENGINE', [m0.id, m1.id, m2.id]) as NonNullable<
      ReturnType<typeof addRigidMount>
    >
    const t = addTransmissionLink(e.state, hub.id, tA.id) as NonNullable<
      ReturnType<typeof addTransmissionLink>
    >
    const base = t.state
    expect(base.wheels.size).toBe(1)
    expect(base.rigidMounts.size).toBe(1)
    expect(base.transmissions.size).toBe(1)

    // Delete hub -> wheel + transmission cascade away; engine intact (unrelated).
    const afterHub = removeNode(base, hub.id)
    expect(afterHub.wheels.size).toBe(0)
    expect(afterHub.transmissions.size).toBe(0)
    expect(afterHub.rigidMounts.size).toBe(1)
    expect(afterHub.nodes.size).toBe(base.nodes.size - 1)

    // Delete m1 (which belongs to the engine mount) -> the mount cascades away.
    const afterMount = removeNode(afterHub, m1.id)
    expect(afterMount.rigidMounts.size).toBe(0)
    expect(afterMount.nodes.size).toBe(afterHub.nodes.size - 1)

    // The untouched transmission's other/foreign nodes remain; lake no stray refs.
    for (const tx of afterMount.transmissions.values()) {
      expect(afterMount.nodes.has(tx.nodeAId)).toBe(true)
      expect(afterMount.nodes.has(tx.nodeBId)).toBe(true)
    }
    for (const wh of afterMount.wheels.values()) {
      expect(afterMount.nodes.has(wh.nodeAId)).toBe(true)
      expect(afterMount.nodes.has(wh.nodeBId)).toBe(true)
    }
    for (const mt of afterMount.rigidMounts.values()) {
      for (const id of mt.nodeIds) expect(afterMount.nodes.has(id)).toBe(true)
    }
  })
})

describe('removePart', () => {
  it('removes a WheelPart by id without touching structural nodes', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: b } = addNode(s1, new THREE.Vector3(1, 0, 0))
    const w = addWheelPart(s2, a.id, b.id) as NonNullable<
      ReturnType<typeof addWheelPart>
    >
    const partId = w.part.id
    const after = removePart(w.state, partId)
    expect(after.wheels.size).toBe(0)
    // nodes untouched
    expect(after.nodes.has(a.id)).toBe(true)
    expect(after.nodes.has(b.id)).toBe(true)
  })

  it('removes a RigidMount by id', () => {
    const { state: s1, node: n0 } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: n1 } = addNode(s1, new THREE.Vector3(1, 0, 0))
    const { state: s3, node: n2 } = addNode(s2, new THREE.Vector3(0, 1, 0))
    const e = addRigidMount(s3, 'ENGINE', [n0.id, n1.id, n2.id]) as NonNullable<
      ReturnType<typeof addRigidMount>
    >
    const after = removePart(e.state, e.part.id)
    expect(after.rigidMounts.size).toBe(0)
  })

  it('removes a TransmissionLink by id', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(0, 0, 0))
    const { state: s2, node: b } = addNode(s1, new THREE.Vector3(1, 0, 0))
    const t = addTransmissionLink(s2, a.id, b.id) as NonNullable<
      ReturnType<typeof addTransmissionLink>
    >
    const after = removePart(t.state, t.part.id)
    expect(after.transmissions.size).toBe(0)
  })

  it('is a no-op (returns same state) when the id matches no part', () => {
    const s1 = addNode(state, new THREE.Vector3(0, 0, 0)).state
    expect(removePart(s1, 'does-not-exist')).toBe(s1)
    expect(removePart(s1, 'does-not-exist').wheels).toBe(s1.wheels)
  })
})
