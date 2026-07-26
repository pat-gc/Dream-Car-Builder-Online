import * as THREE from 'three'

import {
  type NodeBeamNetworkState,
  createNetwork,
  addNode,
  addBeam,
  getTotalMass,
  getBeamTension,
  getBeamStress,
  removeNode,
  removeBeam,
  isBeamBroken,
} from '../sim/network'

describe('NodeBeamNetwork', () => {
  let state: NodeBeamNetworkState

  beforeEach(() => {
    state = createNetwork()
  })

  test('addNode assigns incremental IDs and stores values', () => {
    const n0 = addNode(state, [1, 2, 3], { mass: 2, isFixed: true })
    const n1 = addNode(state, new THREE.Vector3(4, 5, 6), {
      velocity: new THREE.Vector3(0.1, 0.2, 0.3),
    })
    expect(n0.id).toBe(0)
    expect(n1.id).toBe(1)
    expect(state.nodes[0].mass).toBe(2)
    expect(state.nodes[0].isFixed).toBe(true)
    expect(state.nodes[1].isFixed).toBe(false)
    expect(state.nodes[1].velocity).toEqual(
      new THREE.Vector3(0.1, 0.2, 0.3),
    )
  })

  test('addNode clones input vectors', () => {
    const input = new THREE.Vector3(1, 2, 3)
    const node = addNode(state, input)
    node.position.set(9, 9, 9)
    expect(input.x).toBe(1)
  })

  test('addNode defaults mass to 1 and zero vectors', () => {
    const node = addNode(state, [0, 0, 0])
    expect(node.mass).toBe(1)
    expect(node.isFixed).toBe(false)
    expect(node.forceAccumulator).toEqual(new THREE.Vector3())
  })

  test('addBeam connects two node IDs and reports rest length and connect', () => {
    const a = addNode(state, [0, 0, 0])
    const b = addNode(state, [3, 4, 0])
    const beam = addBeam(state, a.id, b.id, { stiffness: 500 })
    expect(beam).not.toBeNull()
    expect(beam!.nodeAId).toBe(a.id)
    expect(beam!.nodeBId).toBe(b.id)
    expect(beam!.restLength).toBeCloseTo(5)
    expect(beam!.stiffness).toBe(500)
    expect(beam).not.toBeNull()
  })

  test('addBeam rejects unknown node IDs', () => {
    const a = addNode(state, [0, 0, 0])
    expect(addBeam(state, a.id, 999)).toBeNull()
    expect(addBeam(state, 999, a.id)).toBeNull()
    expect(addBeam(state, 999, 888)).toBeNull()
  })

  test('addBeam rejects self-connections', () => {
    const a = addNode(state, [0, 0, 0])
    expect(addBeam(state, a.id, a.id)).toBeNull()
  })

  test('addBeam accepts explicit restLength override', () => {
    const a = addNode(state, [0, 0, 0])
    const b = addNode(state, [3, 4, 0])
    const beam = addBeam(state, a.id, b.id, { restLength: 10 })
    expect(beam!.restLength).toBe(10)
  })

  test('addBeam accepts explicit restLength override and connects', () => {
    const a = addNode(state, [0, 0, 0])
    const b = addNode(state, [3, 4, 0])
    const beam = addBeam(state, a.id, b.id, { restLength: 10 })
    expect(beam!.restLength).toBe(10)
    expect(beam).not.toBeNull()
  })

  test('getTotalMass sums all node masses', () => {
    addNode(state, [0, 0, 0], { mass: 1.5 })
    addNode(state, [1, 0, 0], { mass: 2.5 })
    addNode(state, [2, 0, 0], { mass: 3.0 })
    expect(getTotalMass(state)).toBeCloseTo(7.0)
  })

  test('getTotalMass is 0 for empty network', () => {
    expect(getTotalMass(state)).toBe(0)
  })

  test('getBeamTension reports stretched/compressed tension', () => {
    const a = addNode(state, [0, 0, 0], { isFixed: true })
    const b = addNode(state, [5, 0, 0])
    const beam = addBeam(state, a.id, b.id, { stiffness: 1000 })
    expect(beam!.restLength).toBeCloseTo(5)
    const tension = getBeamTension(state, beam!)
    expect(tension).toBeCloseTo(0)
    b.position.set(7, 0, 0)
    expect(getBeamTension(state, beam!)).toBeCloseTo(2000)
    b.position.set(4, 0, 0)
    expect(getBeamTension(state, beam!)).toBeCloseTo(-1000)
  })

  test('getBeamStress reports absolute value', () => {
    const a = addNode(state, [0, 0, 0], { isFixed: true })
    const b = addNode(state, [5, 0, 0])
    const beam = addBeam(state, a.id, b.id, { stiffness: 1000 })
    b.position.set(4, 0, 0)
    expect(getBeamStress(state, beam!)).toBeCloseTo(1000)
  })

  test('isBeamBroken returns false below and true above yield limit', () => {
    const a = addNode(state, [0, 0, 0], { isFixed: true })
    const b = addNode(state, [5, 0, 0])
    const beam = addBeam(state, a.id, b.id, {
      stiffness: 1000,
      maxStress: 1500,
    })
    expect(isBeamBroken(state, beam!)).toBe(false)
    b.position.set(7, 0, 0)
    expect(isBeamBroken(state, beam!)).toBe(true)
  })

  test('removeBeam deletes only target beam', () => {
    const a = addNode(state, [0, 0, 0])
    const b = addNode(state, [1, 0, 0])
    const c = addNode(state, [2, 0, 0])
    const beam1 = addBeam(state, a.id, b.id)
    const beam2 = addBeam(state, b.id, c.id)
    expect(Object.keys(state.beams)).toHaveLength(2)
    expect(removeBeam(state, beam1!.id)).toBe(true)
    expect(Object.keys(state.beams)).toHaveLength(1)
    expect(state.beams[beam2!.id]).toBeDefined()
    expect(removeBeam(state, 999)).toBe(false)
  })

  test('removeNode also removes connected beams', () => {
    const a = addNode(state, [0, 0, 0])
    const b = addNode(state, [1, 0, 0])
    const c = addNode(state, [2, 0, 0])
    addBeam(state, a.id, b.id)
    addBeam(state, b.id, c.id)
    addBeam(state, a.id, c.id)
    expect(Object.keys(state.beams)).toHaveLength(3)
    expect(removeNode(state, b.id)).toBe(true)
    expect(state.nodes[b.id]).toBeUndefined()
    expect(Object.keys(state.beams)).toHaveLength(1)
    expect(removeNode(state, 999)).toBe(false)
  })
})
