import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  addNode,
  addBeam,
  findOrCreateNode,
  moveNode,
  moveNodes,
  removeNode,
  removeBeam,
  clear,
  getTotalMass,
  findBeamBetween,
  createNetworkState,
  cloneNetworkState,
  resetKinematics,
} from './network'
import type { NetworkState } from './network'

let state: NetworkState

beforeEach(() => {
  state = createNetworkState()
})

describe('addNode', () => {
  it('creates a node with a unique id and the given position', () => {
    const pos = new THREE.Vector3(1, 2, 3)
    const { state: next, node } = addNode(state, pos)
    expect(next.nodes.size).toBe(1)
    expect(node.id).toBe('n0')
    expect(node.position.equals(pos)).toBe(true)
    expect(node.mass).toBe(1)
    expect(node.isFixed).toBe(false)
    expect(node.velocity.length()).toBe(0)
    expect(node.force.length()).toBe(0)
  })

  it('does not mutate the previous state', () => {
    const { state: next } = addNode(state, new THREE.Vector3(0, 0, 0))
    expect(state.nodes.size).toBe(0)
    expect(next.nodes.size).toBe(1)
  })

  it('clones the position so external mutation does not leak in', () => {
    const pos = new THREE.Vector3(0, 0, 0)
    const { node } = addNode(state, pos)
    pos.set(9, 9, 9)
    expect(node.position.equals(new THREE.Vector3(0, 0, 0))).toBe(true)
  })
})

describe('addBeam', () => {
  it('creates a beam with restLength equal to the initial node distance', () => {
    let s = createNetworkState()
    const rn1 = addNode(s, new THREE.Vector3(0, 0, 0))
    s = rn1.state
    const rn2 = addNode(s, new THREE.Vector3(0, 3, 4))
    s = rn2.state
    const rb = addBeam(s, rn1.node.id, rn2.node.id)
    expect(rb).not.toBeNull()
    const beam = rb!.beam
    expect(beam.restLength).toBeCloseTo(5, 10)
    expect(beam.stiffness).toBe(1000)
    expect(beam.damping).toBe(10)
    expect(beam.currentStress).toBe(0)
  })

  it('rejects a self-connecting beam (nodeAId === nodeBId)', () => {
    const { state: s1, node } = addNode(state, new THREE.Vector3(0, 0, 0))
    const res = addBeam(s1, node.id, node.id)
    expect(res).toBeNull()
  })

  it('rejects a duplicate beam regardless of endpoint order', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(1, 0, 0))
    s = b.state
    const first = addBeam(s, a.node.id, b.node.id)
    expect(first).not.toBeNull()

    s = first!.state
    const duplicateForward = addBeam(s, a.node.id, b.node.id)
    expect(duplicateForward).toBeNull()

    const duplicateReverse = addBeam(s, b.node.id, a.node.id)
    expect(duplicateReverse).toBeNull()
  })

  it('returns null when a referenced node does not exist', () => {
    const res = addBeam(state, 'nope', 'also-nope')
    expect(res).toBeNull()
  })

  it('does not mutate previous state on rejection', () => {
    const { state: s1, node } = addNode(state, new THREE.Vector3(0, 0, 0))
    addBeam(s1, node.id, node.id)
    expect(s1.beams.size).toBe(0)
  })
})

describe('findOrCreateNode', () => {
  it('merges into an existing node within the merge threshold', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(1, 1, 1))
    const near = new THREE.Vector3(1, 1, 1 + 0.02) // 0.02 < 0.05
    const res = findOrCreateNode(s1, near)
    expect(res.nodeId).toBe(a.id)
    expect(res.state).toBe(s1) // no new node created -> same ref
    expect(s1.nodes.size).toBe(1)
  })

  it('merges at exactly the threshold boundary (inclusive)', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(0, 0, 0))
    const onBoundary = new THREE.Vector3(0.05, 0, 0)
    const res = findOrCreateNode(s1, onBoundary)
    expect(res.nodeId).toBe(a.id)
    expect(s1.nodes.size).toBe(1)
  })

  it('creates a new node when outside the threshold', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(0, 0, 0))
    const far = new THREE.Vector3(0, 0, 1) // 1.0 >> 0.05
    const res = findOrCreateNode(s1, far)
    expect(res.nodeId).not.toBe(a.id)
    expect(res.state.nodes.size).toBe(2)
  })

  it('respects a custom merge threshold', () => {
    const { state: s1, node: a } = addNode(state, new THREE.Vector3(0, 0, 0))
    const atHalf = new THREE.Vector3(0.4, 0, 0)
    // default threshold 0.05 -> new node
    const r1 = findOrCreateNode(s1, atHalf)
    expect(r1.nodeId).not.toBe(a.id)

    // custom threshold 1.0 -> merges with a
    const r2 = findOrCreateNode(s1, atHalf, 1.0)
    expect(r2.nodeId).toBe(a.id)
    expect(r2.state).toBe(s1)
  })

  it('finds the nearest among multiple existing nodes', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(2, 0, 0))
    s = b.state
    const nearA = new THREE.Vector3(0.01, 0, 0)
    const nearB = new THREE.Vector3(1.98, 0, 0)
    expect(findOrCreateNode(s, nearA).nodeId).toBe(a.node.id)
    expect(findOrCreateNode(s, nearB).nodeId).toBe(b.node.id)
  })
})

