import { create } from 'zustand'
import * as THREE from 'three'
import {
  addBeam,
  addBeamWithMirror,
  addRigidMount,
  addTransmissionLink,
  addWheelPart,
  commitDraggedMoves,
  createNetworkState,
  findOrCreateNode,
  moveNode,
  moveNodes,
  removeBeam,
  removeNode,
  removePart,
  type CommitDraggedMovesEntry,
  type NetworkState,
  type SymmetryAxis,
} from '../sim/network'

export type RigidMountKind = 'ENGINE' | 'SEAT'

export interface NetworkStoreState {
  networkState: NetworkState

  setNetworkState: (state: NetworkState) => void
  commitBeamStart: (position: THREE.Vector3) => string
  commitBeamEnd: (
    position: THREE.Vector3,
    startNodeId: string,
  ) => boolean
  commitBeamEndToNode: (endNodeId: string, startNodeId: string) => boolean
  commitBeamEndWithSymmetry: (
    endPos: THREE.Vector3,
    startNodeId: string,
    axis: SymmetryAxis,
  ) => boolean
  commitBeamEndToNodeWithSymmetry: (
    endNodeId: string,
    startNodeId: string,
    axis: SymmetryAxis,
  ) => boolean
  commitNodeMove: (nodeId: string, position: THREE.Vector3) => void
  commitNodeMoves: (moves: Map<string, THREE.Vector3>) => void
  commitDrag: (moves: CommitDraggedMovesEntry[]) => void
  deleteNode: (nodeId: string) => void
  deleteBeam: (beamId: string) => void

  // Step 16c — vehicle part placement (shares the findOrCreateNode merge
  // pattern with beams; parts attach to real structural nodes). Two-click
  // flow for Wheel and Transmission mirrors the Beam pair exactly.
  commitPartStart: (position: THREE.Vector3) => string
  commitPartEnd: (
    position: THREE.Vector3,
    startNodeId: string,
    kind: 'WHEEL' | 'TRANSMISSION',
  ) => boolean
  commitPartEndToNode: (
    endNodeId: string,
    startNodeId: string,
    kind: 'WHEEL' | 'TRANSMISSION',
  ) => boolean
  // Three-click flow for Engine/Seat. `mountNodeIds` already holds 2 distinct
  // clicked node ids; the third id resolves to existing-or-new at `pos`.
  commitMountThirdClick: (
    pos: THREE.Vector3,
    mountNodeIds: string[],
    kind: RigidMountKind,
  ) => boolean
  deletePart: (partId: string) => void
}

