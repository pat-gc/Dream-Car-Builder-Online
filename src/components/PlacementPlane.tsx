import { useMemo, useRef } from 'react'
import { useThree, useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

const PLANE_SIZE = 1000
const PLANE_DEFAULT_NORMAL = new THREE.Vector3(0, 0, 1)

interface PlacementPlaneProps {
  depthOverride?: THREE.Vector3 | null
}

export default function PlacementPlane({
  depthOverride = null,
}: PlacementPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const { camera } = useThree()

  const temp = useMemo(
    () => ({
      worldDir: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      depthPoint: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      right: new THREE.Vector3(1, 0, 0),
      matrix: new THREE.Matrix4(),
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
    if (depthOverride !== null && depthOverride !== undefined) {
      temp.depthPoint.copy(depthOverride)
    }

    const dot = PLANE_DEFAULT_NORMAL.dot(temp.worldDir)
    if (1 - Math.abs(dot) < 1e-6) {
      // co-linear or anti-parallel
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

  function handlePointerMove(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    console.log(
      '[PlacementPlane] hit:',
      e.point.x.toFixed(3),
      e.point.y.toFixed(3),
      e.point.z.toFixed(3),
    )
  }

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (e.button !== 0) {
      return
    }
    e.stopPropagation()
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
