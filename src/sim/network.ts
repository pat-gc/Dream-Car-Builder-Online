import * as THREE from 'three'
import type { Beam3D, Node3D } from '../types/nodeGraph'
import type {
  RigidMount,
  RigidMountType,
  TransmissionLink,
  WheelPart,
} from '../types/vehicleParts'

export type SymmetryAxis = 'X' | 'Z'

export interface NetworkState {
  nodes: Map<string, Node3D>
  beams: Map<string, Beam3D>
  // Step 16a — vehicle parts (same pure-functional Map pattern as nodes/beams).
  wheels: Map<string, WheelPart>
  rigidMounts: Map<string, RigidMount>
  transmissions: Map<string, TransmissionLink>
}

let idCounter = 0
const nextId = (): string => `n${(idCounter++).toString(36)}`

export const DEFAULT_MASS = 1
export const DEFAULT_STIFFNESS = 1000
export const DEFAULT_DAMPING = 10
export const DEFAULT_MAX_STRESS = Infinity
export const DEFAULT_MERGE_THRESHOLD = 0.05

export const DEFAULT_WHEEL_RADIUS = 0.5
export const DEFAULT_WHEEL_MASS = 5
export const DEFAULT_ENGINE_MASS = 40
export const DEFAULT_SEAT_MASS = 5
export const DEFAULT_TRANSMISSION_MASS = 2

export function createNetworkState(): NetworkState {
  return {
    nodes: new Map(),
    beams: new Map(),
    wheels: new Map(),
    rigidMounts: new Map(),
    transmissions: new Map(),
  }
}

export function clear(_state: NetworkState): NetworkState {
  return createNetworkState()
}

function cloneState(state: NetworkState): NetworkState {
  return {
    nodes: new Map(state.nodes),
    beams: new Map(state.beams),
    wheels: new Map(state.wheels),
    rigidMounts: new Map(state.rigidMounts),
    transmissions: new Map(state.transmissions),
  }
}

export function cloneNetworkState(state: NetworkState): NetworkState {
  const nodes = new Map<string, Node3D>()
  for (const [id, node] of state.nodes) {
    nodes.set(id, {
      id: node.id,
      position: node.position.clone(),
      velocity: node.velocity.clone(),
      force: node.force.clone(),
      mass: node.mass,
      isFixed: node.isFixed,
    })
  }
  const beams = new Map<string, Beam3D>()
  for (const [id, beam] of state.beams) {
    beams.set(id, { ...beam })
  }
  const wheels = new Map<string, WheelPart>()
  for (const [id, w] of state.wheels) {
    wheels.set(id, { ...w })
  }
  const rigidMounts = new Map<string, RigidMount>()
  for (const [id, m] of state.rigidMounts) {
    rigidMounts.set(id, {
      ...m,
      nodeIds: [m.nodeIds[0], m.nodeIds[1], m.nodeIds[2]],
      restLengths: [m.restLengths[0], m.restLengths[1], m.restLengths[2]],
    })
  }
  const transmissions = new Map<string, TransmissionLink>()
  for (const [id, t] of state.transmissions) {
    transmissions.set(id, { ...t })
  }
  return { nodes, beams, wheels, rigidMounts, transmissions }
}

