import { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import NetworkRenderer from './components/NetworkRenderer'
import EditorUI from './components/EditorUI'
import PlacementPlane from './components/PlacementPlane'
import GhostPreview from './components/GhostPreview'
import GhostBeamPreview from './components/GhostBeamPreview'
import PhysicsLoop from './components/PhysicsLoop'
import InteractionRouter from './components/InteractionRouter'
import MarqueeOverlay from './components/MarqueeOverlay'
import MirrorPlane from './components/MirrorPlane'

function Scene() {
  return (
    <>
      <color attach="background" args={['#05060a']} />
      <fog attach="fog" args={['#05060a', 20, 80]} />

      <ambientLight intensity={0.4} />
      <directionalLight
        position={[20, 30, 15]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-near={0.1}
        shadow-camera-far={100}
      />

      <Grid
        args={[200, 200]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#5a78ff"
        sectionSize={10}
        sectionThickness={1.2}
        sectionColor="#9fb4ff"
        fadeDistance={90}
        fadeStrength={1}
        infiniteGrid
        followCamera={false}
        position={[0, 0.02, 0]}
      />
    </>
  )
}

export default function App() {
  const ghostPointRef = useRef<THREE.Vector3 | null>(null)
  const planeMeshRef = useRef<THREE.Object3D | null>(null)
  const marqueeDivRef = useRef<HTMLDivElement>(null)

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
      }}
    >
      <Canvas
        shadows
        camera={{ position: [15, 12, 18], fov: 50, near: 0.1, far: 1000 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <Scene />
        <NetworkRenderer />
        <PhysicsLoop />
        <PlacementPlane planeMeshRef={planeMeshRef} />
        <GhostPreview ghostPointRef={ghostPointRef} />
        <GhostBeamPreview ghostPointRef={ghostPointRef} />
        <MirrorPlane />
        <InteractionRouter
          planeMeshRef={planeMeshRef}
          ghostPointRef={ghostPointRef}
          marqueeDivRef={marqueeDivRef}
        />
        <OrbitControls
          makeDefault
          mouseButtons={{
            LEFT: undefined as never,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE,
          }}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
          enableDamping
          dampingFactor={0.1}
        />
      </Canvas>
      <MarqueeOverlay marqueeDivRef={marqueeDivRef} />
      <EditorUI />
    </div>
  )
}
