import { create } from 'zustand'

export type EditorMode =
  | 'ADD_BEAM'
  | 'ADD_WHEEL'
  | 'ADD_ENGINE'
  | 'ADD_SEAT'
  | 'ADD_TRANSMISSION'
  | 'SELECT_MOVE'
  | 'DELETE'
  | 'SIMULATE'

// Build modes = the two/three-click placement tools (everything that uses the
// camera-perpendicular placement plane + ghost previews).
export const BUILD_MODES: ReadonlySet<EditorMode> = new Set<EditorMode>([
  'ADD_BEAM',
  'ADD_WHEEL',
  'ADD_ENGINE',
  'ADD_SEAT',
  'ADD_TRANSMISSION',
])

export function isBuildMode(mode: EditorMode): boolean {
  return BUILD_MODES.has(mode)
}

// Two-click flow (Beam, Wheel, Transmission) shares `beamStage`.
export type BeamStage = 'idle' | 'awaiting-second-point'

// Three-click flow (Engine, Seat) uses `mountStage`.
export type MountStage = 'idle' | 'awaiting-second-point' | 'awaiting-third-point'

export type SymmetryAxis = 'X' | 'Z'

export type SnapView = 'TOP' | 'BOTTOM' | 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT'

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

  symmetryEnabled: boolean
  symmetryAxis: SymmetryAxis
  toggleSymmetry: () => void
  setSymmetryAxis: (axis: SymmetryAxis) => void

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

  // Step 16c — three-click RigidMount (Engine/Seat) flow.
  mountStage: MountStage
  mountNodeIds: string[] // up to 3 accumulated node ids
  depthOverrideVectorMount: DepthVector | null // depth set by click 1
  setMountFirstNode: (nodeId: string, depth: DepthVector) => void
  setMountSecondNode: (nodeId: string) => void
  resetMountPlacement: () => void
  cancelMountPlacement: () => void

  // Step 16c — live ghost preview point (cursor position on the camera-
  // perpendicular placement plane while a part placement is in progress).
  // Kept in the editor store rather than a ref because the ghost preview
  // renders inside <Canvas> as a child that needs to react to it. Updates are
  // imperative (pointermove rate, user-gesture rate — per SPEC this is exempt
  // from the per-frame hot-path budget).
  ghostPreviewPoint: DepthVector | null
  setGhostPreviewPoint: (point: DepthVector | null) => void

  // Camera orthographic snap view request (Step 15).
  // `snapView` carries the requested view; `snapRequestId` increments on each
  // request so a subscriber inside <Canvas> can react even when the same view
  // is requested twice in a row.
  snapView: SnapView | null
  snapRequestId: number
  requestSnapView: (view: SnapView) => void
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
      // Clear all placement flows on mode switch (beam two-click + mount
      // three-click), so switching tools mid-placement never leaves a
      // half-built part dangling.
      beamStage: 'idle',
      beamStartNodeId: null,
      mountStage: 'idle',
      mountNodeIds: [],
      depthOverrideVectorMount: null,
      ghostPreviewPoint: null,
    }),

  snapIncrement: 0.5,
  setSnapIncrement: (value) => set({ snapIncrement: value }),

  axisSnapEnabled: false,
  toggleAxisSnap: () => set((state) => ({ axisSnapEnabled: !state.axisSnapEnabled })),

  symmetryEnabled: false,
  symmetryAxis: 'X',
  toggleSymmetry: () => set((state) => ({ symmetryEnabled: !state.symmetryEnabled })),
  setSymmetryAxis: (axis) => set({ symmetryAxis: axis }),

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
      mountStage: 'idle',
      mountNodeIds: [],
      depthOverrideVectorMount: null,
      ghostPreviewPoint: null,
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
      ghostPreviewPoint: null,
    }),

  cancelBeamPlacement: () =>
    set({
      beamStage: 'idle',
      beamStartNodeId: null,
      depthOverrideVector: null,
      hoveredNodeId: null,
      ghostPreviewPoint: null,
    }),

  // Step 16c — three-click RigidMount (Engine/Seat) flow.
  // Click 1 -> mountNodeIds=[a]; click 2 -> [a,b]; click 3 -> finalizes via
  // network action and resets to idle. depthOverrideVectorMount mirrors the
  // beam flow so the placement plane stacks at click-1's depth (no ground
  // fallback, per rule 4).
  mountStage: 'idle',
  mountNodeIds: [],
  depthOverrideVectorMount: null,
  setMountFirstNode: (nodeId, depth) =>
    set({
      mountStage: 'awaiting-second-point',
      mountNodeIds: [nodeId],
      depthOverrideVectorMount: depth,
    }),
  setMountSecondNode: (nodeId) => {
    const ids = useEditorStore.getState().mountNodeIds
    // Defensive: never push a duplicate (the interaction layer already
    // guards against clicking the same node twice).
    if (ids[0] === nodeId) return
    set({
      mountStage: 'awaiting-third-point',
      mountNodeIds: [ids[0], nodeId],
    })
  },
  resetMountPlacement: () =>
    set({
      mountStage: 'idle',
      mountNodeIds: [],
      depthOverrideVectorMount: null,
      ghostPreviewPoint: null,
    }),
  cancelMountPlacement: () =>
    set({
      mountStage: 'idle',
      mountNodeIds: [],
      depthOverrideVectorMount: null,
      hoveredNodeId: null,
      ghostPreviewPoint: null,
    }),

  // Step 16c — ghost preview point (live cursor position on the placement
  // plane while a part placement is in progress; null hides the ghost).
  ghostPreviewPoint: null,
  setGhostPreviewPoint: (point) => {
    if (point === null) {
      if (useEditorStore.getState().ghostPreviewPoint === null) return
      set({ ghostPreviewPoint: null })
      return
    }
    const cur = useEditorStore.getState().ghostPreviewPoint
    if (
      cur !== null &&
      cur.x === point.x &&
      cur.y === point.y &&
      cur.z === point.z
    ) {
      return
    }
    set({ ghostPreviewPoint: point })
  },

  // Camera orthographic snap view request (Step 15).
  snapView: null,
  snapRequestId: 0,
  requestSnapView: (view) =>
    set((state) => ({
      snapView: view,
      // Monotonic but wrap-safe enough; contentType is counter-only.
      snapRequestId: state.snapRequestId + 1,
    })),
}))