export function resetKinematics(state: NetworkState): NetworkState {
  const next = cloneNetworkState(state)
  for (const node of next.nodes.values()) {
    node.velocity.set(0, 0, 0)
    node.force.set(0, 0, 0)
  }
  for (const beam of next.beams.values()) {
    beam.currentStress = 0
  }
  return next
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

  // Step 16a — cascade-delete vehicle parts that reference this node. All
  // three part types attach to real structural nodes, so all must be cleaned.
  for (const [id, w] of next.wheels) {
    if (w.nodeAId === nodeId || w.nodeBId === nodeId) {
      next.wheels.delete(id)
    }
  }
  for (const [id, m] of next.rigidMounts) {
    if (m.nodeIds[0] === nodeId || m.nodeIds[1] === nodeId || m.nodeIds[2] === nodeId) {
      next.rigidMounts.delete(id)
    }
  }
  for (const [id, t] of next.transmissions) {
    if (t.nodeAId === nodeId || t.nodeBId === nodeId) {
      next.transmissions.delete(id)
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

export function moveNode(
  state: NetworkState,
  nodeId: string,
  position: THREE.Vector3,
): NetworkState {
  const node = state.nodes.get(nodeId)
  if (node === undefined) return state
  if (node.position.distanceToSquared(position) < 1e-18) return state

  const next = cloneState(state)
  const moved: Node3D = {
    ...node,
    position: position.clone(),
    velocity: node.velocity.clone(),
    force: node.force.clone(),
  }
  next.nodes.set(nodeId, moved)

  for (const [beamId, beam] of next.beams) {
    if (beam.nodeAId !== nodeId && beam.nodeBId !== nodeId) {
      continue
    }
    const a = next.nodes.get(beam.nodeAId)
    const b = next.nodes.get(beam.nodeBId)
    if (a === undefined || b === undefined) {
      continue
    }
    const updated: Beam3D = { ...beam, restLength: a.position.distanceTo(b.position) }
    next.beams.set(beamId, updated)
  }

  return next
}

export function moveNodes(
  state: NetworkState,
  moves: Map<string, THREE.Vector3>,
): NetworkState {
  if (moves.size === 0) return state

  const applied = new Map<string, THREE.Vector3>()
  for (const [nodeId, targetPos] of moves) {
    if (nodeId === null || nodeId === undefined) continue
    const srcNode = state.nodes.get(nodeId)
    if (srcNode === undefined) continue
    if (srcNode.position.distanceToSquared(targetPos) < 1e-18) continue
    applied.set(nodeId, targetPos)
  }

  if (applied.size === 0) return state

  const next = cloneState(state)
  for (const [nodeId, targetPos] of applied) {
    const srcNode = state.nodes.get(nodeId) as Node3D
    const moved: Node3D = {
      ...srcNode,
      position: targetPos.clone(),
      velocity: srcNode.velocity.clone(),
      force: srcNode.force.clone(),
    }
    next.nodes.set(nodeId, moved)
  }

  for (const [beamId, beam] of next.beams) {
    if (!applied.has(beam.nodeAId) && !applied.has(beam.nodeBId)) {
      continue
    }
    const a = next.nodes.get(beam.nodeAId)
    const b = next.nodes.get(beam.nodeBId)
    if (a === undefined || b === undefined) {
      continue
    }
    const updated: Beam3D = { ...beam, restLength: a.position.distanceTo(b.position) }
    next.beams.set(beamId, updated)
  }

  return next
}

export function mirrorPosition(
  position: THREE.Vector3,
  axis: SymmetryAxis,
): THREE.Vector3 {
  if (axis === 'X') {
    return new THREE.Vector3(-position.x, position.y, position.z)
  }
  return new THREE.Vector3(position.x, position.y, -position.z)
}

export interface AddBeamWithMirrorResult {
  state: NetworkState
  originalBeamId: string | null
  mirrorBeamId: string | null
  startNodeId: string
  endNodeId: string
}

export function addBeamWithMirror(
  state: NetworkState,
  startPos: THREE.Vector3,
  endPos: THREE.Vector3,
  axis: SymmetryAxis,
  applyMirror: boolean,
  mergeThreshold: number = DEFAULT_MERGE_THRESHOLD,
): AddBeamWithMirrorResult {
  let working = state

  // Original start node (find-or-create).
  let res = findOrCreateNode(working, startPos, mergeThreshold)
  working = res.state
  const startNodeId = res.nodeId

  // Original end node (find-or-create).
  res = findOrCreateNode(working, endPos, mergeThreshold)
  working = res.state
  const endNodeId = res.nodeId

  // Original beam (skip self-loops / duplicates; null => nothing created).
  let originalBeamId: string | null = null
  if (startNodeId !== endNodeId) {
    const beam = addBeam(working, startNodeId, endNodeId)
    if (beam !== null) {
      originalBeamId = beam.beam.id
      working = beam.state
    }
  }

  if (!applyMirror) {
    return {
      state: working,
      originalBeamId,
      mirrorBeamId: null,
      startNodeId,
      endNodeId,
    }
  }

  // Skip the mirrored beam if the original beam already lies across the
  // mirror plane (its endpoints are symmetric to each other), so we don't
  // create a redundant duplicate on top of itself.
  const sqThreshold = mergeThreshold * mergeThreshold
  const mirrorStart = mirrorPosition(startPos, axis)
  const mirrorEnd = mirrorPosition(endPos, axis)
  const startMirrorsEnd = mirrorStart.distanceToSquared(endPos) <= sqThreshold
  const endMirrorsStart = mirrorEnd.distanceToSquared(startPos) <= sqThreshold
  if (startMirrorsEnd && endMirrorsStart) {
    return {
      state: working,
      originalBeamId,
      mirrorBeamId: null,
      startNodeId,
      endNodeId,
    }
  }

  // Mirror endpoints (each origin endpoint mirrored). An endpoint that lies
  // on the mirror plane (its axis coordinate ~0) mirrors onto itself, so
  // findOrCreateNode merges to the same node id -> shared centerline node.
  res = findOrCreateNode(working, mirrorStart, mergeThreshold)
  working = res.state
  const mStartId = res.nodeId
  res = findOrCreateNode(working, mirrorEnd, mergeThreshold)
  working = res.state
  const mEndId = res.nodeId

  let mirrorBeamId: string | null = null
  if (mStartId !== mEndId) {
    // Don't re-create a beam that already links these (mirror of an existing
    // structure, or the user already drew it by hand).
    if (findBeamBetween(working, mStartId, mEndId) === undefined) {
      const mBeam = addBeam(working, mStartId, mEndId)
      if (mBeam !== null) {
        mirrorBeamId = mBeam.beam.id
        working = mBeam.state
      }
    }
  }

  return {
    state: working,
    originalBeamId,
    mirrorBeamId,
    startNodeId,
    endNodeId,
  }
}

export function findNearestNode(
  state: NetworkState,
  position: THREE.Vector3,
  excludeIds: Set<string>,
  mergeThreshold: number = DEFAULT_MERGE_THRESHOLD,
): string | null {
  const sqThreshold = mergeThreshold * mergeThreshold
  let nearestId: string | null = null
  let nearestSq = sqThreshold
  for (const [id, node] of state.nodes) {
    if (excludeIds.has(id)) continue
    const sq = node.position.distanceToSquared(position)
    if (sq <= nearestSq) {
      nearestSq = sq
      nearestId = id
    }
  }
  return nearestId
}

export interface MergeNodeResult {
  state: NetworkState
  survivingNodeId: string
  removedBeamIds: string[]
}

export function mergeNodeIntoTarget(
  state: NetworkState,
  sourceId: string,
  targetId: string,
): MergeNodeResult {
  if (sourceId === targetId) {
    const node = state.nodes.get(sourceId)
    if (node === undefined) return { state, survivingNodeId: sourceId, removedBeamIds: [] }
    return { state, survivingNodeId: sourceId, removedBeamIds: [] }
  }

  const srcNode = state.nodes.get(sourceId)
  const tgtNode = state.nodes.get(targetId)
  if (srcNode === undefined || tgtNode === undefined) {
    return { state, survivingNodeId: srcNode === undefined ? targetId : sourceId, removedBeamIds: [] }
  }

  const next = cloneState(state)
  const removedBeamIds: string[] = []

  // Repoint every beam that referenced the source to the target. Drop a beam
  // if it would become a self-loop (both ends == target) or a duplicate of an
  // already-existing beam.
  for (const [beamId, beam] of next.beams) {
    if (beam.nodeAId !== sourceId && beam.nodeBId !== sourceId) continue

    let aId = beam.nodeAId
    let bId = beam.nodeBId
    if (aId === sourceId) aId = targetId
    if (bId === sourceId) bId = targetId

    if (aId === bId) {
      removedBeamIds.push(beamId)
      next.beams.delete(beamId)
      continue
    }

    if (findBeamBetween(next, aId, bId) !== undefined) {
      removedBeamIds.push(beamId)
      next.beams.delete(beamId)
      continue
    }

    const updated: Beam3D = { ...beam, nodeAId: aId, nodeBId: bId }
    next.beams.set(beamId, updated)
  }

  next.nodes.delete(sourceId)

  // Recalculate restLength for every beam that now touches the target at the
  // target's final position.
  for (const [beamId, beam] of next.beams) {
    if (beam.nodeAId !== targetId && beam.nodeBId !== targetId) continue
    const a = next.nodes.get(beam.nodeAId)
    const b = next.nodes.get(beam.nodeBId)
    if (a === undefined || b === undefined) continue
    const updated: Beam3D = { ...beam, restLength: a.position.distanceTo(b.position) }
    next.beams.set(beamId, updated)
  }

  return { state: next, survivingNodeId: targetId, removedBeamIds }
}

export interface CommitDraggedMovesEntry {
  sourceId: string
  targetPos: THREE.Vector3
}

export interface CommitDraggedMovesResult {
  state: NetworkState
  movedOrDefaultIds: string[]
  survivingNodeIds: string[]
}

export function commitDraggedMoves(
  state: NetworkState,
  moves: CommitDraggedMovesEntry[],
  mergeThreshold: number = DEFAULT_MERGE_THRESHOLD,
): CommitDraggedMovesResult {
  if (moves.length === 0) {
    return { state, movedOrDefaultIds: [], survivingNodeIds: [] }
  }

  // Verify all source ids exist; bail to no-op if any is missing entirely.
  for (const m of moves) {
    if (state.nodes.get(m.sourceId) === undefined) {
      return { state, movedOrDefaultIds: [], survivingNodeIds: [] }
    }
  }

  let working = state
  const movedOrDefaultIds: string[] = []
  const survivingNodeIds: string[] = []
  const consumedSurvivors = new Set<string>()

  for (const m of moves) {
    const { sourceId, targetPos } = m

    // Look for an existing node (other than this source) within merge
    // threshold of the drop position, AND not already consumed as the
    // survivor of a prior move in this same commit (so two dragged nodes
    // dropped onto the same stationary node both merge into it).
    const exclude = new Set<string>()
    exclude.add(sourceId)
    for (const s of consumedSurvivors) exclude.add(s)
    // Also exclude sources that this commit will move/merge away from their
    // current positions (so we don't accidentally merge onto a moving node
    // whose final position differs from where it currently sits).
    for (const other of moves) exclude.add(other.sourceId)

    const survivor = findNearestNode(working, targetPos, exclude, mergeThreshold)
    if (survivor !== null) {
      const mergeResult = mergeNodeIntoTarget(working, sourceId, survivor)
      working = mergeResult.state
      survivingNodeIds.push(survivor)
      consumedSurvivors.add(survivor)
      movedOrDefaultIds.push(sourceId)
      continue
    }

    // No merge target: move the node to the dropped position.
    const moved = moveNode(working, sourceId, targetPos)
    working = moved
    movedOrDefaultIds.push(sourceId)
    survivingNodeIds.push(sourceId)
  }

  // Recalculate restLength for every beam touching any node whose position
  // may have changed through the above moves/merges. This catches beams that
  // connect a moved/merged node to an unmoved node.
  if (working !== state) {
    const affected = new Set<string>()
    for (let i = 0; i < moves.length; i++) {
      affected.add(survivingNodeIds[i])
    }
    for (const [beamId, beam] of working.beams) {
      if (!affected.has(beam.nodeAId) && !affected.has(beam.nodeBId)) continue
      const a = working.nodes.get(beam.nodeAId)
      const b = working.nodes.get(beam.nodeBId)
      if (a === undefined || b === undefined) continue
      const updated: Beam3D = { ...beam, restLength: a.position.distanceTo(b.position) }
      working.beams.set(beamId, updated)
    }
  }

  return { state: working, movedOrDefaultIds, survivingNodeIds }
}

// ---------------------------------------------------------------------------
// Step 16a — Vehicle parts network manager functions.
// All pure: return a new cloned state (or null on validation failure), never
// mutate. Parts attach to existing structural nodes; findOrCreateNode lives at
// the interaction layer (like addBeam), so these validate ids only.
// ---------------------------------------------------------------------------

export function addWheelPart(
  state: NetworkState,
  nodeAId: string,
  nodeBId: string,
  wheelRadius: number = DEFAULT_WHEEL_RADIUS,
  mass: number = DEFAULT_WHEEL_MASS,
): { state: NetworkState; part: WheelPart } | null {
  if (nodeAId === nodeBId) return null
  const a = state.nodes.get(nodeAId)
  const b = state.nodes.get(nodeBId)
  if (a === undefined || b === undefined) return null

  const next = cloneState(state)
  const id = nextId()
  const part: WheelPart = {
    id,
    nodeAId,
    nodeBId,
    restLength: a.position.distanceTo(b.position),
    wheelRadius,
    mass,
  }
  next.wheels.set(id, part)
  return { state: next, part }
}

export function addRigidMount(
  state: NetworkState,
  type: RigidMountType,
  nodeIds: [string, string, string],
  mass: number = type === 'ENGINE' ? DEFAULT_ENGINE_MASS : DEFAULT_SEAT_MASS,
): { state: NetworkState; part: RigidMount } | null {
  // Require three distinct node ids.
  if (
    nodeIds[0] === nodeIds[1] ||
    nodeIds[0] === nodeIds[2] ||
    nodeIds[1] === nodeIds[2]
  ) {
    return null
  }
  const n0 = state.nodes.get(nodeIds[0])
  const n1 = state.nodes.get(nodeIds[1])
  const n2 = state.nodes.get(nodeIds[2])
  if (n0 === undefined || n1 === undefined || n2 === undefined) return null

  // Constraint: only one ENGINE and one SEAT in the network at a time.
  for (const existing of state.rigidMounts.values()) {
    if (existing.type === type) return null
  }

  const next = cloneState(state)
  const id = nextId()
  const part: RigidMount = {
    id,
    type,
    nodeIds: [nodeIds[0], nodeIds[1], nodeIds[2]],
    restLengths: [
      n0.position.distanceTo(n1.position),
      n1.position.distanceTo(n2.position),
      n2.position.distanceTo(n0.position),
    ],
    mass,
  }
  next.rigidMounts.set(id, part)
  return { state: next, part }
}

export function addTransmissionLink(
  state: NetworkState,
  nodeAId: string,
  nodeBId: string,
  mass: number = DEFAULT_TRANSMISSION_MASS,
): { state: NetworkState; part: TransmissionLink } | null {
  if (nodeAId === nodeBId) return null
  const a = state.nodes.get(nodeAId)
  const b = state.nodes.get(nodeBId)
  if (a === undefined || b === undefined) return null

  // No restLength / no physics constraint — purely a logical link. Multiple
  // transmission links are allowed (no uniqueness constraint).
  const next = cloneState(state)
  const id = nextId()
  const part: TransmissionLink = { id, nodeAId, nodeBId, mass }
  next.transmissions.set(id, part)
  return { state: next, part }
}

export function removePart(
  state: NetworkState,
  partId: string,
): NetworkState {
  // Search across all three part maps; remove at most one. Does NOT touch the
  // underlying structural nodes (parts are layered on the node graph).
  if (state.wheels.has(partId)) {
    const next = cloneState(state)
    next.wheels.delete(partId)
    return next
  }
  if (state.rigidMounts.has(partId)) {
    const next = cloneState(state)
    next.rigidMounts.delete(partId)
    return next
  }
  if (state.transmissions.has(partId)) {
    const next = cloneState(state)
    next.transmissions.delete(partId)
    return next
  }
  return state
}
