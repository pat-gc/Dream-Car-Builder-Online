import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { useRef, useState, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { Vector3 } from 'three'

import { EditorUI, EditorMode } from './components/EditorUI'
import { ViewportInteractions, snapPointToGrid } from './components/ViewportInteractions'
import { NetworkRenderer } from './components/NetworkRenderer'
import {
  createNetwork,
  addNode,
  addBeam,
  removeNode,
  removeBeam,
  NodeBeamNetworkState,
  Node,
} from './sim/network'
import { stepPhysics, PhysicsOptions } from './sim/physics'

const DEFAULT_PHYSICS_OPTIONS: PhysicsOptions = {
  gravity: -9.81,
  subSteps: 10,
  groundY: 0,
  groundDamping: 0.5,
  groundFriction: 0.9,
}

// -----------------------------------------------------------------------------
// Merge helpers for beam placement.
//
// findExistingNode: looks up the first node within `mergeThreshold` of the
//   given position. Pure read — no state mutation.
//
// findOrCreateNode: returns the id of an existing node within threshold, or
//   creates a new node at the position (mutating `state`) and returns its id.
//
// The single source of truth for the merge rule is findExistingNode; every
// call site that needs to decide "is there already a node here?" goes through
// it so the threshold cannot drift between code paths.
// -----------------------------------------------------------------------------
function findExistingNode(
  nodes: NodeBeamNetworkState['nodes'],
  position: Vector3,
  mergeThreshold: number = 0.05,
): { id: number; node: Node } | null {
  for (const node of Object.values(nodes)) {
    if (node.position.distanceTo(position) <= mergeThreshold) {
      return { id: node.id, node }
    }
  }
  return null
}

function findOrCreateNode(
  state: NodeBeamNetworkState,
  position: Vector3,
  mergeThreshold: number = 0.05,
): number {
  const existing = findExistingNode(state.nodes, position, mergeThreshold)
  if (existing) return existing.id
  const newNode = addNode(state, position)
  return newNode.id
}

// -----------------------------------------------------------------------------
// PhysicsLoop: runs inside <Canvas>, stepping the physics each frame while the
// simulation toggle is on. Uses a lightweight `setRenderTrigger` counter to
// force a React re-render so the 3D meshes pick up updated node positions.
// -----------------------------------------------------------------------------
function PhysicsLoop({
  isSimulating,
  networkState,
  setRenderTrigger,
}: {
  isSimulating: boolean
  networkState: NodeBeamNetworkState
  setRenderTrigger: React.Dispatch<React.SetStateAction<number>>
}) {
  useFrame((_, delta) => {
    if (isSimulating) {
      stepPhysics(networkState, Math.min(delta, 0.1), DEFAULT_PHYSICS_OPTIONS)
      setRenderTrigger((prev: number) => prev + 1)
    }
  })
  return null
}

// -----------------------------------------------------------------------------
// GroundPlane: invisible raycast target at Y=0 for addNode clicks.
// -----------------------------------------------------------------------------
function GroundPlane({ onPointerDown }: { onPointerDown: (point: Vector3, event: any) => void }) {
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.001, 0]}
        receiveShadow
        onPointerDown={(e) => {
          if (e.button !== 0 && e.nativeEvent?.button !== 0) return
          e.stopPropagation()
          onPointerDown(e.point, e)
        }}
      >
        <planeGeometry args={[200, 200]} />
        <shadowMaterial opacity={0.15} />
      </mesh>
    </group>
  )
}

