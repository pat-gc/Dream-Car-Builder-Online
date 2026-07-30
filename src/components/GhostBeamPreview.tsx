import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../store/editorStore'
import { useNetworkStore } from '../store/networkStore'
import { mirrorPosition } from '../sim/network'

const GHOST_BEAM_RADIUS = 0.06
const GHOST_NODE_RADIUS = 0.15
const UP = new THREE.Vector3(0, 1, 0)

const GHOST_COLOR = '#ffee44'
const MIRROR_GHOST_COLOR = '#42d8ff'

interface GhostBeamPreviewProps {
  ghostPointRef: MutableRefObject<THREE.Vector3 | null>
}

export default function GhostBeamPreview({
  ghostPointRef,
}: GhostBeamPreviewProps) {
  const cylinderRef = useRef<THREE.Mesh>(null!)
  const endNodeRef = useRef<THREE.Mesh>(null!)
  const mirrorCylinderRef = useRef<THREE.Mesh>(null!)
  const mirrorEndNodeRef = useRef<THREE.Mesh>(null!)

  const beamStage = useEditorStore((s) => s.beamStage)
  const beamStartNodeId = useEditorStore((s) => s.beamStartNodeId)
  const hoveredNodeId = useEditorStore((s) => s.hoveredNodeId)
  const symmetryEnabled = useEditorStore((s) => s.symmetryEnabled)
  const symmetryAxis = useEditorStore((s) => s.symmetryAxis)
  const networkState = useNetworkStore((s) => s.networkState)

  const temp = useMemo(
    () => ({
      dir: new THREE.Vector3(),
      midpoint: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      fallbackStart: new THREE.Vector3(),
      effectiveEnd: new THREE.Vector3(),
      mirrorStart: new THREE.Vector3(),
      mirrorEnd: new THREE.Vector3(),
    }),
    [],
  )

  function writeBeamSegment(
    cylinder: THREE.Mesh | null,
    endNode: THREE.Mesh | null,
    start: THREE.Vector3,
    end: THREE.Vector3,
    color: string,
  ): void {
    if (cylinder !== null) {
      ;(cylinder.material as THREE.MeshBasicMaterial).color.set(color)
    }
    if (endNode !== null) {
      ;(endNode.material as THREE.MeshBasicMaterial).color.set(color)
      endNode.position.copy(end)
    }
    temp.dir.subVectors(end, start)
    const length = temp.dir.length()
    if (length < 1e-6) {
      if (cylinder !== null) {
        cylinder.scale.set(0, 0, 0)
      }
      return
    }
    temp.midpoint.addVectors(start, end).multiplyScalar(0.5)
    temp.dir.normalize()
    temp.quat.setFromUnitVectors(UP, temp.dir)
    if (Number.isNaN(temp.quat.x)) {
      return
    }
    if (cylinder !== null) {
      cylinder.position.copy(temp.midpoint)
      cylinder.quaternion.copy(temp.quat)
      cylinder.scale.set(1, length, 1)
    }
  }

  useFrame(() => {
    const show = beamStage === 'awaiting-second-point'
    const cylinder = cylinderRef.current
    const endNode = endNodeRef.current
    const mirrorCylinder = mirrorCylinderRef.current
    const mirrorEndNode = mirrorEndNodeRef.current
    const showMirror = show && symmetryEnabled

    if (cylinder !== null) cylinder.visible = show
    if (endNode !== null) endNode.visible = show
    if (mirrorCylinder !== null) mirrorCylinder.visible = showMirror
    if (mirrorEndNode !== null) mirrorEndNode.visible = showMirror
    if (!show) {
      return
    }

    let end: THREE.Vector3 | null = null
    if (
      hoveredNodeId !== null &&
      hoveredNodeId !== undefined &&
      hoveredNodeId !== beamStartNodeId
    ) {
      const hovered = networkState.nodes.get(hoveredNodeId)
      if (hovered !== undefined) {
        temp.effectiveEnd.copy(hovered.position)
        end = temp.effectiveEnd
      }
    }
    if (end === null) {
      end = ghostPointRef.current
    }
    if (end === null) {
      return
    }

    const startNode =
      beamStartNodeId !== null && beamStartNodeId !== undefined
        ? networkState.nodes.get(beamStartNodeId)
        : undefined
    const start =
      startNode !== undefined ? startNode.position : temp.fallbackStart

    writeBeamSegment(
      cylinder !== null ? cylinder : null,
      endNode !== null ? endNode : null,
      start,
      end,
      GHOST_COLOR,
    )

    if (!showMirror) {
      return
    }

    temp.mirrorStart.copy(mirrorPosition(start, symmetryAxis))
    temp.mirrorEnd.copy(mirrorPosition(end, symmetryAxis))
    writeBeamSegment(
      mirrorCylinder !== null ? mirrorCylinder : null,
      mirrorEndNode !== null ? mirrorEndNode : null,
      temp.mirrorStart,
      temp.mirrorEnd,
      MIRROR_GHOST_COLOR,
    )
  })

  return (
    <group>
      <mesh ref={cylinderRef} visible={false}>
        <cylinderGeometry args={[GHOST_BEAM_RADIUS, GHOST_BEAM_RADIUS, 1, 16]} />
        <meshBasicMaterial
          color={GHOST_COLOR}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={endNodeRef} visible={false}>
        <sphereGeometry args={[GHOST_NODE_RADIUS, 20, 20]} />
        <meshBasicMaterial
          color={GHOST_COLOR}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={mirrorCylinderRef} visible={false}>
        <cylinderGeometry args={[GHOST_BEAM_RADIUS, GHOST_BEAM_RADIUS, 1, 16]} />
        <meshBasicMaterial
          color={MIRROR_GHOST_COLOR}
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={mirrorEndNodeRef} visible={false}>
        <sphereGeometry args={[GHOST_NODE_RADIUS, 20, 20]} />
        <meshBasicMaterial
          color={MIRROR_GHOST_COLOR}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
