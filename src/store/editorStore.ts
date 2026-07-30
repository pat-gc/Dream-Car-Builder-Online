import { create } from 'zustand'

export type EditorMode = 'ADD_BEAM' | 'SELECT_MOVE' | 'DELETE' | 'SIMULATE'

export type BeamStage = 'idle' | 'awaiting-second-point'

export interface DepthVector {
  x: number
  y: number
  z: number
}

export interface EditorState {
  mode: EditorMode
  setMode: (mode: EditorMode) => void

  snapIncrement: number
  setSnapIncrement: (value: number) => void

  axisSnapEnabled: boolean
  toggleAxisSnap: () => void

  isSimulating: boolean
  setIsSimulating: (value: boolean) => void

  beamStage: BeamStage
  beamStartNodeId: string | null
  depthOverrideVector: DepthVector | null

  hoveredNodeId: string | null
  setHoveredNodeId: (nodeId: string) => void
  clearHoveredNodeId: () => void

  setBeamStart: (nodeId: string, depth: DepthVector) => void
  resetBeamPlacement: () => void
  cancelBeamPlacement: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  mode: 'ADD_BEAM',
  setMode: (mode) => set({ mode }),

  snapIncrement: 0.5,
  setSnapIncrement: (value) => set({ snapIncrement: value }),

  axisSnapEnabled: false,
  toggleAxisSnap: () => set((state) => ({ axisSnapEnabled: !state.axisSnapEnabled })),

  isSimulating: false,
  setIsSimulating: (value) => set({ isSimulating: value }),

  beamStage: 'idle',
  beamStartNodeId: null,
  depthOverrideVector: null,

  hoveredNodeId: null,
  setHoveredNodeId: (nodeId) => {
    if (nodeId === null || nodeId === undefined) {
      return
    }
    if (useEditorStore.getState().hoveredNodeId === nodeId) {
      return
    }
    set({ hoveredNodeId: nodeId })
  },
  clearHoveredNodeId: () => set({ hoveredNodeId: null }),

  setBeamStart: (nodeId, depth) =>
    set({
      beamStage: 'awaiting-second-point',
      beamStartNodeId: nodeId,
      depthOverrideVector: depth,
    }),

  resetBeamPlacement: () =>
    set({
      beamStage: 'idle',
      beamStartNodeId: null,
      depthOverrideVector: null,
    }),

  cancelBeamPlacement: () =>
    set({
      beamStage: 'idle',
      beamStartNodeId: null,
      depthOverrideVector: null,
    }),
}))
