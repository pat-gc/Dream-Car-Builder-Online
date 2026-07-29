import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { addNode, addBeam, createNetworkState } from './sim/network'
import type { NetworkState } from './sim/network'
import NetworkRenderer from './components/NetworkRenderer'

function buildTestNetwork(): NetworkState {
  let s = createNetworkState()
  const n0 = addNode(s, new THREE.Vector3(0, 0, 0), 1, true)
  s = n0.state
  const n1 = addNode(s, new THREE.Vector3(3, 0, 0))
  s = n1.state
  const n2 = addNode(s, new THREE.Vector3(3, 0, 3))
  s = n2.state
  const n3 = addNode(s, new THREE.Vector3(0, 0, 3))
  s = n3.state
  const n4 = addNode(s, new THREE.Vector3(1.5, 2.5, 1.5))
  s = n4.state

  const b01 = addBeam(s, n0.node.id, n1.node.id)
  s = b01!.state
  const b12 = addBeam(s, n1.node.id, n2.node.id)
  s = b12!.state
  const b23 = addBeam(s, n2.node.id, n3.node.id)
  s = b23!.state
  const b30 = addBeam(s, n3.node.id, n0.node.id)
  s = b30!.state
  const b04 = addBeam(s, n0.node.id, n4.node.id)
  s = b04!.state
  const b14 = addBeam(s, n1.node.id, n4.node.id)
  s = b14!.state
  const b24 = addBeam(s, n2.node.id, n4.node.id)
  s = b24!.state
  const b34 = addBeam(s, n3.node.id, n4.node.id)
  s = b34!.state

  return s
}

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
  const [networkState] = useState<NetworkState>(() => buildTestNetwork())

  return (
    <Canvas
      shadows
      camera={{ position: [15, 12, 18], fov: 50, near: 0.1, far: 1000 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <Scene />
      <NetworkRenderer networkState={networkState} />
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
