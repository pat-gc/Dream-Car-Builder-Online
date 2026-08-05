import { useMemo, useRef, useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type {
  Beam3D,
  Node3D,
} from '../types/nodeGraph'
import type {
  RigidMount,
  TransmissionLink,
  WheelPart,
} from '../types/vehicleParts'
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

// Step 16c — part visual constants.
const WHEEL_BEAM_RADIUS = 0.07
const WHEEL_RADIUS_SCALE = 1.0 // multiplied by WheelPart.wheelRadius
const WHEEL_THICKNESS = 0.2
const TRANSMISSION_RADIUS = 0.04
const TRANSMISSION_COLOR = '#c9a227' // distinct amber/yellow-ish
const MOUNT_LINE_RADIUS = 0.05
const MOUNT_LINE_COLOR = '#7ad0ff'
const ENGINE_COLOR = '#9aa6b5'
const SEAT_COLOR = '#b58a4a'
const GHOST_PART_COLOR = '#ffee44'
const GHOST_PART_LINE_RADIUS = 0.06
const GHOST_NODE_RADIUS = 0.15

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

// Shared helper: build a unit-cylinder transform (midpoint, quaternion, length)
// from two endpoints. Returns null for a degenerate (zero-length) axis, which
// is guarded before quaternion.setFromUnitVectors (per the rendering rules).
function cylinderTransform(
  a: THREE.Vector3,
  b: THREE.Vector3,
  out: { midpoint: THREE.Vector3; quaternion: THREE.Quaternion },
): { length: number } | null {
  const dir = new THREE.Vector3().subVectors(b, a)
  const length = dir.length()
  if (length < 1e-6) return null
  dir.divideScalar(length)
  out.quaternion.setFromUnitVectors(UP, dir)
  if (Number.isNaN(out.quaternion.x)) return null
  out.midpoint.addVectors(a, b).multiplyScalar(0.5)
  return { length }
}

// Step 16c — live node-position reader. During simulation, PhysicsLoop writes
// node positions imperatively into sharedMeshRegistry.nodeMeshes; the part
// meshes below read those live positions in their own useFrame to keep their
// connecting cylinders/wheels following the structure without per-frame React
// reconciliation. Outside simulation, parts re-render off the committed
// networkState (part counts are tiny, so no hot-path concern).
function liveNodePos(nodeId: string, fallback: THREE.Vector3 | undefined): THREE.Vector3 | null {
  const mesh = sharedMeshRegistry.nodeMeshes.get(nodeId)
  if (mesh !== undefined) return mesh.position
  if (fallback !== undefined) return fallback
  return null
}

function WheelMesh({ wheel, positions }: { wheel: WheelPart; positions: Map<string, THREE.Vector3> }) {
  // Connection cylinder (nodeA -> nodeB) ref + wheel-disk ref at nodeB.
  const beamRef = useRef<THREE.Mesh>(null)
  const wheelRef = useRef<THREE.Mesh>(null)
  const isSimulating = useEditorStore((s) => s.isSimulating)

  const transform = useMemo(
    () => ({ midpoint: new THREE.Vector3(), quaternion: new THREE.Quaternion() }),
    [],
  )

  // Wheel-disk mesh orientation is perpendicular to the nodeA->nodeB axis. A
  // unit cylinder's axis is +Y; to make the disk's flat face perpendicular to
  // the beam, rotate the cylinder so its Y aligns with the beam axis, then
  // spin it 90deg about X so the disc faces sideways. We compute a single
  // quaternion combining both via setFromUnitVectors(UP, beamAxis) — which is
  // exactly the perpendicular-frame orientation we want (the disc lies in the
  // plane whose normal IS the beam axis).
  function applyTransforms(): void {
    const a = liveNodePos(wheel.nodeAId, positions.get(wheel.nodeAId))
    const b = liveNodePos(wheel.nodeBId, positions.get(wheel.nodeBId))
    if (a === null || b === null) return
    const beam = beamRef.current
    if (beam !== null) {
      const tf = cylinderTransform(a, b, transform)
      if (tf !== null) {
        beam.position.copy(transform.midpoint)
        beam.quaternion.copy(transform.quaternion)
        beam.scale.set(1, tf.length, 1)
        beam.visible = true
      } else {
        beam.visible = false
      }
    }
    const wheelMesh = wheelRef.current
    if (wheelMesh !== null) {
      const radius = wheel.wheelRadius * WHEEL_RADIUS_SCALE
      wheelMesh.position.copy(b)
      // Reuse the beam axis quaternion so the disc is perpendicular to it.
      const dir = new THREE.Vector3().subVectors(b, a)
      if (dir.lengthSq() > 1e-12) {
        const norm = dir.normalize()
        const q = new THREE.Quaternion().setFromUnitVectors(UP, norm)
        if (!Number.isNaN(q.x)) {
          wheelMesh.quaternion.copy(q)
          wheelMesh.scale.set(radius, WHEEL_THICKNESS, radius)
          wheelMesh.visible = true
        } else {
          wheelMesh.visible = false
        }
      } else {
        wheelMesh.visible = false
      }
    }
  }

  // Initial/committed placement: derive from networkState positions once per
  // positions change (reactive), cheap (few wheels). useLayoutEffect runs
  // after refs mount, before paint, so committed parts appear in place.
  useLayoutEffect(() => {
    applyTransforms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, wheel, isSimulating])

  useFrame(() => {
    if (!isSimulating) return
    applyTransforms()
  })

  return (
    <group>
      <mesh ref={beamRef} castShadow receiveShadow>
        <cylinderGeometry args={[WHEEL_BEAM_RADIUS, WHEEL_BEAM_RADIUS, 1, 16]} />
        <meshStandardMaterial color={BASE_COLOR_BEAM} roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh ref={wheelRef} castShadow receiveShadow>
        <cylinderGeometry args={[1, 1, 1, 24]} />
        <meshStandardMaterial color="#2a2f3a" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  )
}

function RigidMountMesh({ mount, positions }: { mount: RigidMount; positions: Map<string, THREE.Vector3> }) {
  const isSimulating = useEditorStore((s) => s.isSimulating)
  const lineRefs = [
    useRef<THREE.Mesh>(null),
    useRef<THREE.Mesh>(null),
    useRef<THREE.Mesh>(null),
  ]
  const markerRef = useRef<THREE.Mesh>(null)
  const transform = useMemo(
    () => ({ midpoint: new THREE.Vector3(), quaternion: new THREE.Quaternion() }),
    [],
  )
  const pairsIdx: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 0],
  ]

  function applyTransforms(): void {
    const nodePositions = mount.nodeIds.map((id) => liveNodePos(id, positions.get(id)))
    pairsIdx.forEach(([i, j], k) => {
      const a = nodePositions[i]
      const b = nodePositions[j]
      const mesh = lineRefs[k].current
      if (mesh === null) return
      if (a === null || b === null) {
        mesh.visible = false
        return
      }
      const tf = cylinderTransform(a, b, transform)
      if (tf === null) {
        mesh.visible = false
        return
      }
      mesh.position.copy(transform.midpoint)
      mesh.quaternion.copy(transform.quaternion)
      mesh.scale.set(1, tf.length, 1)
      mesh.visible = true
    })
    // Centroid marker.
    const marker = markerRef.current
    if (marker !== null) {
      const pts = nodePositions.filter((p): p is THREE.Vector3 => p !== null)
      if (pts.length > 0) {
        const c = new THREE.Vector3()
        for (const p of pts) c.add(p)
        c.multiplyScalar(1 / pts.length)
        marker.position.copy(c)
        marker.visible = true
      } else {
        marker.visible = false
      }
    }
  }

  useLayoutEffect(() => {
    applyTransforms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, mount, isSimulating])

  useFrame(() => {
    if (!isSimulating) return
    applyTransforms()
  })

  const markerColor = mount.type === 'ENGINE' ? ENGINE_COLOR : SEAT_COLOR

  return (
    <group>
      {lineRefs.map((_, k) => (
        <mesh key={k} ref={lineRefs[k]} castShadow receiveShadow>
          <cylinderGeometry args={[MOUNT_LINE_RADIUS, MOUNT_LINE_RADIUS, 1, 12]} />
          <meshStandardMaterial color={MOUNT_LINE_COLOR} roughness={0.5} metalness={0.2} />
        </mesh>
      ))}
      <mesh ref={markerRef} castShadow receiveShadow>
        {mount.type === 'ENGINE' ? (
          <boxGeometry args={[1, 0.8, 1.2]} />
        ) : (
          <sphereGeometry args={[0.5, 20, 16]} />
        )}
        <meshStandardMaterial color={markerColor} roughness={0.6} metalness={0.25} />
      </mesh>
    </group>
  )
}