describe('removeNode', () => {
  it('removes the node and cascades to its connected beams', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(1, 0, 0))
    s = b.state
    const c = addNode(s, new THREE.Vector3(2, 0, 0))
    s = c.state
    const ab = addBeam(s, a.node.id, b.node.id)
    s = ab!.state
    const bc = addBeam(s, b.node.id, c.node.id)
    s = bc!.state
    expect(s.beams.size).toBe(2)

    const after = removeNode(s, b.node.id)
    expect(after.nodes.size).toBe(2)
    expect(after.beams.size).toBe(0)
    expect(after.nodes.has(b.node.id)).toBe(false)
  })

  it('only removes beams connected to the deleted node', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(1, 0, 0))
    s = b.state
    const c = addNode(s, new THREE.Vector3(2, 0, 0))
    s = c.state
    const ab = addBeam(s, a.node.id, b.node.id)
    s = ab!.state
    const ac = addBeam(s, a.node.id, c.node.id)
    s = ac!.state

    const after = removeNode(s, b.node.id)
    expect(after.beams.size).toBe(1)
    expect(findBeamBetween(after, a.node.id, c.node.id)).toBeDefined()
    expect(findBeamBetween(after, a.node.id, b.node.id)).toBeUndefined()
  })

  it('is a no-op returning the same state ref for an unknown id', () => {
    const after = removeNode(state, 'nonexistent')
    expect(after).toBe(state)
  })
})

describe('moveNode', () => {
  it('deep-clones the moved node so the source node is not mutated', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(1, 0, 0))
    s = b.state
    const ab = addBeam(s, a.node.id, b.node.id)
    s = ab!.state

    const newPos = new THREE.Vector3(5, 5, 5)
    const after = moveNode(s, a.node.id, newPos)

    const srcNode = s.nodes.get(a.node.id)!
    expect(srcNode.position.equals(new THREE.Vector3(0, 0, 0))).toBe(true)
    const movedNode = after.nodes.get(a.node.id)!
    expect(movedNode.position.equals(newPos)).toBe(true)
    expect(movedNode).not.toBe(srcNode)
  })

  it('recalculates restLength of connected beams to the new distance', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(3, 0, 0))
    s = b.state
    const ab = addBeam(s, a.node.id, b.node.id)
    s = ab!.state
    const beamId = ab!.beam.id

    const after = moveNode(s, a.node.id, new THREE.Vector3(6, 0, 0))
    expect(after.beams.get(beamId)!.restLength).toBeCloseTo(3, 10)
  })

  it('does not change restLength of beams not connected to the moved node', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(2, 0, 0))
    s = b.state
    const c = addNode(s, new THREE.Vector3(4, 0, 0))
    s = c.state
    const ab = addBeam(s, a.node.id, b.node.id)
    s = ab!.state
    const bc = addBeam(s, b.node.id, c.node.id)
    s = bc!.state
    const bcId = bc!.beam.id

    const after = moveNode(s, a.node.id, new THREE.Vector3(9, 9, 9))
    expect(after.beams.get(bcId)!.restLength).toBeCloseTo(2, 10)
  })

  it('is a no-op returning the same state ref for an unknown id', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    expect(moveNode(s, 'nonexistent', new THREE.Vector3(1, 1, 1))).toBe(s)
  })

  it('returns the same state ref when the position is unchanged', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(1, 2, 3))
    s = a.state
    expect(moveNode(s, a.node.id, new THREE.Vector3(1, 2, 3))).toBe(s)
  })
})

