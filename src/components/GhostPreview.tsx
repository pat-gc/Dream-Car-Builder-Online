import { useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../store/editorStore'

const GHOST_RADIUS = 0.15

interface GhostPreviewProps {
  ghostPointRef: MutableRefObject<THREE.Vector3 | null>
}

export default function GhostPreview({ ghostPointRef }: GhostPreviewProps) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const mode = useEditorStore((s) => s.mode)

  useFrame(() => {
    const mesh = meshRef.current
    if (mesh === null) {
      return
    }

    const isAddBeam = mode === 'ADD_BEAM'
    mesh.visible = isAddBeam
    if (!isAddBeam) {
      return
    }

    const p = ghostPointRef.current
    if (p === null) {
      return
    }
    mesh.position.copy(p)
  })

  return (
    <mesh ref={meshRef} visible={false}>
      <sphereGeometry args={[GHOST_RADIUS, 20, 20]} />
      <meshBasicMaterial
        color="#ffee44"
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </mesh>
  )
}