// -----------------------------------------------------------------------------
// PlacementPlane: invisible raycast target used for beam placement clicks.
// Only rendered in addBeam mode. NOTE: the mesh itself is ground-aligned
// (rotated flat at Y≈0) and serves as a simple raycast hit surface. The
// actual camera-perpendicular snapping/drag math happens in
// `ViewportInteractions.buildPlane` via THREE.Plane — this component merely
// catches the pointerdown so we get a stable e.point in world space.
//
// RAYCAST RULE: never set `visible={false}` on this mesh. R3F's raycaster
// skips invisible objects, so an invisible mesh would silently swallow all
// beam-placement clicks. We keep `visible` at its default `true` and hide the
// mesh from the user with a transparent, depthWrite=false material instead.
// -----------------------------------------------------------------------------
function PlacementPlane({
  onPointerDown,
  beamStage,
}: {
  onPointerDown: (point: Vector3, event: any) => void
  beamStage: 'idle' | 'placing' | 'dragging'
}) {
  return (
    <mesh
      visible={true}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.001, 0]}
      onPointerDown={(e) => {
        // Temporary diagnostic: confirms pointer events reach the plane and
        // shows the live beamStage at click time. Remove once beam spawning
        // is verified working end-to-end.
        console.log('Plane clicked:', e.point, 'Stage:', beamStage)
        if (e.button !== 0 && e.nativeEvent?.button !== 0) return
        e.stopPropagation()
        onPointerDown(e.point, e)
      }}
    >
      <planeGeometry args={[1000, 1000]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

// -----------------------------------------------------------------------------
// View alignment helper: smoothly transitions OrbitControls to a target view.
// -----------------------------------------------------------------------------
function alignCameraToView(controls: any, view: string) {
  const target = new Vector3()
  let position: [number, number, number]

  switch (view) {
    case 'top':
      position = [0, 50, 0]
      break
    case 'front':
      position = [0, 0, 50]
      break
    case 'side':
      position = [50, 0, 0]
      break
    case 'perspective':
    default:
      position = [5, 5, 5]
      break
  }

  const targetPos = new Vector3(...position)
  const startPos = controls.object.position.clone()
  const duration = 800 // ms
  const startTime = Date.now()

  function animate() {
    const elapsed = Date.now() - startTime
    const t = Math.min(elapsed / duration, 1)
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    controls.object.position.lerpVectors(startPos, targetPos, eased)
    controls.target.lerp(target, eased)
    controls.update()
    if (t < 1) requestAnimationFrame(animate)
  }
  animate()
}

export default function App() {
  const cameraRef = useRef<THREE.Camera | null>(null)
  const controlsRef = useRef<any>(null)
  const [networkState, setNetworkState] = useState<NodeBeamNetworkState>(createNetwork())
  const [mode, setMode] = useState<EditorMode>('addNode')
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<number | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [, setRenderTrigger] = useState(0)

  // Grid snapping size (0 = Off). Applies to new node creation and to node
  // dragging in Move/Select mode.
  const [snapSize, setSnapSize] = useState(0.5)

  // Snapshot for simulation reset
  const [initialNetworkState, setInitialNetworkState] = useState<NodeBeamNetworkState | null>(null)

  // Beam building state.
  //
  // beamStage is the source of truth for the two-click beam placement flow:
  //   'idle'     -> no active placement (Click 1 will set the start node).
  //   'dragging' -> start node captured, waiting for Click 2 to set end.
  //
  // We deliberately skip the historical intermediate 'placing' stage: that
  // stage was advanced to 'dragging' one frame later by ViewportInteractions
  // via useFrame, which created a race where a rapid second click would land
  // while stage was still 'placing' (a state handleBeamPlace never handled)
  // and silently drop the beam. By transitioning directly to 'dragging' on
  // Click 1 we make the state machine synchronous and single-sourced.
  //
  // beamStageRef mirrors beamStage so handleBeamPlace can read the *live*
  // value rather than the value captured in its useCallback closure. This
  // eliminates the second failure mode where R3F retains a stale
  // onPointerDown closure between renders. Every mutation of beamStage goes
  // through setBeamStage (defined just below) so the ref and state never drift.
  const [beamStage, setBeamStageState] = useState<'idle' | 'placing' | 'dragging'>('idle')
  const beamStageRef = useRef<'idle' | 'placing' | 'dragging'>('idle')
  const setBeamStage = useCallback((next: 'idle' | 'placing' | 'dragging') => {
    beamStageRef.current = next
    setBeamStageState(next)
  }, [])
  const [beamStartPoint, setBeamStartPoint] = useState<Vector3 | null>(null)
  const [beamStartNodeId, setBeamStartNodeId] = useState<number | null>(null)
  const [beamEndPoint, setBeamEndPoint] = useState<Vector3 | null>(null)

  // Snap point hover
  const [snapPoint, setSnapPoint] = useState<Vector3 | null>(null)
  const [snapTargetType, setSnapTargetType] = useState<'node' | 'plane' | null>(null)

  // Hover tracking
  const [hoveredNodeId] = useState<number | null>(null)
  const [hoveredBeamId] = useState<number | null>(null)

  const clearNetwork = useCallback(() => {
    setNetworkState(createNetwork())
    setSelectedNodeId(null)
    setDraggingNodeId(null)
    setBeamStage('idle')
    setBeamStartPoint(null)
    setBeamStartNodeId(null)
    setBeamEndPoint(null)
    setSnapPoint(null)
    setSnapTargetType(null)
  }, [])

  const toggleSimulate = useCallback(() => {
    setIsSimulating((prev) => {
      const next = !prev
      if (next) {
        // Snapshot current state when starting simulation
        const snapshot: NodeBeamNetworkState = {
          nodes: {},
          beams: {},
          nextNodeId: networkState.nextNodeId,
          nextBeamId: networkState.nextBeamId,
        }
        for (const [id, node] of Object.entries(networkState.nodes)) {
          snapshot.nodes[id as unknown as number] = {
            ...node,
            position: node.position.clone(),
            velocity: node.velocity.clone(),
            forceAccumulator: new Vector3(),
          }
        }
        for (const [id, beam] of Object.entries(networkState.beams)) {
          snapshot.beams[id as unknown as number] = { ...beam }
        }
        setInitialNetworkState(snapshot)
      } else {
        // Restore snapshot when stopping simulation
        if (initialNetworkState) {
          setNetworkState({
            nodes: {},
            beams: {},
            nextNodeId: initialNetworkState.nextNodeId,
            nextBeamId: initialNetworkState.nextBeamId,
          })
          // Restore nodes with zero velocity/force
          for (const [id, node] of Object.entries(initialNetworkState.nodes)) {
            setNetworkState((prev) => {
              const next = { ...prev, nodes: { ...prev.nodes }, beams: { ...prev.beams }, nextNodeId: prev.nextNodeId, nextBeamId: prev.nextBeamId }
              next.nodes[Number(id)] = {
                ...node,
                position: node.position.clone(),
                velocity: new Vector3(),
                forceAccumulator: new Vector3(),
              }
              return next
            })
          }
          // Restore beams
          for (const [id, beam] of Object.entries(initialNetworkState.beams)) {
            setNetworkState((prev) => {
              const next = { ...prev, nodes: { ...prev.nodes }, beams: { ...prev.beams }, nextNodeId: prev.nextNodeId, nextBeamId: prev.nextBeamId }
              next.beams[Number(id)] = { ...beam }
              return next
            })
          }
        }
        setInitialNetworkState(null)
      }
      return next
    })
  }, [networkState, initialNetworkState])

  // Handle ground click (addNode mode only — beam placement uses PlacementPlane)
  const handleGroundClick = useCallback((rawPoint: Vector3) => {
    const point = snapPointToGrid(rawPoint, snapSize)
    if (mode === 'addNode') {
      setNetworkState((prev) => {
        const next = { ...prev, nodes: { ...prev.nodes }, beams: { ...prev.beams }, nextNodeId: prev.nextNodeId, nextBeamId: prev.nextBeamId }
        addNode(next, point)
        return next
      })
    }
  }, [mode, snapSize])

  // Handle beam placement clicks on the (ground-aligned) PlacementPlane.
  //
  // Two-click flow (synchronous state machine, no useFrame race):
  //   Click 1 (stage 'idle'):   resolve/create the start node, record its id,
  //                             and transition stage DIRECTLY to 'dragging'.
  //   Click 2 (stage 'dragging' OR stale 'placing'): resolve/create the end
  //                             node and link a beam from start to end (cancel
  //                             if they are the same node).
  //
  // We read `beamStage` from `beamStageRef.current` so that even if R3F
  // retains a stale `onPointerDown` closure (or if Click 2 arrives before a
  // re-render commits the new beamStage state), the handler always sees the
  // live stage value rather than the value captured at the time the closure
  // was created. This is the cure for both the "rapid second click" race and
  // the "R3F holds a stale closure" failure mode that previously dropped
  // beams silently when stage was transiently 'placing'.
  //
  // The key invariant is that `beamStartNodeId` is ALWAYS set after Click 1
  // for both branches (merging onto an existing node AND creating a new one).
  // The previous implementation only recorded the id when merging onto an
  // existing node, leaving it null for newly-created start nodes — which is
  // what prevented beams from spawning. It also called setState from inside a
  // setState updater (a React anti-pattern); this version does not.
  const handleBeamPlace = useCallback((rawPoint: Vector3) => {
    if (mode !== 'addBeam') return
    const point = snapPointToGrid(rawPoint, snapSize)

    const liveStage = beamStageRef.current

    if (liveStage === 'idle') {
      // --- Click 1: start point ---
      // Pre-resolve whether an existing node sits at this point so we can
      // snap the start point to its actual position (not the raw click point).
      const existingStart = findExistingNode(networkState.nodes, point)

      const startPos = existingStart ? existingStart.node.position.clone() : point.clone()

      setBeamStartPoint(startPos)
      setBeamEndPoint(startPos.clone())

      if (existingStart) {
        // Merge onto existing node — id is known up-front.
        setBeamStartNodeId(existingStart.id)
        // Transition DIRECTLY to 'dragging' (no intermediate 'placing' state).
        setBeamStage('dragging')
        return
      }

      // New node must be created. Compute its assigned id up-front from the
      // current `nextNodeId` captured by this closure — this is a pure read
      // of `networkState` and keeps the `setNetworkState` updater below pure
      // (idempotent under React 18 StrictMode's double-invocation). The
      // updater will still create the node iff it isn't already present (which
      // guarantees it commits exactly once even if StrictMode calls the
      // updater twice).
      const newId = networkState.nextNodeId
      setBeamStartNodeId(newId)
      setBeamStage('dragging')
      setNetworkState((prev) => {
        if (newId in prev.nodes) {
          // Node already committed (e.g. we're in a re-render path that's
          // already processed this update) — nothing to do.
          return prev
        }
        const next = { ...prev, nodes: { ...prev.nodes }, beams: { ...prev.beams } }
        addNode(next, startPos)
        return next
      })
      return
    }

    // --- Click 2: end point ---
    // Treat both 'dragging' (the normal path) and the legacy 'placing' state
    // (which should no longer be emitted but is handled defensively in case
    // some other code path set it) as "Click 2". The guard `beamStartPoint`
    // ensures we never act without a captured start.
    if ((liveStage === 'dragging' || liveStage === 'placing') && beamStartPoint) {
      // Recover / derive the start node id defensively. beamStartNodeId may,
      // in rare timing scenarios, still be stale — re-derive from the start
      // point so the beam is never dropped on a closure artefact.
      let resolvedStartNodeId: number | null = beamStartNodeId

      if (resolvedStartNodeId === null) {
        const match = findExistingNode(networkState.nodes, beamStartPoint)
        resolvedStartNodeId = match ? match.id : null
      }

      // Pre-resolve whether an existing node sits at the end point so we can
      // snap the end of the beam to its actual position.
      const existingEnd = findExistingNode(networkState.nodes, point)
      const endPos = existingEnd ? existingEnd.node.position.clone() : point.clone()

      let resolvedEndNodeId: number | null = existingEnd ? existingEnd.id : null

      setNetworkState((prev) => {
        const next = { ...prev, nodes: { ...prev.nodes }, beams: { ...prev.beams } }

        // (a) Create the missing start node if Click 1 never managed to.
        //     Also recreate it if beamStartNodeId was set but the referenced
        //     node was deleted between Click 1 and Click 2.
        if (resolvedStartNodeId === null) {
          if (beamStartPoint) {
            resolvedStartNodeId = addNode(next, beamStartPoint).id
          } else {
            // No start point at all (shouldn't happen if state machine is
            // intact) — bail without mutating.
            return next
          }
        } else if (!(resolvedStartNodeId in prev.nodes)) {
          if (beamStartPoint) {
            const recreated = addNode(next, beamStartPoint)
            resolvedStartNodeId = recreated.id
          }
        }

        // (b) Resolve / create the end node.
        resolvedEndNodeId = findOrCreateNode(next, endPos)

        // (c) Prevent zero-length beams (end === start). addBeam already
        // guards this internally, but skipping creation here keeps the
        // structure clean (no stray duplicate attempt).
        if (resolvedStartNodeId !== null && resolvedEndNodeId !== null && resolvedStartNodeId !== resolvedEndNodeId) {
          addBeam(next, resolvedStartNodeId, resolvedEndNodeId)
        }
        return next
      })

      // Always reset beam placement state after Click 2 (success or cancel).
      setBeamStage('idle')
      setBeamStartPoint(null)
      setBeamStartNodeId(null)
      setBeamEndPoint(null)
    }
  }, [mode, beamStartPoint, beamStartNodeId, snapSize, networkState.nodes, networkState.nextNodeId, setBeamStage])

  // Global keydown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '1') setMode('addNode')
      else if (e.key === '2') setMode('addBeam')
      else if (e.key === '3') setMode('delete')
      else if (e.key === '4') setMode('select')
      else if (e.key === 'Escape') {
        setSelectedNodeId(null)
        setDraggingNodeId(null)
        setBeamStage('idle')
        setBeamStartPoint(null)
        setBeamStartNodeId(null)
        setBeamEndPoint(null)
      }
      else if (e.code === 'Space') {
        e.preventDefault()
        toggleSimulate()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setMode, setSelectedNodeId, setDraggingNodeId, toggleSimulate])

  // End node drag whenever the pointer goes up anywhere — the actual
  // grid-snapped drag movement is handled inside <ViewportInteractions>
  // (it has access to the R3F pointer / camera and the placement plane).
  useEffect(() => {
    if (draggingNodeId === null || draggingNodeId === undefined) return
    const handlePointerUp = () => {
      setDraggingNodeId(null)
    }
    window.addEventListener('pointerup', handlePointerUp)
    return () => window.removeEventListener('pointerup', handlePointerUp)
  }, [draggingNodeId])

  // Begin dragging a node when the user presses LMB on it in Move/Select mode.
  const handleNodePointerDown = useCallback((nodeId: number, event: any) => {
    if (mode !== 'select') return
    if (event.button !== 0 && event.nativeEvent?.button !== 0) return
    event.stopPropagation()
    setSelectedNodeId(nodeId)
    setDraggingNodeId(nodeId)
  }, [mode])

  // Delete tool handlers
  const handleNodeDelete = useCallback((nodeId: number, event: any) => {
    if (mode !== 'delete') return
    if (event.button !== 0 && event.nativeEvent?.button !== 0) return
    event.stopPropagation()
    setNetworkState((prev) => {
      const next = { ...prev, nodes: { ...prev.nodes }, beams: { ...prev.beams }, nextNodeId: prev.nextNodeId, nextBeamId: prev.nextBeamId }
      removeNode(next, nodeId)
      return next
    })
    setSelectedNodeId(null)
  }, [mode])

  const handleBeamDelete = useCallback((beamId: number, event: any) => {
    if (mode !== 'delete') return
    if (event.button !== 0 && event.nativeEvent?.button !== 0) return
    event.stopPropagation()
    setNetworkState((prev) => {
      const next = { ...prev, nodes: { ...prev.nodes }, beams: { ...prev.beams }, nextNodeId: prev.nextNodeId, nextBeamId: prev.nextBeamId }
      removeBeam(next, beamId)
      return next
    })
  }, [mode])

  const handleViewAlign = useCallback((view: string) => {
    if (controlsRef.current) {
      alignCameraToView(controlsRef.current, view)
    }
  }, [])

  // OrbitControls should only be disabled during an active node drag,
  // NOT while the simulation is running — keeps camera rotation working.
  const isDraggingNode = draggingNodeId !== null && draggingNodeId !== undefined

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <Canvas
        camera={{ position: [5, 5, 5], fov: 60 }}
        shadows
        onCreated={(state) => { cameraRef.current = state.camera }}
      >
        <color attach="background" args={['#0a0a0a']} />
        <fog attach="fog" args={['#0a0a0a', 20, 60]} />
        <NetworkRenderer
          networkState={networkState}
          selectedNodeId={selectedNodeId}
          hoveredNodeId={hoveredNodeId}
          hoveredBeamId={hoveredBeamId}
          ghostBeam={beamStage === 'dragging' && beamStartPoint && beamEndPoint ? { start: beamStartPoint, end: beamEndPoint } : null}
          snapPoint={snapPoint}
          snapTargetType={snapTargetType}
          onNodePointerDown={handleNodePointerDown}
          onNodeDelete={handleNodeDelete}
          onBeamDelete={handleBeamDelete}
          snapSize={snapSize}
        />
        <GroundPlane onPointerDown={handleGroundClick} />
        {mode === 'addBeam' && (
          <PlacementPlane
            onPointerDown={handleBeamPlace}
            beamStage={beamStage}
          />
        )}
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={50}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <Environment preset="city" background={false} />
        <PhysicsLoop
          isSimulating={isSimulating}
          networkState={networkState}
          setRenderTrigger={setRenderTrigger}
        />
        <ViewportInteractions
          mode={mode}
          networkState={networkState}
          beamStage={beamStage}
          beamStartNodeId={beamStartNodeId}
          beamStartPoint={beamStartPoint}
          snapSize={snapSize}
          draggedNodeId={draggingNodeId}
          onBeamStageChange={setBeamStage}
          onBeamEndPointChange={setBeamEndPoint}
          onSnapPointChange={setSnapPoint}
          onSnapTargetTypeChange={setSnapTargetType}
          onNetworkUpdate={setNetworkState}
        />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={2}
          maxDistance={100}
          maxPolarAngle={Math.PI}
          minPolarAngle={0}
          mouseButtons={{ LEFT: undefined, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
          enabled={!isDraggingNode}
          ref={controlsRef}
        />
      </Canvas>

      <EditorUI
        networkState={networkState}
        mode={mode}
        setMode={setMode}
        selectedNodeId={selectedNodeId}
        setSelectedNodeId={setSelectedNodeId}
        onClearNetwork={clearNetwork}
        isSimulating={isSimulating}
        onToggleSimulate={toggleSimulate}
        onViewAlign={handleViewAlign}
        beamStage={beamStage}
        beamStartNodeId={beamStartNodeId}
        snapSize={snapSize}
        onSnapSizeChange={setSnapSize}
      />
    </div>
  )
}