import { create } from 'zustand'

export type EditorMode = 'ADD_BEAM' | 'SELECT_MOVE' | 'DELETE' | 'SIMULATE'

export interface EditorState {
  mode: EditorMode
  setMode: (mode: EditorMode) => void

  snapIncrement: number
  setSnapIncrement: (value: number) => void

  axisSnapEnabled: boolean
  toggleAxisSnap: () => void

  isSimulating: boolean
  setIsSimulating: (value: boolean) => void
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
}))
