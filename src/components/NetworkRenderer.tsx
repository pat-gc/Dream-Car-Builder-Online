import { SphereGeometry, CylinderGeometry, MeshStandardMaterial, Vector3, Quaternion, Euler } from 'three'
import { Grid } from '@react-three/drei'
import { useMemo } from 'react'
import { NodeBeamNetworkState, Node, Beam } from '../sim/network'

interface NetworkRendererProps {
  networkState: NodeBeamNetworkState
  selectedNodeId: number | null
  hoveredNodeId: number | null
  hoveredBeamId: number | null
  ghostBeam: { start: Vector3; end: Vector3 } | null
  snapPoint: Vector3 | null
  snapTargetType: 'node' | 'plane' | null
  onNodePointerDown?: (nodeId: number, event: any) => void
  onNodeDelete?: (nodeId: number, event: any) => void
  onBeamDelete?: (beamId: number, event: any) => void
  snapSize: number
}

const sphereGeometry = new SphereGeometry(0.18, 16, 16)
const cylinderGeometry = new CylinderGeometry(1, 1, 1, 8, 1, true)

const neutralMaterial = new MeshStandardMaterial({ color: 0x33ccff, roughness: 0.5, metalness: 0.1 })
const fixedMaterial = new MeshStandardMaterial({ color: 0xff3333, roughness: 0.6, metalness: 0.2 })
const selectedMaterial = new MeshStandardMaterial({ color: 0xffdd33, roughness: 0.4, metalness: 0.3, emissive: 0x333300, emissiveIntensity: 0.5 })
const hoveredMaterial = new MeshStandardMaterial({ color: 0x66ffff, roughness: 0.3, metalness: 0.1, emissive: 0x004444, emissiveIntensity: 0.4 })
const beamMaterial = new MeshStandardMaterial({ color: 0x888888, roughness: 0.7, metalness: 0.3, transparent: true, opacity: 0.85 })
const beamBrokenMaterial = new MeshStandardMaterial({ color: 0xff4444, roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.6 })
const beamSelectedMaterial = new MeshStandardMaterial({ color: 0xffdd33, roughness: 0.4, metalness: 0.3, transparent: true, opacity: 1 })
const beamHoveredMaterial = new MeshStandardMaterial({ color: 0x66ffff, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 1 })
const snapPointMaterial = new MeshStandardMaterial({ color: 0x00ff88, roughness: 0.2, metalness: 0.1, emissive: 0x003311, emissiveIntensity: 0.6 })
const ghostBeamMaterial = new MeshStandardMaterial({ color: 0x88ccff, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.4 })

function getBeamMaterial(isSelected: boolean, isHovered: boolean, isBroken: boolean) {
  if (isSelected) return beamSelectedMaterial
  if (isHovered) return beamHoveredMaterial
  if (isBroken) return beamBrokenMaterial
  return beamMaterial
}

function createBeamMesh(
  beam: Beam,
  nodeA: Node,
  nodeB: Node,
  isSelected: boolean,
  isHovered: boolean,
  isBroken: boolean,
  onBeamDelete?: (beamId: number, event: any) => void
) {
  const start = nodeA.position
  const end = nodeB.position
  const direction = new Vector3().subVectors(end, start)
  const length = direction.length()
  if (length === 0) return null
  const mid = new Vector3().addVectors(start, end).multiplyScalar(0.5)

  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize())
  const material = getBeamMaterial(isSelected, isHovered, isBroken)

  return (
    <mesh
      geometry={cylinderGeometry}
      material={material}
      position={mid.toArray()}
      rotation={new Euler().setFromQuaternion(quaternion).toArray()}
      scale={[0.05, length, 0.05]}
      castShadow
      receiveShadow
      userData={{ beamId: beam.id }}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.nativeEvent?.button !== 0) return
        e.stopPropagation()
        onBeamDelete?.(beam.id, e)
      }}
    />
  )
}

