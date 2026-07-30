import { create } from 'zustand'
import * as THREE from 'three'
import {
  addBeam,
  addBeamWithMirror,
  createNetworkState,
  findOrCreateNode,
  moveNode,
  moveNodes,
  removeBeam,
  removeNode,
  type NetworkState,
  type SymmetryAxis,
} from '../sim/network'

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
  deleteNode: (nodeId: string) => void
  deleteBeam: (beamId: string) => void
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
}))
