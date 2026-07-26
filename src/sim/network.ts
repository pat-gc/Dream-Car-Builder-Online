import * as THREE from 'three'

export interface Node {
  id: number
  position: THREE.Vector3
  velocity: THREE.Vector3
  forceAccumulator: THREE.Vector3
  mass: number
  isFixed: boolean
}

export interface Beam {
  id: number
  nodeAId: number
  nodeBId: number
  restLength: number
  stiffness: number
  damping: number
  maxStress: number
}

export interface NodeBeamNetworkState {
  nodes: Record<number, Node>
  beams: Record<number, Beam>
  nextNodeId: number
  nextBeamId: number
}

export function createNetwork(): NodeBeamNetworkState {
  return {
    nodes: {},
    beams: {},
    nextNodeId: 0,
    nextBeamId: 0,
  }
}

export function addNode(
  state: NodeBeamNetworkState,
  position: THREE.Vector3 | [number, number, number],
  options: { mass?: number; isFixed?: boolean; velocity?: THREE.Vector3 | [number, number, number] } = {},
): Node {
  const { mass = 1, isFixed = false, velocity } = options
  const node: Node = {
    id: state.nextNodeId,
    position: Array.isArray(position) ? new THREE.Vector3(...position) : position.clone(),
    velocity: velocity
      ? (Array.isArray(velocity) ? new THREE.Vector3(...velocity) : velocity.clone())
      : new THREE.Vector3(),
    forceAccumulator: new THREE.Vector3(),
    mass,
    isFixed,
  }
  state.nodes[node.id] = node
  state.nextNodeId += 1
  return node
}

export function addBeam(
  state: NodeBeamNetworkState,
  nodeAId: number,
  nodeBId: number,
  options: {
    restLength?: number
    stiffness?: number
    damping?: number
    maxStress?: number
  } = {},
): Beam | null {
  if (!(nodeAId in state.nodes) || !(nodeBId in state.nodes)) return null
  if (nodeAId === nodeBId) return null

  const { stiffness = 1000, damping = 5, maxStress = Infinity } = options
  const nodeA = state.nodes[nodeAId]
  const nodeB = state.nodes[nodeBId]

  const restLength =
    options.restLength ?? nodeA.position.distanceTo(nodeB.position)

  const beam: Beam = {
    id: state.nextBeamId,
    nodeAId,
    nodeBId,
    restLength,
    stiffness,
    damping,
    maxStress,
  }
  state.beams[beam.id] = beam
  state.nextBeamId += 1
  return beam
}

export function getTotalMass(state: NodeBeamNetworkState): number {
  let total = 0
  for (const id in state.nodes) {
    total += state.nodes[id].mass
  }
  return total
}

export function removeBeam(state: NodeBeamNetworkState, beamId: number): boolean {
  if (!(beamId in state.beams)) return false
  delete state.beams[beamId]
  return true
}

export function removeNode(state: NodeBeamNetworkState, nodeId: number): boolean {
  if (!(nodeId in state.nodes)) return false
  delete state.nodes[nodeId]
  for (const id in state.beams) {
    const beam = state.beams[id]
    if (beam.nodeAId === nodeId || beam.nodeBId === nodeId) {
      delete state.beams[id]
    }
  }
  return true
}

export function getBeamNodes(state: NodeBeamNetworkState, beam: Beam): [Node, Node] | null {
  const nodeA = state.nodes[beam.nodeAId]
  const nodeB = state.nodes[beam.nodeBId]
  if (!nodeA || !nodeB) return null
  return [nodeA, nodeB]
}

export function getBeamStress(state: NodeBeamNetworkState, beam: Beam): number {
  const nodes = getBeamNodes(state, beam)
  if (!nodes) return 0
  const [nodeA, nodeB] = nodes
  const length = nodeA.position.distanceTo(nodeB.position)
  if (length === 0) return 0
  return Math.abs(length - beam.restLength) * beam.stiffness
}

export function isBeamBroken(state: NodeBeamNetworkState, beam: Beam): boolean {
  return getBeamStress(state, beam) > beam.maxStress
}

export function getBeamLength(state: NodeBeamNetworkState, beam: Beam): number {
  const nodes = getBeamNodes(state, beam)
  if (!nodes) return beam.restLength
  return nodes[0].position.distanceTo(nodes[1].position)
}

export function getBeamTension(state: NodeBeamNetworkState, beam: Beam): number {
  const nodes = getBeamNodes(state, beam)
  if (!nodes) return 0
  const length = nodes[0].position.distanceTo(nodes[1].position)
  return (length - beam.restLength) * beam.stiffness
}
