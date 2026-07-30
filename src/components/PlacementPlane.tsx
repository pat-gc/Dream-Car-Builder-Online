import { useMemo, useRef, type MutableRefObject } from 'react'
import { useThree, useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../store/editorStore'
import { useNetworkStore } from '../store/networkStore'
import { snapToIncrement, snapToAxis } from '../sim/snap'

const PLANE_SIZE = 1000
const PLANE_DEFAULT_NORMAL = new THREE.Vector3(0, 0, 1)

interface PlacementPlaneProps {
  ghostPointRef?: MutableRefObject<THREE.Vector3 | null>
}

export default function PlacementPlane({ ghostPointRef }: PlacementPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const { camera } = useThree()

  const depthOverrideVector = useEditorStore((s) => s.depthOverrideVector)

  const temp = useMemo(
    () => ({
      worldDir: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      depthPoint: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      snapped: new THREE.Vector3(),
      startPos: new THREE.Vector3(),
      axisSnapped: new THREE.Vector3(),
    }),
    [],
  )

  useFrame(() => {
    const mesh = meshRef.current
    if (mesh === null) {
      return
    }

    camera.getWorldDirection(temp.worldDir)
    if (temp.worldDir.lengthSq() < 1e-12) {
      return
    }
    temp.worldDir.normalize()

    temp.depthPoint.set(0, 0, 0)
    if (depthOverrideVector !== null && depthOverrideVector !== undefined) {
      temp.depthPoint.set(
        depthOverrideVector.x,
        depthOverrideVector.y,
        depthOverrideVector.z,
      )
    }

    const dot = PLANE_DEFAULT_NORMAL.dot(temp.worldDir)
    if (1 - Math.abs(dot) < 1e-6) {
      if (dot < 0) {
        temp.quat.setFromAxisAngle(temp.up, Math.PI)
      } else {
        temp.quat.identity()
      }
    } else {
      temp.quat.setFromUnitVectors(PLANE_DEFAULT_NORMAL, temp.worldDir)
    }
    if (!Number.isNaN(temp.quat.x)) {
      mesh.quaternion.copy(temp.quat)
    }

    mesh.position.copy(temp.depthPoint)
    mesh.updateMatrixWorld()
  })

  function writeSnappedHit(point: THREE.Vector3): THREE.Vector3 {
    const inc = useEditorStore.getState().snapIncrement
    temp.snapped.set(
      snapToIncrement(point.x, inc),
      snapToIncrement(point.y, inc),
      snapToIncrement(point.z, inc),
    )
    if (ghostPointRef !== undefined) {
      if (ghostPointRef.current === null) {
        ghostPointRef.current = new THREE.Vector3()
      }
      ghostPointRef.current.copy(temp.snapped)
    }
    return temp.snapped
  }

  function handlePointerMove(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()

    if (
      useEditorStore.getState().hoveredNodeId !== null &&
      useEditorStore.getState().hoveredNodeId !== undefined
    ) {
      return
    }

    writeSnappedHit(e.point)

    const { mode, beamStage, beamStartNodeId, axisSnapEnabled } =
      useEditorStore.getState()
    if (mode !== 'ADD_BEAM') {
      return
    }
    if (beamStage !== 'awaiting-second-point') {
      return
    }
    if (beamStartNodeId === null || beamStartNodeId === undefined) {
      return
    }

    const networkState = useNetworkStore.getState().networkState
    const startNode = networkState.nodes.get(beamStartNodeId)
    if (startNode === undefined) {
      return
    }
    temp.startPos.copy(startNode.position)

    if (axisSnapEnabled && ghostPointRef !== undefined) {
      const current = ghostPointRef.current
      if (current === null) {
        return
      }
      temp.axisSnapped.copy(snapToAxis(temp.startPos, current))
      current.copy(temp.axisSnapped)
    }
  }

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (e.button !== 0) {
      return
    }
    e.stopPropagation()

    const state = useEditorStore.getState()
    if (state.mode !== 'ADD_BEAM') {
      return
    }

    if (
      state.hoveredNodeId !== null &&
      state.hoveredNodeId !== undefined
    ) {
      return
    }

    if (state.beamStage === 'idle') {
      const snapped = writeSnappedHit(e.point)
      const { setBeamStart } = useEditorStore.getState()
      const { commitBeamStart } = useNetworkStore.getState()
      const startNodeId = commitBeamStart(snapped.clone())

      const startNode =
        useNetworkStore.getState().networkState.nodes.get(startNodeId)
      if (startNode === undefined) {
        return
      }
      setBeamStart(startNodeId, {
        x: startNode.position.x,
        y: startNode.position.y,
        z: startNode.position.z,
      })
      return
    }

    if (state.beamStage === 'awaiting-second-point') {
      const endPoint =
        ghostPointRef !== undefined && ghostPointRef.current !== null
          ? ghostPointRef.current.clone()
          : writeSnappedHit(e.point).clone()

      const { beamStartNodeId, resetBeamPlacement } = useEditorStore.getState()
      if (beamStartNodeId === null || beamStartNodeId === undefined) {
        return
      }

      const { commitBeamEnd } = useNetworkStore.getState()
      const ok = commitBeamEnd(endPoint, beamStartNodeId)
      if (ok) {
        resetBeamPlacement()
      }
    }
  }

  return (
    <mesh
      ref={meshRef}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
    >
      <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
