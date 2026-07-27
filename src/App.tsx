import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, Environment } from '@react-three/drei'
import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Vector3, Raycaster, Plane } from 'three'

import { EditorUI, EditorMode } from './components/EditorUI'
import {
  createNetwork,
  addNode,
  addBeam,
  removeNode,
  removeBeam,
  NodeBeamNetworkState,
  Node,
  Beam,
} from './sim/network'
import { stepPhysics, PhysicsOptions } from './sim/physics'

function GroundPlane({ onPointerDown }: { onPointerDown: (point: Vector3, event: any) => void }) {
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.001, 0]}
        receiveShadow
        onPointerDown={(e) => {
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

function NodeSphere({ node, isSelected, isFixed, onClick, onPointerDown }: {
  node: Node
  isSelected: boolean
  isFixed: boolean
  onClick: (id: number) => void
  onPointerDown: (id: number, event: any) => void
}) {
  const material = useMemo(() => {
    if (isFixed) return fixedMaterial
    if (isSelected) return selectedMaterial
    return neutralMaterial
  }, [isFixed, isSelected])

  return (
    <mesh
      geometry={sphereGeometry}
      material={material}
      position={node.position.toArray()}
      castShadow
      receiveShadow
      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(node.id, e); }}
      onClick={(e) => { e.stopPropagation(); onClick(node.id); }}
    />
  )
}

function BeamCylinder({ beam, nodeA, nodeB, isBroken, onClick }: {
  beam: Beam
  nodeA: Node
  nodeB: Node
  isBroken: boolean
  onClick: (id: number) => void
}) {
  const start = nodeA.position
  const end = nodeB.position
  const direction = new Vector3().subVectors(end, start)
  const length = direction.length()
  const mid = new Vector3().addVectors(start, end).multiplyScalar(0.5)

  const quaternion = new THREE.Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize())
  const rotation = new THREE.Euler().setFromQuaternion(quaternion)

  return (
    <group position={mid.toArray()} rotation={rotation.toArray()}>
      <mesh
        geometry={cylinderGeometry}
        material={isBroken ? brokenBeamMaterial : beamMaterial}
        scale={[0.05, length, 0.05]}
        castShadow
        receiveShadow
        onClick={(e) => { e.stopPropagation(); onClick(beam.id); }}
      />
    </group>
  )
}

const sphereGeometry = new THREE.SphereGeometry(0.18, 16, 16)
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true)

const neutralMaterial = new THREE.MeshStandardMaterial({ color: 0x33ccff, roughness: 0.5, metalness: 0.1 })
const fixedMaterial = new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.6, metalness: 0.2 })
const selectedMaterial = new THREE.MeshStandardMaterial({ color: 0xffdd33, roughness: 0.4, metalness: 0.3, emissive: 0x333300, emissiveIntensity: 0.5 })
const beamMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7, metalness: 0.3, transparent: true, opacity: 0.85 })
const brokenBeamMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.6 })

const DEFAULT_PHYSICS_OPTIONS: PhysicsOptions = {
  gravity: -9.81,
  subSteps: 10,
  groundY: 0,
  groundDamping: 0.5,
  groundFriction: 0.9,
}

interface SceneContentProps {
  cameraRef: React.MutableRefObject<THREE.Camera | null>
  networkState: NodeBeamNetworkState
  setNetworkState: React.Dispatch<React.SetStateAction<NodeBeamNetworkState>>
  mode: EditorMode
  setMode: (mode: EditorMode) => void
  selectedNodeId: number | null
  setSelectedNodeId: (id: number | null) => void
  pendingBeamNodeId: number | null
  setPendingBeamNodeId: (id: number | null) => void
  draggingNodeId: number | null
  setDraggingNodeId: (id: number | null) => void
  dragPlane: Plane | null
  setDragPlane: (plane: Plane | null) => void
  isSimulating: boolean
}

