import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'

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

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <shadowMaterial
          transparent
          opacity={0.25}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
    </>
  )
}

export default function App() {
  return (
    <Canvas
      shadows
      camera={{ position: [15, 12, 18], fov: 50, near: 0.1, far: 1000 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <Scene />
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
  )
}