function TransmissionMesh({
  link,
  positions,
}: {
  link: TransmissionLink
  positions: Map<string, THREE.Vector3>
}) {
  const lineRef = useRef<THREE.Mesh>(null)
  const isSimulating = useEditorStore((s) => s.isSimulating)
  const transform = useMemo(
    () => ({ midpoint: new THREE.Vector3(), quaternion: new THREE.Quaternion() }),
    [],
  )

  function applyTransforms(): void {
    const a = liveNodePos(link.nodeAId, positions.get(link.nodeAId))
    const b = liveNodePos(link.nodeBId, positions.get(link.nodeBId))
    const mesh = lineRef.current
    if (mesh === null) return
    if (a === null || b === null) {
      mesh.visible = false
      return
    }
    const tf = cylinderTransform(a, b, transform)
    if (tf === null) {
      mesh.visible = false
      return
    }
    mesh.position.copy(transform.midpoint)
    mesh.quaternion.copy(transform.quaternion)
    mesh.scale.set(1, tf.length, 1)
    mesh.visible = true
  }

  useLayoutEffect(() => {
    applyTransforms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, link, isSimulating])

  useFrame(() => {
    if (!isSimulating) return
    applyTransforms()
  })

  return (
    <mesh ref={lineRef} castShadow receiveShadow>
      <cylinderGeometry args={[TRANSMISSION_RADIUS, TRANSMISSION_RADIUS, 1, 12]} />
      <meshStandardMaterial
        color={TRANSMISSION_COLOR}
        roughness={0.5}
        metalness={0.1}
        emissive={TRANSMISSION_COLOR}
        emissiveIntensity={0.25}
      />
    </mesh>
  )
}