function SceneContent({
  cameraRef,
  networkState,
  setNetworkState,
  mode,
  setMode,
  selectedNodeId,
  setSelectedNodeId,
  pendingBeamNodeId,
  setPendingBeamNodeId,
  draggingNodeId,
  setDraggingNodeId,
  dragPlane,
  setDragPlane,
  isSimulating,
}: SceneContentProps) {
  const handleGroundClick = useCallback((point: Vector3) => {
    if (mode === 'addNode') {
      setNetworkState((prev) => {
        const next = { ...prev, nodes: { ...prev.nodes }, beams: { ...prev.beams }, nextNodeId: prev.nextNodeId, nextBeamId: prev.nextBeamId }
        addNode(next, point)
        return next
      })
    }
  }, [mode, setNetworkState])

  const handleNodeClick = useCallback((nodeId: number) => {
    if (mode === 'addBeam') {
      if (pendingBeamNodeId === null) {
        setPendingBeamNodeId(nodeId)
      } else if (pendingBeamNodeId !== nodeId) {
        setNetworkState((prev) => {
          const next = { ...prev, nodes: { ...prev.nodes }, beams: { ...prev.beams }, nextNodeId: prev.nextNodeId, nextBeamId: prev.nextBeamId }
          addBeam(next, pendingBeamNodeId, nodeId)
          return next
        })
        setPendingBeamNodeId(null)
      }
    } else if (mode === 'delete') {
      setNetworkState((prev) => {
        const next = { ...prev, nodes: { ...prev.nodes }, beams: { ...prev.beams }, nextNodeId: prev.nextNodeId, nextBeamId: prev.nextBeamId }
        removeNode(next, nodeId)
        return next
      })
      if (selectedNodeId === nodeId) setSelectedNodeId(null)
    } else if (mode === 'select') {
      setSelectedNodeId(nodeId)
    }
  }, [mode, pendingBeamNodeId, selectedNodeId, setNetworkState, setPendingBeamNodeId, setSelectedNodeId])

  const handleNodePointerDown = useCallback((nodeId: number, event: any) => {
    event.stopPropagation()
    if (mode === 'select' && !event.button) {
      const node = networkState.nodes[nodeId]
      if (node && !node.isFixed) {
        setDraggingNodeId(nodeId)
        const camera = cameraRef.current
        if (camera) {
          const normal = new THREE.Vector3().subVectors(camera.position, node.position).normalize()
          setDragPlane(new Plane().setFromNormalAndCoplanarPoint(normal, node.position))
        }
      }
    }
  }, [mode, networkState.nodes, cameraRef, setDraggingNodeId, setDragPlane])

  const handleBeamClick = useCallback((beamId: number) => {
    if (mode === 'delete') {
      setNetworkState((prev) => {
        const next = { ...prev, nodes: { ...prev.nodes }, beams: { ...prev.beams }, nextNodeId: prev.nextNodeId, nextBeamId: prev.nextBeamId }
        removeBeam(next, beamId)
        return next
      })
    }
  }, [mode, setNetworkState])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '1') setMode('addNode')
      else if (e.key === '2') setMode('addBeam')
      else if (e.key === '3') setMode('delete')
      else if (e.key === '4') setMode('select')
      else if (e.key === 'Escape') {
        setSelectedNodeId(null)
        setPendingBeamNodeId(null)
        setDraggingNodeId(null)
      }
      else if (e.code === 'Space') {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setMode, setSelectedNodeId, setPendingBeamNodeId, setDraggingNodeId])

  useEffect(() => {
    if (!draggingNodeId) return
    const handlePointerMove = (e: PointerEvent) => {
      const canvas = e.target as HTMLCanvasElement
      const rect = canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )
      const raycaster = new Raycaster()
      raycaster.setFromCamera(mouse, cameraRef.current!)
      const intersection = new Vector3()
      if (dragPlane && raycaster.ray.intersectPlane(dragPlane, intersection)) {
        setNetworkState((prev) => {
          const next = { ...prev, nodes: { ...prev.nodes }, beams: { ...prev.beams }, nextNodeId: prev.nextNodeId, nextBeamId: prev.nextBeamId }
          const node = next.nodes[draggingNodeId]
          if (node) node.position.copy(intersection)
          return next
        })
      }
    }
    const handlePointerUp = () => {
      setDraggingNodeId(null)
      setDragPlane(null)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [draggingNodeId, dragPlane, cameraRef, setNetworkState, setDraggingNodeId, setDragPlane])

  useFrame((_, delta) => {
    if (isSimulating) {
      setNetworkState((prev) => {
        const next = {
          ...prev,
          nodes: { ...prev.nodes },
          beams: { ...prev.beams },
          nextNodeId: prev.nextNodeId,
          nextBeamId: prev.nextBeamId,
        }
        for (const key of Object.keys(next.nodes)) {
          next.nodes[Number(key)] = { ...next.nodes[Number(key)], position: next.nodes[Number(key)].position.clone(), velocity: next.nodes[Number(key)].velocity.clone(), forceAccumulator: new THREE.Vector3() }
        }
        for (const key of Object.keys(next.beams)) {
          next.beams[Number(key)] = { ...next.beams[Number(key)] }
        }
        stepPhysics(next, delta, DEFAULT_PHYSICS_OPTIONS)
        return next
      })
    }
  })

  return (
    <group>
      <GroundPlane onPointerDown={handleGroundClick} />
      {Object.values(networkState.nodes).map((node) => (
        <NodeSphere
          key={node.id}
          node={node}
          isSelected={node.id === selectedNodeId}
          isFixed={node.isFixed}
          onClick={handleNodeClick}
          onPointerDown={handleNodePointerDown}
        />
      ))}
      {Object.values(networkState.beams).map((beam) => {
        const nodeA = networkState.nodes[beam.nodeAId]
        const nodeB = networkState.nodes[beam.nodeBId]
        if (!nodeA || !nodeB) return null
        const isBroken = beam.maxStress !== Infinity && beam.currentStress !== undefined && beam.currentStress > beam.maxStress
        return (
          <BeamCylinder
            key={beam.id}
            beam={beam}
            nodeA={nodeA}
            nodeB={nodeB}
            isBroken={isBroken}
            onClick={handleBeamClick}
          />
        )
      })}
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
    </group>
  )
}

