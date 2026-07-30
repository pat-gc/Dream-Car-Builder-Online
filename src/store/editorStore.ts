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
  toggleSimulation: () => void

  beamStage: BeamStage
  beamStartNodeId: string | null
  depthOverrideVector: DepthVector | null

  hoveredNodeId: string | null
  setHoveredNodeId: (nodeId: string) => void
  clearHoveredNodeId: () => void

  hoveredBeamId: string | null
  setHoveredBeamId: (beamId: string) => void
  clearHoveredBeamId: () => void

  draggedNodeId: string | null
  setDraggedNodeId: (nodeId: string, depth: DepthVector) => void
  clearDraggedNode: () => void
  cancelDrag: () => void

  selectedNodeIds: Set<string>
  selectNode: (id: string) => void
  deselectNode: (id: string) => void
  toggleNodeSelection: (id: string) => void
  setSelection: (ids: string[]) => void
  clearSelection: () => void

  setBeamStart: (nodeId: string, depth: DepthVector) => void
  resetBeamPlacement: () => void
  cancelBeamPlacement: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  mode: 'ADD_BEAM',
  setMode: (mode) =>
    set({
      mode,
      hoveredNodeId: null,
      hoveredBeamId: null,
      draggedNodeId: null,
      depthOverrideVector: null,
      selectedNodeIds: new Set<string>(),
    }),

  snapIncrement: 0.5,
  setSnapIncrement: (value) => set({ snapIncrement: value }),

  axisSnapEnabled: false,
  toggleAxisSnap: () => set((state) => ({ axisSnapEnabled: !state.axisSnapEnabled })),

  isSimulating: false,
  setIsSimulating: (value) => set({ isSimulating: value }),
  toggleSimulation: () => {
    const next = !get().isSimulating
    set({
      isSimulating: next,
      mode: next ? 'SIMULATE' : get().mode,
      hoveredNodeId: null,
      hoveredBeamId: null,
      beamStage: 'idle',
      beamStartNodeId: null,
      depthOverrideVector: null,
      draggedNodeId: null,
      selectedNodeIds: new Set<string>(),
    })
  },

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

  hoveredBeamId: null,
  setHoveredBeamId: (beamId) => {
    if (beamId === null || beamId === undefined) {
      return
    }
    if (useEditorStore.getState().hoveredBeamId === beamId) {
      return
    }
    set({ hoveredBeamId: beamId })
  },
  clearHoveredBeamId: () => set({ hoveredBeamId: null }),

  draggedNodeId: null,
  setDraggedNodeId: (nodeId, depth) => {
    if (nodeId === null || nodeId === undefined) {
      return
    }
    set({ draggedNodeId: nodeId, depthOverrideVector: depth })
  },
  clearDraggedNode: () => set({ draggedNodeId: null, depthOverrideVector: null }),
  cancelDrag: () =>
    set({ draggedNodeId: null, depthOverrideVector: null, hoveredNodeId: null }),

  selectedNodeIds: new Set<string>(),
  selectNode: (id) => {
    if (id === null || id === undefined) return
    const current = useEditorStore.getState().selectedNodeIds
    if (current.has(id)) return
    const next = new Set(current)
    next.add(id)
    set({ selectedNodeIds: next })
  },
  deselectNode: (id) => {
    if (id === null || id === undefined) return
    const current = useEditorStore.getState().selectedNodeIds
    if (!current.has(id)) return
    const next = new Set(current)
    next.delete(id)
    set({ selectedNodeIds: next })
  },
  toggleNodeSelection: (id) => {
    if (id === null || id === undefined) return
    const current = useEditorStore.getState().selectedNodeIds
    const next = new Set(current)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    set({ selectedNodeIds: next })
  },
  setSelection: (ids) => {
    const next = new Set<string>()
    for (const id of ids) {
      if (id !== null && id !== undefined) {
        next.add(id)
      }
    }
    set({ selectedNodeIds: next })
  },
  clearSelection: () => {
    if (useEditorStore.getState().selectedNodeIds.size === 0) return
    set({ selectedNodeIds: new Set<string>() })
  },

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
      hoveredNodeId: null,
    }),
}))
