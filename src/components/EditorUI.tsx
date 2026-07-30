import { useEditorStore, type EditorMode } from '../store/editorStore'

const MODE_BUTTONS: { mode: EditorMode; label: string }[] = [
  { mode: 'ADD_BEAM', label: 'Add Beam' },
  { mode: 'SELECT_MOVE', label: 'Select/Move' },
  { mode: 'DELETE', label: 'Delete' },
  { mode: 'SIMULATE', label: 'Simulate' },
]

const SNAP_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '0.1', value: 0.1 },
  { label: '0.25', value: 0.25 },
  { label: '0.5', value: 0.5 },
  { label: '1.0', value: 1.0 },
  { label: '2.0', value: 2.0 },
]

function ModeToolbar() {
  const mode = useEditorStore((s) => s.mode)
  const setMode = useEditorStore((s) => s.setMode)

  return (
    <div style={styles.toolbarRow}>
      {MODE_BUTTONS.map((btn) => {
        const active = mode === btn.mode
        const handleSimulate = btn.mode === 'SIMULATE' ? () => {
          if (!active) setMode('SIMULATE')
        } : () => setMode(btn.mode)
        return (
          <button
            key={btn.mode}
            onClick={handleSimulate}
            style={{
              ...styles.modeButton,
              ...(active ? styles.modeButtonActive : {}),
            }}
          >
            {btn.label}
          </button>
        )
      })}
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
}

export default function EditorUI() {
  return (
    <div style={styles.overlayWrapper}>
      <div style={styles.panel}>
        <ModeToolbar />
        <SnapControls />
      </div>
    </div>
  )
}