describe('moveNodes', () => {
  it('moves multiple nodes to their given targets without mutating the source', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(1, 0, 0))
    s = b.state

    const moves = new Map<string, THREE.Vector3>()
    moves.set(a.node.id, new THREE.Vector3(5, 5, 5))
    moves.set(b.node.id, new THREE.Vector3(6, 6, 6))
    const after = moveNodes(s, moves)

    expect(s.nodes.get(a.node.id)!.position.equals(new THREE.Vector3(0, 0, 0))).toBe(true)
    expect(s.nodes.get(b.node.id)!.position.equals(new THREE.Vector3(1, 0, 0))).toBe(true)
    expect(after.nodes.get(a.node.id)!.position.equals(new THREE.Vector3(5, 5, 5))).toBe(true)
    expect(after.nodes.get(b.node.id)!.position.equals(new THREE.Vector3(6, 6, 6))).toBe(true)
  })

  it('recalculates restLength of beams between two moved nodes', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(3, 0, 0))
    s = b.state
    const ab = addBeam(s, a.node.id, b.node.id)
    s = ab!.state
    const beamId = ab!.beam.id
    expect(s.beams.get(beamId)!.restLength).toBeCloseTo(3, 10)

    const moves = new Map<string, THREE.Vector3>()
    moves.set(a.node.id, new THREE.Vector3(0, 0, 0))
    moves.set(b.node.id, new THREE.Vector3(6, 0, 0))
    const after = moveNodes(s, moves)
    expect(after.beams.get(beamId)!.restLength).toBeCloseTo(6, 10)
  })

  it('recalculates restLength of beams connecting a moved and an unmoved node', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(3, 0, 0))
    s = b.state
    const c = addNode(s, new THREE.Vector3(6, 0, 0))
    s = c.state
    const ab = addBeam(s, a.node.id, b.node.id)
    s = ab!.state
    const bc = addBeam(s, b.node.id, c.node.id)
    s = bc!.state
    const abId = ab!.beam.id
    const bcId = bc!.beam.id

    const moves = new Map<string, THREE.Vector3>()
    moves.set(b.node.id, new THREE.Vector3(3, 4, 0))
    const after = moveNodes(s, moves)

    expect(after.beams.get(abId)!.restLength).toBeCloseTo(5, 10)
    expect(after.beams.get(bcId)!.restLength).toBeCloseTo(5, 10)
  })

  it('does not change restLength of beams between two unmoved nodes', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(1, 0, 0))
    s = b.state
    const c = addNode(s, new THREE.Vector3(3, 0, 0))
    s = c.state
    const d = addNode(s, new THREE.Vector3(5, 0, 0))
    s = d.state
    const cd = addBeam(s, c.node.id, d.node.id)
    s = cd!.state
    const cdId = cd!.beam.id

    const moves = new Map<string, THREE.Vector3>()
    moves.set(a.node.id, new THREE.Vector3(9, 9, 9))
    moves.set(b.node.id, new THREE.Vector3(8, 8, 8))
    const after = moveNodes(s, moves)

    expect(after.beams.get(cdId)!.restLength).toBeCloseTo(2, 10)
  })

  it('is a no-op returning the same state ref for an empty moves map', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    expect(moveNodes(s, new Map())).toBe(s)
  })

  it('is a no-op returning the same state ref when no node actually moves', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(1, 1, 1))
    s = a.state
    const moves = new Map<string, THREE.Vector3>()
    moves.set(a.node.id, new THREE.Vector3(1, 1, 1))
    expect(moveNodes(s, moves)).toBe(s)
  })

  it('skips unknown node ids without affecting the result', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const moves = new Map<string, THREE.Vector3>()
    moves.set('nonexistent', new THREE.Vector3(9, 9, 9))
    moves.set(a.node.id, new THREE.Vector3(2, 2, 2))
    const after = moveNodes(s, moves)
    expect(after.nodes.get(a.node.id)!.position.equals(new THREE.Vector3(2, 2, 2))).toBe(true)
  })

  it('deep-clones moved nodes so source nodes are untouched', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const moves = new Map<string, THREE.Vector3>()
    moves.set(a.node.id, new THREE.Vector3(1, 0, 0))
    const after = moveNodes(s, moves)
    const movedNode = after.nodes.get(a.node.id)!

    expect(movedNode).not.toBe(s.nodes.get(a.node.id)!)
    expect(movedNode.position).not.toBe(s.nodes.get(a.node.id)!.position)
  })
})

describe('removeBeam', () => {
  it('removes just that beam and leaves nodes intact', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(1, 0, 0))
    s = b.state
    const ab = addBeam(s, a.node.id, b.node.id)
    s = ab!.state

    const after = removeBeam(s, ab!.beam.id)
    expect(after.beams.size).toBe(0)
    expect(after.nodes.size).toBe(2)
  })

  it('is a no-op returning same state for an unknown id', () => {
    const after = removeBeam(state, 'nope')
    expect(after).toBe(state)
  })
})