// Step 16c — ghost preview for part placement (two-click line + three-click
// triangle). Reads ghostPreviewPoint + placement stage IMPERATIVELY inside
// useFrame to avoid per-pointermove React reconciliation (State Management
// performance pattern). The committed nodes' live positions are read from the
// store networkState (static during editing).
function PartGhostPreview() {
  const lineRef = useRef<THREE.Mesh>(null)
  const triangleRefs = [
    useRef<THREE.Mesh>(null),
    useRef<THREE.Mesh>(null),
    useRef<THREE.Mesh>(null),
  ]
  const endNodeRef = useRef<THREE.Mesh>(null)
  const transform = useMemo(
    () => ({ midpoint: new THREE.Vector3(), quaternion: new THREE.Quaternion() }),
    [],
  )

  useFrame(() => {
    const ed = useEditorStore.getState()
    const net = useNetworkStore.getState().networkState
    const gp = ed.ghostPreviewPoint
    const visible =
      ed.ghostPreviewPoint !== null &&
      ((ed.mode === 'ADD_WHEEL' ||
        ed.mode === 'ADD_TRANSMISSION') &&
        ed.beamStage === 'awaiting-second-point' ||
        ((ed.mode === 'ADD_ENGINE' || ed.mode === 'ADD_SEAT') &&
          ed.mountStage !== 'idle'))

    // Hide everything by default.
    if (lineRef.current !== null) lineRef.current.visible = false
    triangleRefs.forEach((r) => {
      if (r.current !== null) r.current.visible = false
    })
    if (endNodeRef.current !== null) endNodeRef.current.visible = false

    if (!visible) return
    if (gp === null) return

    // Committed starting node(s).
    const startId = ed.beamStartNodeId
    const starts: THREE.Vector3[] = []
    if (startId !== null && startId !== undefined) {
      const n = net.nodes.get(startId)
      if (n !== undefined) starts.push(n.position)
    }
    if (ed.mode === 'ADD_ENGINE' || ed.mode === 'ADD_SEAT') {
      for (const id of ed.mountNodeIds) {
        const n = net.nodes.get(id)
        if (n !== undefined) starts.push(n.position)
      }
    }
    if (starts.length === 0) {
      // Click 1 hasn't committed a node yet — show the cursor ghost node only.
      if (endNodeRef.current !== null) {
        endNodeRef.current.visible = true
        endNodeRef.current.position.set(gp.x, gp.y, gp.z)
      }
      return
    }

    const end = new THREE.Vector3(gp.x, gp.y, gp.z)

    if (ed.mode === 'ADD_WHEEL' || ed.mode === 'ADD_TRANSMISSION') {
      const a = starts[0]
      const mesh = lineRef.current
      if (mesh !== null) {
        const tf = cylinderTransform(a, end, transform)
        if (tf !== null) {
          mesh.position.copy(transform.midpoint)
          mesh.quaternion.copy(transform.quaternion)
          mesh.scale.set(1, tf.length, 1)
          mesh.visible = true
        }
      }
    } else {
      // Mount: ghost triangle from each committed node to the cursor (line 0
      // repeated for each committed node) plus the committed-to-committed
      // edges drawn already by RigidMountMesh once finalized; here we show
      // the live line from each committed node to the cursor.
      starts.forEach((start, k) => {
        const ref = triangleRefs[k].current
        if (ref === null) return
        const tf = cylinderTransform(start, end, transform)
        if (tf === null) return
        ref.position.copy(transform.midpoint)
        ref.quaternion.copy(transform.quaternion)
        ref.scale.set(1, tf.length, 1)
        ref.visible = true
      })
      // After click 2 there are two committed nodes: also draw the committed
      // line between them so the player sees the forming triangle's base.
      if (starts.length >= 2) {
        const ref = triangleRefs[2].current ?? null
        if (ref !== null && starts[0] !== starts[1]) {
          const tf = cylinderTransform(starts[0], starts[1], transform)
          if (tf !== null) {
            ref.position.copy(transform.midpoint)
            ref.quaternion.copy(transform.quaternion)
            ref.scale.set(1, tf.length, 1)
            ref.visible = true
          }
        }
      }
    }

    if (endNodeRef.current !== null) {
      endNodeRef.current.visible = true
      endNodeRef.current.position.copy(end)
    }
  })

  return (
    <group>
      <mesh ref={lineRef} visible={false}>
        <cylinderGeometry args={[GHOST_PART_LINE_RADIUS, GHOST_PART_LINE_RADIUS, 1, 12]} />
        <meshBasicMaterial
          color={GHOST_PART_COLOR}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
      {triangleRefs.map((ref, k) => (
        <mesh key={k} ref={ref} visible={false}>
          <cylinderGeometry args={[GHOST_PART_LINE_RADIUS, GHOST_PART_LINE_RADIUS, 1, 12]} />
          <meshBasicMaterial
            color={GHOST_PART_COLOR}
            transparent
            opacity={0.5}
            depthWrite={false}
          />
        </mesh>
      ))}
      <mesh ref={endNodeRef} visible={false}>
        <sphereGeometry args={[GHOST_NODE_RADIUS, 16, 16]} />
        <meshBasicMaterial
          color={GHOST_PART_COLOR}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
    </group>
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
  // Step 16c — vehicle parts (few; react off committed networkState).
  const wheels = useMemo(
    () => Array.from(networkState.wheels.values()) as WheelPart[],
    [networkState],
  )
  const rigidMounts = useMemo(
    () => Array.from(networkState.rigidMounts.values()) as RigidMount[],
    [networkState],
  )
  const transmissions = useMemo(
    () => Array.from(networkState.transmissions.values()) as TransmissionLink[],
    [networkState],
  )

  return (
    <group>
      {beams.map((beam) => (
        <BeamMesh key={beam.id} beam={beam} positions={positions} />
      ))}
      {transmissions.map((link) => (
        <TransmissionMesh key={link.id} link={link} positions={positions} />
      ))}
      {rigidMounts.map((mount) => (
        <RigidMountMesh key={mount.id} mount={mount} positions={positions} />
      ))}
      {wheels.map((wheel) => (
        <WheelMesh key={wheel.id} wheel={wheel} positions={positions} />
      ))}
      {nodes.map((node) => (
        <NodeMesh key={node.id} node={node} />
      ))}
      <PartGhostPreview />
    </group>
  )
}