export const useNetworkStore = create<NetworkStoreState>((set, get) => ({
  networkState: createNetworkState(),

  setNetworkState: (state) => set({ networkState: state }),

  commitBeamStart: (position) => {
    const state = get().networkState
    const { state: next, nodeId } = findOrCreateNode(state, position)
    set({ networkState: next })
    return nodeId
  },

  commitBeamEnd: (position, startNodeId) => {
    const state = get().networkState
    const { state: next, nodeId: endNodeId } = findOrCreateNode(
      state,
      position,
    )
    if (endNodeId === startNodeId) {
      return false
    }
    const result = addBeam(next, startNodeId, endNodeId)
    if (result === null) {
      return false
    }
    set({ networkState: result.state })
    return true
  },

  commitBeamEndToNode: (endNodeId, startNodeId) => {
    if (
      endNodeId === null ||
      endNodeId === undefined ||
      startNodeId === null ||
      startNodeId === undefined
    ) {
      return false
    }
    if (endNodeId === startNodeId) {
      return false
    }
    const state = get().networkState
    const result = addBeam(state, startNodeId, endNodeId)
    if (result === null) {
      return false
    }
    set({ networkState: result.state })
    return true
  },

  commitBeamEndWithSymmetry: (endPos, startNodeId, axis) => {
    if (startNodeId === null || startNodeId === undefined) return false
    const state = get().networkState
    const startNode = state.nodes.get(startNodeId)
    if (startNode === undefined) return false
    const result = addBeamWithMirror(
      state,
      startNode.position,
      endPos,
      axis,
      true,
    )
    set({ networkState: result.state })
    return result.originalBeamId !== null
  },

  commitBeamEndToNodeWithSymmetry: (endNodeId, startNodeId, axis) => {
    if (
      endNodeId === null ||
      endNodeId === undefined ||
      startNodeId === null ||
      startNodeId === undefined
    ) {
      return false
    }
    if (endNodeId === startNodeId) {
      return false
    }
    const state = get().networkState
    const startNode = state.nodes.get(startNodeId)
    const endNode = state.nodes.get(endNodeId)
    if (startNode === undefined || endNode === undefined) return false
    const result = addBeamWithMirror(
      state,
      startNode.position,
      endNode.position,
      axis,
      true,
    )
    set({ networkState: result.state })
    return result.originalBeamId !== null
  },

  commitNodeMove: (nodeId, position) => {
    if (nodeId === null || nodeId === undefined) return
    const state = get().networkState
    const next = moveNode(state, nodeId, position)
    set({ networkState: next })
  },

  commitNodeMoves: (moves) => {
    if (moves.size === 0) return
    const state = get().networkState
    const next = moveNodes(state, moves)
    if (next === state) return
    set({ networkState: next })
  },

  commitDrag: (moves) => {
    if (moves.length === 0) return
    const state = get().networkState
    const result = commitDraggedMoves(state, moves)
    if (result.state === state) return
    set({ networkState: result.state })
  },

  deleteNode: (nodeId) => {
    if (nodeId === null || nodeId === undefined) return
    const state = get().networkState
    const next = removeNode(state, nodeId)
    set({ networkState: next })
  },

  deleteBeam: (beamId) => {
    if (beamId === null || beamId === undefined) return
    const state = get().networkState
    const next = removeBeam(state, beamId)
    set({ networkState: next })
  },

  // Step 16c — Wheel / Transmission share the two-click find-or-create flow
  // with beams. Click 1 resolves to an existing-or-new node (this action);
  // click 2 resolves the end node then attaches the part to the two nodes.
  commitPartStart: (position) => {
    const state = get().networkState
    const { state: next, nodeId } = findOrCreateNode(state, position)
    set({ networkState: next })
    return nodeId
  },

  commitPartEnd: (position, startNodeId, kind) => {
    const state = get().networkState
    const { state: next, nodeId: endNodeId } = findOrCreateNode(
      state,
      position,
    )
    if (endNodeId === startNodeId) {
      return false
    }
    const result =
      kind === 'WHEEL'
        ? addWheelPart(next, startNodeId, endNodeId)
        : addTransmissionLink(next, startNodeId, endNodeId)
    if (result === null) {
      return false
    }
    set({ networkState: result.state })
    return true
  },

  commitPartEndToNode: (endNodeId, startNodeId, kind) => {
    if (
      endNodeId === null ||
      endNodeId === undefined ||
      startNodeId === null ||
      startNodeId === undefined
    ) {
      return false
    }
    if (endNodeId === startNodeId) {
      return false
    }
    const state = get().networkState
    const result =
      kind === 'WHEEL'
        ? addWheelPart(state, startNodeId, endNodeId)
        : addTransmissionLink(state, startNodeId, endNodeId)
    if (result === null) {
      return false
    }
    set({ networkState: result.state })
    return true
  },

  // Step 16c — Engine/Seat three-click. `mountNodeIds` holds the first two
  // distinct node ids from clicks 1 & 2; click 3 resolves to existing-or-new
  // at `pos`. All three must be distinct (guarded by addRigidMount, which
  // returns null otherwise -> this returns false).
  commitMountThirdClick: (pos, mountNodeIds, kind) => {
    if (mountNodeIds.length < 2) return false
    const state = get().networkState
    const { state: nextPos, nodeId } = findOrCreateNode(state, pos)
    const result = addRigidMount(nextPos, kind, [
      mountNodeIds[0],
      mountNodeIds[1],
      nodeId,
    ])
    if (result === null) {
      return false
    }
    set({ networkState: result.state })
    return true
  },

  deletePart: (partId) => {
    if (partId === null || partId === undefined) return
    const state = get().networkState
    const next = removePart(state, partId)
    if (next === state) return
    set({ networkState: next })
  },
}))