export default function App() {
  const cameraRef = useRef<THREE.Camera | null>(null)
  const controlsRef = useRef<any>(null)
  const [networkState, setNetworkState] = useState<NodeBeamNetworkState>(createNetwork())
  const [mode, setMode] = useState<EditorMode>('addNode')
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [pendingBeamNodeId, setPendingBeamNodeId] = useState<number | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<number | null>(null)
  const [dragPlane, setDragPlane] = useState<Plane | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)

  const clearNetwork = useCallback(() => {
    setNetworkState(createNetwork())
    setSelectedNodeId(null)
    setPendingBeamNodeId(null)
    setDraggingNodeId(null)
    setDragPlane(null)
  }, [])

  const toggleSimulate = useCallback(() => {
    setIsSimulating((prev) => !prev)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <Canvas
        camera={{ position: [5, 5, 5], fov: 60 }}
        shadows
        onCreated={(state) => { cameraRef.current = state.camera }}
      >
        <color attach="background" args={['#0a0a0a']} />
        <fog attach="fog" args={['#0a0a0a', 20, 60]} />
        <Grid
          infiniteGrid
          cellSize={1}
          cellThickness={0.6}
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#3a3a3a"
          cellColor="#1a1a1a"
          fadeDistance={50}
          position={[0, 0, 0]}
        />
        <SceneContent
          cameraRef={cameraRef}
          networkState={networkState}
          setNetworkState={setNetworkState}
          mode={mode}
          setMode={setMode}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
          pendingBeamNodeId={pendingBeamNodeId}
          setPendingBeamNodeId={setPendingBeamNodeId}
          draggingNodeId={draggingNodeId}
          setDraggingNodeId={setDraggingNodeId}
          dragPlane={dragPlane}
          setDragPlane={setDragPlane}
          isSimulating={isSimulating}
        />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={2}
          maxDistance={100}
          maxPolarAngle={Math.PI / 2 - 0.05}
          ref={controlsRef}
        />
      </Canvas>

      <EditorUI
        networkState={networkState}
        mode={mode}
        setMode={setMode}
        selectedNodeId={selectedNodeId}
        setSelectedNodeId={setSelectedNodeId}
        pendingBeamNodeId={pendingBeamNodeId}
        setPendingBeamNodeId={setPendingBeamNodeId}
        onClearNetwork={clearNetwork}
        isSimulating={isSimulating}
        onToggleSimulate={toggleSimulate}
      />
    </div>
  )
}