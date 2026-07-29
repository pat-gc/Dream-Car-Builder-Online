import { useMemo } from 'react'
import * as THREE from 'three'
import type {
  Beam3D,
  Node3D,
} from '../types/nodeGraph'
import type { NetworkState } from '../sim/network'

const UP = new THREE.Vector3(0, 1, 0)
const NODE_RADIUS = 0.2
const BEAM_RADIUS = 0.06

function NodeMesh({ node }: { node: Node3D }) {
  return (
    <mesh position={node.position} castShadow receiveShadow>
      <sphereGeometry args={[NODE_RADIUS, 24, 24]} />
      <meshStandardMaterial
        color={node.isFixed ? '#ff3355' : '#33eeff'}
        roughness={0.4}
        metalness={0.1}
      />
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

export default function NetworkRenderer({
  networkState,
}: {
  networkState: NetworkState
}) {
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
