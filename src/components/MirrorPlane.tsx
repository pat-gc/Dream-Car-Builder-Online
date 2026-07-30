import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../store/editorStore'

const PLANE_WIDTH = 200
const PLANE_HEIGHT = 60

export default function MirrorPlane() {
  const meshRef = useRef<THREE.Mesh>(null)
  const symmetryEnabled = useEditorStore((s) => s.symmetryEnabled)
  const symmetryAxis = useEditorStore((s) => s.symmetryAxis)
  const isSimulating = useEditorStore((s) => s.isSimulating)

  const temp = useMemo(() => ({ quat: new THREE.Quaternion() }), [])

  useFrame(() => {
    const mesh = meshRef.current
    if (mesh === null) return

    // Only show during editing (not while simulating); visibility in any
    // edit mode keeps the mirror boundary informative across the toolbar.
    const show = symmetryEnabled && !isSimulating
    mesh.visible = show
    if (!show) return

    mesh.position.set(0, PLANE_HEIGHT / 2, 0)
    if (symmetryAxis === 'X') {
      // Plane normal along X: rotate default (+Z normal) -90deg around Y.
      temp.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)
    } else {
      // Plane normal along Z: default plane normal is +Z already.
      temp.quat.identity()
    }
    mesh.quaternion.copy(temp.quat)
  })

  return (
    <mesh ref={meshRef} visible={false}>
      <planeGeometry args={[PLANE_WIDTH, PLANE_HEIGHT]} />
      <meshBasicMaterial
        color="#42d8ff"
        transparent
        opacity={0.12}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
