import { useMemo, useCallback } from 'react'
import { CSSProperties } from 'react'
import { getTotalMass, NodeBeamNetworkState } from '../sim/network'

export type EditorMode = 'addNode' | 'addBeam' | 'delete' | 'select'

interface EditorUIProps {
  networkState: NodeBeamNetworkState
  mode: EditorMode
  setMode: (mode: EditorMode) => void
  selectedNodeId: number | null
  setSelectedNodeId: (id: number | null) => void
  pendingBeamNodeId: number | null
  setPendingBeamNodeId: (id: number | null) => void
  onClearNetwork: () => void
  isSimulating: boolean
  onToggleSimulate: () => void
}

const MODES: { id: EditorMode; label: string; shortcut: string; description: string }[] = [
  { id: 'addNode', label: 'Add Node', shortcut: '1', description: 'Click ground to place nodes' },
  { id: 'addBeam', label: 'Add Beam', shortcut: '2', description: 'Click two nodes to connect' },
  { id: 'delete', label: 'Delete', shortcut: '3', description: 'Click node or beam to remove' },
  { id: 'select', label: 'Select/Move', shortcut: '4', description: 'Drag nodes to reposition' },
]

export function EditorUI({
  networkState,
  mode,
  setMode,
  selectedNodeId,
  setSelectedNodeId,
  pendingBeamNodeId,
  setPendingBeamNodeId,
  onClearNetwork,
  isSimulating,
  onToggleSimulate,
}: EditorUIProps) {
  const nodeCount = Object.keys(networkState.nodes).length
  const beamCount = Object.keys(networkState.beams).length
  const totalMass = getTotalMass(networkState)

  const panelStyle = useMemo<CSSProperties>(() => ({
    position: 'fixed',
    top: 12,
    left: 12,
    zIndex: 100,
    background: 'rgba(10, 10, 10, 0.92)',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: 14,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    backdropFilter: 'blur(8px)',
    maxWidth: 360,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#e0e0e0',
  }), [])

  const toolbarStyle = useMemo<CSSProperties>(() => ({
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 14,
  }), [])

  const buttonBase = useMemo<CSSProperties>(() => ({
    padding: '8px 14px',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    background: '#1a1a1a',
    color: '#ccc',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.12s ease',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }), [])

  const activeButton = useMemo<CSSProperties>(() => ({
    ...buttonBase,
    background: '#2a4a2a',
    borderColor: '#3a6a3a',
    color: '#9f9',
    boxShadow: '0 0 12px rgba(80, 200, 80, 0.25)',
  }), [buttonBase])

  const statsStyle = useMemo<CSSProperties>(() => ({
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    marginBottom: 14,
    paddingTop: 10,
    borderTop: '1px solid #222',
  }), [])

  const statItem = useMemo<CSSProperties>(() => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  }), [])

  const statValue = useMemo<CSSProperties>(() => ({
    fontSize: 22,
    fontWeight: 600,
    color: '#fff',
    lineHeight: 1,
  }), [])

  const statLabel = useMemo<CSSProperties>(() => ({
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: 2,
  }), [])

  const clearButton = useMemo<CSSProperties>(() => ({
    ...buttonBase,
    background: '#3a1a1a',
    borderColor: '#5a2a2a',
    color: '#f88',
    marginLeft: 'auto',
  }), [buttonBase])

  const infoStyle = useMemo<CSSProperties>(() => ({
    position: 'fixed',
    bottom: 12,
    left: 12,
    background: 'rgba(10, 10, 10, 0.85)',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    padding: '8px 12px',
    color: '#888',
    fontSize: 11,
    lineHeight: 1.6,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }), [])

  const handleModeClick = useCallback((m: EditorMode) => {
    setMode(m)
    setSelectedNodeId(null)
    setPendingBeamNodeId(null)
  }, [setMode, setSelectedNodeId, setPendingBeamNodeId])

  return (
    <>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '0.02em' }}>Node-Beam Editor</span>
          <span style={{ fontSize: 11, color: '#666' }}>Keys: 1–4, Esc</span>
        </div>

        <div style={toolbarStyle}>
          {MODES.map((m) => (
            <button
              key={m.id}
              style={mode === m.id ? activeButton : buttonBase}
              onClick={() => handleModeClick(m.id)}
              title={`${m.description} (${m.shortcut})`}
            >
              <span style={{ fontWeight: mode === m.id ? 700 : 500 }}>{m.label}</span>
              <span style={{ fontSize: 10, color: '#666', opacity: mode === m.id ? 1 : 0.5 }}>{m.shortcut}</span>
            </button>
          ))}
          <button
            style={{
              ...buttonBase,
              background: isSimulating ? '#4a2a2a' : '#2a4a2a',
              borderColor: isSimulating ? '#6a3a3a' : '#3a6a3a',
              color: isSimulating ? '#f99' : '#9f9',
            }}
            onClick={onToggleSimulate}
            title="Space"
          >
            {isSimulating ? '⏸ Pause' : '▶ Simulate'}
          </button>
        </div>

        <div style={statsStyle}>
          <div style={statItem}>
            <div style={statValue}>{nodeCount}</div>
            <div style={statLabel}>Nodes</div>
          </div>
          <div style={statItem}>
            <div style={statValue}>{beamCount}</div>
            <div style={statLabel}>Beams</div>
          </div>
          <div style={statItem}>
            <div style={statValue}>{totalMass.toFixed(1)}</div>
            <div style={statLabel}>Total Mass</div>
          </div>
        </div>

        {pendingBeamNodeId !== null && mode === 'addBeam' && (
          <div style={{
            padding: '8px 12px',
            background: 'rgba(60, 50, 0, 0.9)',
            border: '1px solid #6a5a00',
            borderRadius: 6,
            marginBottom: 10,
            fontSize: 12,
            color: '#ffd700',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>Beam: node <strong>{pendingBeamNodeId}</strong> selected. Click another node.</span>
            <button
              onClick={() => setPendingBeamNodeId(null)}
              style={{ ...buttonBase, padding: '4px 10px', fontSize: 11 }}
            >
              Cancel
            </button>
          </div>
        )}

        {selectedNodeId !== null && mode === 'select' && (
          <div style={{
            padding: '8px 12px',
            background: 'rgba(0, 40, 60, 0.9)',
            border: '1px solid #005a6a',
            borderRadius: 6,
            marginBottom: 10,
            fontSize: 12,
            color: '#6fe',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>Node <strong>{selectedNodeId}</strong> selected — drag to move</span>
            <button
              onClick={() => setSelectedNodeId(null)}
              style={{ ...buttonBase, padding: '4px 10px', fontSize: 11 }}
            >
              Deselect
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClearNetwork} style={clearButton}>
            Clear Network
          </button>
        </div>
      </div>

      <div style={infoStyle}>
        <div>1 / 2 / 3 / 4 — Switch modes</div>
        <div>Space — Play / Pause simulation</div>
        <div>Click ground — Add node (mode 1)</div>
        <div>Click node — Select / Start beam (mode 2)</div>
        <div>Click node/beam — Delete (mode 3)</div>
        <div>Drag node — Move (mode 4)</div>
        <div>Orbit: LMB+Drag | Pan: RMB+Drag | Zoom: Wheel</div>
      </div>
    </>
  )
}