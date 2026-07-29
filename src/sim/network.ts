import * as THREE from 'three'
import type { Beam3D, Node3D } from '../types/nodeGraph'

export interface NetworkState {
  nodes: Map<string, Node3D>
  beams: Map<string, Beam3D>
}

let idCounter = 0
const nextId = (): string => `n${(idCounter++).toString(36)}`

export const DEFAULT_MASS = 1
export const DEFAULT_STIFFNESS = 1000
export const DEFAULT_DAMPING = 10
export const DEFAULT_MAX_STRESS = Infinity
export const DEFAULT_MERGE_THRESHOLD = 0.05

export function createNetworkState(): NetworkState {
  return { nodes: new Map(), beams: new Map() }
}

export function clear(_state: NetworkState): NetworkState {
  return createNetworkState()
}

function cloneState(state: NetworkState): NetworkState {
  return {
    nodes: new Map(state.nodes),
    beams: new Map(state.beams),
  }
}

export function addNode(
  state: NetworkState,
  position: THREE.Vector3,
  mass: number = DEFAULT_MASS,
  isFixed: boolean = false,
): { state: NetworkState; node: Node3D } {
  const next = cloneState(state)
  const id = nextId()
  const node: Node3D = {
    id,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    force: new THREE.Vector3(),
    mass,
    isFixed,
  }
  next.nodes.set(id, node)
  return { state: next, node }
}

export function addBeam(
  state: NetworkState,
  nodeAId: string,
  nodeBId: string,
  stiffness: number = DEFAULT_STIFFNESS,
  damping: number = DEFAULT_DAMPING,
): { state: NetworkState; beam: Beam3D } | null {
  if (nodeAId === nodeBId) return null

  const a = state.nodes.get(nodeAId)
  const b = state.nodes.get(nodeBId)
  if (a === undefined || b === undefined) return null

  if (findBeamBetween(state, nodeAId, nodeBId) !== undefined) return null

  const next = cloneState(state)
  const id = nextId()
  const beam: Beam3D = {
    id,
    nodeAId,
    nodeBId,
    restLength: a.position.distanceTo(b.position),
    stiffness,
    damping,
    maxStress: DEFAULT_MAX_STRESS,
    currentStress: 0,
  }
  next.beams.set(id, beam)
  return { state: next, beam }
}

export function findOrCreateNode(
  state: NetworkState,
  position: THREE.Vector3,
  mergeThreshold: number = DEFAULT_MERGE_THRESHOLD,
): { state: NetworkState; nodeId: string } {
  const sqThreshold = mergeThreshold * mergeThreshold
  for (const node of state.nodes.values()) {
    if (node.position.distanceToSquared(position) <= sqThreshold) {
      return { state, nodeId: node.id }
    }
  }

  const { state: next, node } = addNode(state, position)
  return { state: next, nodeId: node.id }
}

export function removeNode(
  state: NetworkState,
  nodeId: string,
): NetworkState {
  if (state.nodes.get(nodeId) === undefined) return state

  const next = cloneState(state)
  next.nodes.delete(nodeId)

  for (const [beamId, beam] of next.beams) {
    if (beam.nodeAId === nodeId || beam.nodeBId === nodeId) {
      next.beams.delete(beamId)
    }
  }
  return next
}

export function removeBeam(
  state: NetworkState,
  beamId: string,
): NetworkState {
  if (state.beams.get(beamId) === undefined) return state
  const next = cloneState(state)
  next.beams.delete(beamId)
  return next
}

export function getTotalMass(state: NetworkState): number {
  let total = 0
  for (const node of state.nodes.values()) {
    total += node.mass
  }
  return total
}

export function findBeamBetween(
  state: NetworkState,
  nodeAId: string,
  nodeBId: string,
): Beam3D | undefined {
  for (const beam of state.beams.values()) {
    const matchesForward = beam.nodeAId === nodeAId && beam.nodeBId === nodeBId
    const matchesReverse = beam.nodeAId === nodeBId && beam.nodeBId === nodeAId
    if (matchesForward || matchesReverse) return beam
  }
  return undefined
}
