import { useEffect } from 'react'
import { useEditorStore, type EditorMode, type SnapView } from '../store/editorStore'

const MODE_BUTTONS: { mode: Exclude<EditorMode, 'SIMULATE'>; label: string }[] = [
  { mode: 'ADD_BEAM', label: 'Add Beam' },
  { mode: 'SELECT_MOVE', label: 'Select/Move' },
  { mode: 'DELETE', label: 'Delete' },
]

const SNAP_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '0.1', value: 0.1 },
  { label: '0.25', value: 0.25 },
  { label: '0.5', value: 0.5 },
  { label: '1.0', value: 1.0 },
  { label: '2.0', value: 2.0 },
]

const VIEW_BUTTONS: { view: SnapView; label: string }[] = [
  { view: 'TOP', label: 'Top' },
  { view: 'BOTTOM', label: 'Bottom' },
  { view: 'FRONT', label: 'Front' },
  { view: 'BACK', label: 'Back' },
  { view: 'LEFT', label: 'Left' },
  { view: 'RIGHT', label: 'Right' },
]

function ModeToolbar() {
  const mode = useEditorStore((s) => s.mode)
  const setMode = useEditorStore((s) => s.setMode)
  const isSimulating = useEditorStore((s) => s.isSimulating)
  const toggleSimulation = useEditorStore((s) => s.toggleSimulation)

  return (
    <div style={styles.toolbarRow}>
      {MODE_BUTTONS.map((btn) => {
        const active = !isSimulating && mode === btn.mode
        return (
          <button
            key={btn.mode}
            disabled={isSimulating}
            onClick={() => setMode(btn.mode)}
            style={{
              ...styles.modeButton,
              ...(active ? styles.modeButtonActive : {}),
              ...(isSimulating ? styles.modeButtonDisabled : {}),
            }}
          >
            {btn.label}
          </button>
        )
      })}
      <button
        onClick={toggleSimulation}
        style={{
          ...styles.modeButton,
          ...(isSimulating ? styles.modeButtonStopActive : styles.modeButtonActive),
        }}
      >
        {isSimulating ? 'Stop' : 'Simulate'}
      </button>
    </div>
  )
}

function SnapControls() {
  const snapIncrement = useEditorStore((s) => s.snapIncrement)
  const setSnapIncrement = useEditorStore((s) => s.setSnapIncrement)
  const axisSnapEnabled = useEditorStore((s) => s.axisSnapEnabled)
  const toggleAxisSnap = useEditorStore((s) => s.toggleAxisSnap)

  return (
    <div style={styles.controlsRow}>
      <label style={styles.controlLabel}>
        Snap:
        <select
          value={snapIncrement}
          onChange={(e) => {
            const val = parseFloat(e.target.value)
            setSnapIncrement(val)
          }}
          style={styles.select}
        >
          {SNAP_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label style={styles.controlLabel}>
        <input
          type="checkbox"
          checked={axisSnapEnabled}
          onChange={toggleAxisSnap}
          style={styles.checkbox}
        />
        Axis Snap
      </label>
    </div>
  )
}

function ViewControls() {
  const requestSnapView = useEditorStore((s) => s.requestSnapView)

  return (
    <div style={styles.viewPanel}>
      <div style={styles.viewTitle}>View</div>
      <div style={styles.viewGrid}>
        {VIEW_BUTTONS.map((btn) => (
          <button
            key={btn.view}
            onClick={() => requestSnapView(btn.view)}
            style={styles.viewButton}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SymmetryControls() {
  const symmetryEnabled = useEditorStore((s) => s.symmetryEnabled)
  const toggleSymmetry = useEditorStore((s) => s.toggleSymmetry)
  const symmetryAxis = useEditorStore((s) => s.symmetryAxis)
  const setSymmetryAxis = useEditorStore((s) => s.setSymmetryAxis)

  return (
    <div style={styles.controlsRow}>
      <label style={styles.controlLabel}>
        <input
          type="checkbox"
          checked={symmetryEnabled}
          onChange={toggleSymmetry}
          style={styles.checkbox}
        />
        Symmetry
      </label>
      <label style={styles.controlLabel}>
        Mirror:
        <select
          value={symmetryAxis}
          onChange={(e) => {
            setSymmetryAxis(e.target.value as 'X' | 'Z')
          }}
          disabled={!symmetryEnabled}
          style={{
            ...styles.select,
            ...(symmetryEnabled ? {} : styles.modeButtonDisabled),
          }}
        >
          <option value="X">X axis</option>
          <option value="Z">Z axis</option>
        </select>
      </label>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlayWrapper: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: 10,
  },
  panel: {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '10px 14px',
    background: 'rgba(15, 18, 24, 0.85)',
    border: '1px solid rgba(90, 120, 255, 0.35)',
    borderRadius: 10,
    color: '#d8def0',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontSize: 13,
    pointerEvents: 'auto',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
  },
  toolbarRow: {
    display: 'flex',
    gap: 6,
  },
  modeButton: {
    padding: '6px 12px',
    background: 'rgba(40, 46, 60, 0.8)',
    border: '1px solid rgba(90, 120, 255, 0.25)',
    borderRadius: 6,
    color: '#b0b8d0',
    cursor: 'pointer',
    fontSize: 13,
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    pointerEvents: 'auto',
    userSelect: 'none',
  },
  modeButtonActive: {
    background: 'rgba(90, 120, 255, 0.35)',
    border: '1px solid rgba(90, 120, 255, 0.7)',
    color: '#fff',
  },
  modeButtonStopActive: {
    background: 'rgba(255, 80, 80, 0.35)',
    border: '1px solid rgba(255, 80, 80, 0.7)',
    color: '#fff',
    cursor: 'pointer',
  },
  modeButtonDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    borderTop: '1px solid rgba(90, 120, 255, 0.15)',
    paddingTop: 8,
  },
  controlLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    pointerEvents: 'auto',
    cursor: 'pointer',
    userSelect: 'none',
  },
  select: {
    padding: '3px 6px',
    background: 'rgba(20, 24, 32, 0.9)',
    border: '1px solid rgba(90, 120, 255, 0.3)',
    borderRadius: 4,
    color: '#d8def0',
    fontSize: 13,
    cursor: 'pointer',
  },
  checkbox: {
    cursor: 'pointer',
  },
  viewPanel: {
    position: 'absolute',
    top: 16,
    right: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '10px 12px',
    background: 'rgba(15, 18, 24, 0.85)',
    border: '1px solid rgba(90, 120, 255, 0.35)',
    borderRadius: 10,
    color: '#d8def0',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontSize: 13,
    pointerEvents: 'auto',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
  },
  viewTitle: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#8a92ad',
    textAlign: 'center',
  },
  viewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 4,
  },
  viewButton: {
    padding: '5px 10px',
    background: 'rgba(40, 46, 60, 0.8)',
    border: '1px solid rgba(90, 120, 255, 0.25)',
    borderRadius: 6,
    color: '#b0b8d0',
    cursor: 'pointer',
    fontSize: 12,
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    pointerEvents: 'auto',
    userSelect: 'none',
  },
}

export default function EditorUI() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') {
        return
      }
      const state = useEditorStore.getState()
      if (state.draggedNodeId !== null && state.draggedNodeId !== undefined) {
        state.cancelDrag()
        return
      }
      if (state.beamStage === 'awaiting-second-point') {
        state.cancelBeamPlacement()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div style={styles.overlayWrapper}>
      <div style={styles.panel}>
        <ModeToolbar />
        <SnapControls />
        <SymmetryControls />
      </div>
      <ViewControls />
    </div>
  )
}
