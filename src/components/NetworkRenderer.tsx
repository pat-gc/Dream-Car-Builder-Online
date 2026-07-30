import { useMemo } from 'react'
import * as THREE from 'three'
import type {
  Beam3D,
  Node3D,
} from '../types/nodeGraph'
import { useNetworkStore } from '../store/networkStore'
import { useEditorStore } from '../store/editorStore'
import { sharedMeshRegistry } from '../sim/meshRegistry'

const UP = new THREE.Vector3(0, 1, 0)
const NODE_RADIUS = 0.2
const BEAM_RADIUS = 0.06

const BASE_COLOR_FREE = '#33eeff'
const BASE_COLOR_FIXED = '#ff3355'
const HOVER_COLOR_ADD_BEAM = '#ffea33'
const HOVER_COLOR_SELECT_MOVE = '#ff8a1e'
const HOVER_COLOR_DELETE = '#ff3030'

const BASE_COLOR_BEAM = '#aabbdd'
const HOVER_COLOR_BEAM_DELETE = '#ff3030'

const SELECTED_RING_COLOR = '#ffffff'
const SELECTED_RING_RADIUS_SCALE = 1.35

function NodeMesh({ node }: { node: Node3D }) {
  const hoveredNodeId = useEditorStore((s) => s.hoveredNodeId)
  const selectedNodeIds = useEditorStore((s) => s.selectedNodeIds)
  const mode = useEditorStore((s) => s.mode)

  const isHovered = hoveredNodeId === node.id
  const isSelected = selectedNodeIds.has(node.id)

  const color = isHovered
    ? mode === 'SELECT_MOVE'
      ? HOVER_COLOR_SELECT_MOVE
      : mode === 'DELETE'
        ? HOVER_COLOR_DELETE
        : HOVER_COLOR_ADD_BEAM
    : node.isFixed
      ? BASE_COLOR_FIXED
      : BASE_COLOR_FREE

  return (
    <mesh
      ref={(obj) => sharedMeshRegistry.registerNode(node.id, obj)}
      position={node.position}
      castShadow
      receiveShadow
    >
      <sphereGeometry args={[NODE_RADIUS, 24, 24]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
      {isSelected ? (
        <mesh>
          <sphereGeometry
            args={[NODE_RADIUS * SELECTED_RING_RADIUS_SCALE, 16, 16]}
          />
          <meshBasicMaterial
            color={SELECTED_RING_COLOR}
            wireframe
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
      ) : null}
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
  const hoveredBeamId = useEditorStore((s) => s.hoveredBeamId)
  const mode = useEditorStore((s) => s.mode)

  const a = positions.get(beam.nodeAId)
  const b = positions.get(beam.nodeBId)

  const isHovered = hoveredBeamId === beam.id && mode === 'DELETE'

  const geometry = useMemo(() => {
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

    return { midpoint, quaternion, length }
  }, [a, b, beam.id])

  if (geometry === null) return null

  const color = isHovered ? HOVER_COLOR_BEAM_DELETE : BASE_COLOR_BEAM

  return (
    <mesh
      ref={(obj) => sharedMeshRegistry.registerBeam(beam.id, obj)}
      position={geometry.midpoint}
      quaternion={geometry.quaternion}
      scale={[1, geometry.length, 1]}
      castShadow
      receiveShadow
    >
      <cylinderGeometry args={[BEAM_RADIUS, BEAM_RADIUS, 1, 16]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.2} />
    </mesh>
  )
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
