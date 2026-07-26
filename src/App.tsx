import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'

export default function App() {
  return (
    <Canvas
      camera={{ position: [5, 5, 5], fov: 60 }}
      shadows
    >
      <color attach="background" args={['#0a0a0a']} />
      <fog attach="fog" args={['#0a0a0a', 20, 60]} />

      <ambientLight intensity={0.3} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />

      <Grid
        infiniteGrid
        cellSize={1}
        cellThickness={0.6}
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#3a3a3a"
        cellColor="#1a1a1a"
        fadeDistance={50}
        position={[0, 0, 0]}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <shadowMaterial opacity={0.3} />
      </mesh>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={2}
        maxDistance={100}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
    </Canvas>
  )
}