describe('clear', () => {
  it('returns an empty state', () => {
    let s = createNetworkState()
    const a = addNode(s, new THREE.Vector3(0, 0, 0))
    s = a.state
    const b = addNode(s, new THREE.Vector3(1, 0, 0))
    s = b.state
    const ab = addBeam(s, a.node.id, b.node.id)
    s = ab!.state

    const cleared = clear(s)
    expect(cleared.nodes.size).toBe(0)
    expect(cleared.beams.size).toBe(0)
    // original is not mutated
    expect(s.nodes.size).toBe(2)
    expect(s.beams.size).toBe(1)
  })
})

describe('getTotalMass', () => {
  it('sums mass of all nodes', () => {
    let s = createNetworkState()
    s = addNode(s, new THREE.Vector3(0, 0, 0), 2).state
    s = addNode(s, new THREE.Vector3(1, 0, 0), 3).state
    s = addNode(s, new THREE.Vector3(2, 0, 0), 5, true).state
    expect(getTotalMass(s)).toBe(10)
  })

  it('returns 0 for an empty network', () => {
    expect(getTotalMass(state)).toBe(0)
  })
})

describe('cloneNetworkState', () => {
  it('deep-clones nodes and beams so mutating the clone does not affect the source', () => {
    let s = createNetworkState()
    const rn1 = addNode(s, new THREE.Vector3(0, 1, 0), 2)
    s = rn1.state
    const rn2 = addNode(s, new THREE.Vector3(0, 2, 0), 3, true)
    s = rn2.state
    const rb = addBeam(s, rn1.node.id, rn2.node.id)
    s = rb!.state

    const clone = cloneNetworkState(s)
    const cloneNode = clone.nodes.get(rn1.node.id)!
    cloneNode.position.set(9, 9, 9)
    cloneNode.velocity.set(5, 5, 5)
    clone.beams.get(rb!.beam.id)!.currentStress = 123.45

    const srcNode = s.nodes.get(rn1.node.id)!
    expect(srcNode.position.equals(new THREE.Vector3(0, 1, 0))).toBe(true)
    expect(srcNode.velocity.length()).toBe(0)
    expect(s.beams.get(rb!.beam.id)!.currentStress).toBe(0)
  })

  it('preserves mass, isFixed, and beam scalar fields', () => {
    let s = createNetworkState()
    const rn1 = addNode(s, new THREE.Vector3(0, 0, 0), 7, true)
    s = rn1.state
    const rn2 = addNode(s, new THREE.Vector3(2, 0, 0))
    s = rn2.state
    const rb = addBeam(s, rn1.node.id, rn2.node.id)
    s = rb!.state

    const clone = cloneNetworkState(s)
    const n1 = clone.nodes.get(rn1.node.id)!
    const n2 = clone.nodes.get(rn2.node.id)!
    expect(n1.mass).toBe(7)
    expect(n1.isFixed).toBe(true)
    expect(n2.isFixed).toBe(false)
    const beam = clone.beams.get(rb!.beam.id)!
    expect(beam.restLength).toBeCloseTo(2, 10)
    expect(beam.stiffness).toBe(1000)
    expect(beam.damping).toBe(10)
  })
})

describe('resetKinematics', () => {
  it('zeros velocities and forces and currentStress without moving positions', () => {
    let s = createNetworkState()
    const rn1 = addNode(s, new THREE.Vector3(0, 5, 0), 2)
    s = rn1.state
    const rn2 = addNode(s, new THREE.Vector3(0, 6, 0))
    s = rn2.state
    const rb = addBeam(s, rn1.node.id, rn2.node.id)
    s = rb!.state

    const n1 = s.nodes.get(rn1.node.id)!
    n1.velocity.set(2, 2, 2)
    n1.force.set(3, 3, 3)
    s.beams.get(rb!.beam.id)!.currentStress = 999

    const reset = resetKinematics(s)
    const rn1After = reset.nodes.get(rn1.node.id)!
    expect(rn1After.position.equals(new THREE.Vector3(0, 5, 0))).toBe(true)
    expect(rn1After.velocity.length()).toBe(0)
    expect(rn1After.force.length()).toBe(0)
    expect(reset.beams.get(rb!.beam.id)!.currentStress).toBe(0)
  })

  it('returns a fully detached clone (original left untouched)', () => {
    let s = createNetworkState()
    const rn1 = addNode(s, new THREE.Vector3(0, 0, 0))
    s = rn1.state
    const n1 = s.nodes.get(rn1.node.id)!
    n1.velocity.set(1, 2, 3)

    const reset = resetKinematics(s)
    const resetN1 = reset.nodes.get(rn1.node.id)!
    resetN1.velocity.set(9, 9, 9)

    expect(n1.velocity.equals(new THREE.Vector3(1, 2, 3))).toBe(true)
  })
})
