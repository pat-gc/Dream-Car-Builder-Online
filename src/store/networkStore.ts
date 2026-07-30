import { create } from 'zustand'
import * as THREE from 'three'
import {
  addBeam,
  createNetworkState,
  findOrCreateNode,
  moveNode,
  type NetworkState,
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
  commitNodeMove: (nodeId: string, position: THREE.Vector3) => void
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

  commitNodeMove: (nodeId, position) => {
    if (nodeId === null || nodeId === undefined) return
    const state = get().networkState
    const next = moveNode(state, nodeId, position)
    set({ networkState: next })
  },
}))
