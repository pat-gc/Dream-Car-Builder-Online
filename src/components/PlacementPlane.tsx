import { useMemo, useRef, type MutableRefObject } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../store/editorStore'

const PLANE_SIZE = 1000
const PLANE_DEFAULT_NORMAL = new THREE.Vector3(0, 0, 1)

interface PlacementPlaneProps {
  planeMeshRef?: MutableRefObject<THREE.Object3D | null>
}

export default function PlacementPlane({ planeMeshRef }: PlacementPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const { camera } = useThree()

  const depthOverrideVector = useEditorStore((s) => s.depthOverrideVector)

  const temp = useMemo(
    () => ({
      worldDir: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      depthPoint: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
    }),
    [],
  )

  useFrame(() => {
    const mesh = meshRef.current
    if (mesh === null) {
      return
    }

    const state = useEditorStore.getState()
    const active = !state.isSimulating && state.mode === 'ADD_BEAM'
    mesh.visible = active
    if (!active) {
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

  return (
    <mesh
      ref={(obj) => {
        meshRef.current = obj as THREE.Mesh
        if (planeMeshRef !== undefined) {
          planeMeshRef.current = obj
        }
      }}
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
