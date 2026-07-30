import { useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type {
  Beam3D,
  Node3D,
} from '../types/nodeGraph'
import { useNetworkStore } from '../store/networkStore'
import { useEditorStore } from '../store/editorStore'

const UP = new THREE.Vector3(0, 1, 0)
const NODE_RADIUS = 0.2
const BEAM_RADIUS = 0.06

const BASE_COLOR_FREE = '#33eeff'
const BASE_COLOR_FIXED = '#ff3355'
const HOVER_COLOR = '#ffea33'

function NodeMesh({ node }: { node: Node3D }) {
  const isHovered =
    useEditorStore((s) => s.hoveredNodeId) === node.id

  function onPointerOver(e: ThreeEvent<PointerEvent>) {
    if (useEditorStore.getState().mode !== 'ADD_BEAM') {
      return
    }
    e.stopPropagation()
    useEditorStore.getState().setHoveredNodeId(node.id)
  }

  function onPointerOut(e: ThreeEvent<PointerEvent>) {
    if (useEditorStore.getState().mode !== 'ADD_BEAM') {
      return
    }
    e.stopPropagation()
    if (useEditorStore.getState().hoveredNodeId === node.id) {
      useEditorStore.getState().clearHoveredNodeId()
    }
  }

  function onPointerMove(e: ThreeEvent<PointerEvent>) {
    if (useEditorStore.getState().mode !== 'ADD_BEAM') {
      return
    }
    e.stopPropagation()
    useEditorStore.getState().setHoveredNodeId(node.id)
  }

  function onClick(e: ThreeEvent<MouseEvent>) {
    if (e.button !== 0) {
      return
    }
    const state = useEditorStore.getState()
    if (state.mode !== 'ADD_BEAM') {
      return
    }
    e.stopPropagation()

    if (state.beamStage === 'idle') {
      state.setBeamStart(node.id, {
        x: node.position.x,
        y: node.position.y,
        z: node.position.z,
      })
      return
    }

    if (state.beamStage === 'awaiting-second-point') {
      const startId = state.beamStartNodeId
      if (startId === null || startId === undefined) {
        return
      }
      if (node.id === startId) {
        return
      }
      const ok = useNetworkStore.getState().commitBeamEndToNode(node.id, startId)
      if (ok) {
        state.resetBeamPlacement()
      }
    }
  }

  const color = isHovered
    ? HOVER_COLOR
    : node.isFixed
      ? BASE_COLOR_FIXED
      : BASE_COLOR_FREE

  return (
    <mesh
      position={node.position}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerMove={onPointerMove}
      onClick={onClick}
      castShadow
      receiveShadow
    >
      <sphereGeometry args={[NODE_RADIUS, 24, 24]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
    </mesh>
  )
}

function BeamMesh({
  beam,
  positions,
}: {
  beam: Beam3D
  positions: Map<string, THREE.Vector3>
}) {
  const a = positions.get(beam.nodeAId)
  const b = positions.get(beam.nodeBId)

  return useMemo(() => {
    if (a === undefined || b === undefined) return null

    const direction = new THREE.Vector3().subVectors(b, a)
    const length = direction.length()
    if (length < 1e-6) return null

    const midpoint = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      UP,
      direction.clone().normalize(),
    )
    if (Number.isNaN(quaternion.x)) return null

    return (
      <mesh
        position={midpoint}
        quaternion={quaternion}
        scale={[1, length, 1]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[BEAM_RADIUS, BEAM_RADIUS, 1, 16]} />
        <meshStandardMaterial color="#aabbdd" roughness={0.6} metalness={0.2} />
      </mesh>
    )
  }, [a, b])
}

export default function NetworkRenderer() {
  const networkState = useNetworkStore((s) => s.networkState)

  const positions = useMemo(() => {
    const m = new Map<string, THREE.Vector3>()
    networkState.nodes.forEach((n) => m.set(n.id, n.position))
    return m
  }, [networkState])

  const nodes = useMemo(
    () => Array.from(networkState.nodes.values()) as Node3D[],
    [networkState],
  )
  const beams = useMemo(
    () => Array.from(networkState.beams.values()) as Beam3D[],
    [networkState],
  )

  return (
    <group>
      {beams.map((beam) => (
        <BeamMesh key={beam.id} beam={beam} positions={positions} />
      ))}
      {nodes.map((node) => (
        <NodeMesh key={node.id} node={node} />
      ))}
    </group>
  )
}