function createGhostBeamMesh(start: Vector3, end: Vector3) {
  const direction = new Vector3().subVectors(end, start)
  const length = direction.length()
  if (length === 0) return null
  const mid = new Vector3().addVectors(start, end).multiplyScalar(0.5)
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize())
  const euler = new Euler().setFromQuaternion(quaternion)

  return (
    <mesh
      geometry={cylinderGeometry}
      material={ghostBeamMaterial}
      position={mid.toArray()}
      rotation={euler.toArray()}
      scale={[0.06, length, 0.06]}
      castShadow={false}
      receiveShadow={false}
    />
  )
}

function createSnapPointMesh(position: Vector3, type: 'node' | 'plane') {
  const geometry = type === 'node' ? sphereGeometry : new SphereGeometry(0.12, 12, 12)
  const material = type === 'node' ? snapPointMaterial : new MeshStandardMaterial({
    color: 0x88ccff,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    opacity: 0.6,
    emissive: 0x002244,
    emissiveIntensity: 0.4
  })
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position.toArray()}
      castShadow={false}
      receiveShadow={false}
    />
  )
}

// Compute the bounding-box-derived extent of all nodes so the grid can expand
// dynamically with the structure rather than relying on a fixed fade distance.
function useGridExtent(nodes: NodeBeamNetworkState['nodes']) {
  return useMemo(() => {
    const positions = Object.values(nodes).map((n) => n.position)
    if (positions.length === 0) return 20 // default comfortable extent
    let maxAbs = 10
    for (const p of positions) {
      maxAbs = Math.max(maxAbs, Math.abs(p.x), Math.abs(p.z), Math.abs(p.y))
    }
    // Give ~50% padding around the structure so the grid always surrounds it.
    return Math.ceil(maxAbs * 1.5)
  }, [nodes])
}

export function NetworkRenderer({
  networkState,
  selectedNodeId,
  hoveredNodeId,
  hoveredBeamId,
  ghostBeam,
  snapPoint,
  snapTargetType,
  onNodePointerDown,
  onNodeDelete,
  onBeamDelete,
  snapSize,
}: NetworkRendererProps) {
  const gridExtent = useGridExtent(networkState.nodes)

  return (
    <group>
      {/* High-contrast dynamic grid: primary lines #00ffcc, secondary #445566.
          cellSize follows snapSize when set (for a visible snap preview),
          otherwise falls back to 1.0. */}
      <Grid
        infiniteGrid={false}
        args={[gridExtent * 2, gridExtent * 2]}
        cellSize={snapSize > 0 ? snapSize : 1}
        cellThickness={0.7}
        cellColor="#445566"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#00ffcc"
        fadeDistance={gridExtent * 2}
        fadeStrength={0}
        followCamera={false}
        position={[0, 0, 0]}
        material-transparent={true}
        material-opacity={0.8}
      />

      {Object.values(networkState.beams).map((beam) => {
        const nodeA = networkState.nodes[beam.nodeAId]
        const nodeB = networkState.nodes[beam.nodeBId]
        if (!nodeA || !nodeB) return null
        const isBroken = beam.maxStress !== Infinity && beam.currentStress !== undefined && beam.currentStress > beam.maxStress
        return (
          <group key={beam.id}>
            {createBeamMesh(beam, nodeA, nodeB, false, hoveredBeamId === beam.id, isBroken, onBeamDelete)}
          </group>
        )
      })}

      {Object.values(networkState.nodes).map((node) => {
        const isSelected = node.id === selectedNodeId
        const isHovered = !isSelected && node.id === hoveredNodeId
        let material = node.isFixed ? fixedMaterial : neutralMaterial
        if (isSelected) material = selectedMaterial
        else if (isHovered) material = hoveredMaterial

        return (
          <mesh
            key={node.id}
            geometry={sphereGeometry}
            material={material}
            position={node.position.toArray()}
            castShadow
            receiveShadow
            userData={{ nodeId: node.id }}
            onPointerDown={(e) => {
              if (e.button !== 0 && e.nativeEvent?.button !== 0) return
              e.stopPropagation()
              onNodePointerDown?.(node.id, e)
              onNodeDelete?.(node.id, e)
            }}
          />
        )
      })}

      {ghostBeam && createGhostBeamMesh(ghostBeam.start, ghostBeam.end)}

      {snapPoint && snapTargetType && createSnapPointMesh(snapPoint, snapTargetType)}
    </group>
  )
}
