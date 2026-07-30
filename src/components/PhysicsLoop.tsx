import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../store/editorStore'
import { useNetworkStore } from '../store/networkStore'
import {
  cloneNetworkState,
  resetKinematics,
  type NetworkState,
} from '../sim/network'
import { stepPhysics } from '../sim/physics'
import { sharedMeshRegistry } from '../sim/meshRegistry'

const MAX_DELTA = 0.1
const UP = new THREE.Vector3(0, 1, 0)

interface CachedVecs {
  axis: THREE.Vector3
  midpoint: THREE.Vector3
  quat: THREE.Quaternion
  zero: THREE.Vector3
}

function makeCachedVecs(): CachedVecs {
  return {
    axis: new THREE.Vector3(),
    midpoint: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    zero: new THREE.Vector3(0, 0, 0),
  }
}

function writeBeamTransform(
  beamId: string,
  aPos: THREE.Vector3,
  bPos: THREE.Vector3,
  cache: CachedVecs,
): void {
  const mesh = sharedMeshRegistry.beamMeshes.get(beamId)
  if (mesh === undefined) {
    return
  }
  cache.axis.subVectors(bPos, aPos)
  const length = cache.axis.length()
  if (length < 1e-6) {
    mesh.visible = false
    return
  }
  cache.axis.divideScalar(length)
  cache.midpoint.addVectors(aPos, bPos).multiplyScalar(0.5)
  cache.quat.setFromUnitVectors(UP, cache.axis)
  if (Number.isNaN(cache.quat.x)) {
    mesh.visible = false
    return
  }
  mesh.position.copy(cache.midpoint)
  mesh.quaternion.copy(cache.quat)
  mesh.scale.set(1, length, 1)
  mesh.visible = true
}

export default function PhysicsLoop() {
  const isSimulatingRef = useRef(false)
  const wasSimulatingRef = useRef(false)
  const liveStateRef = useRef<NetworkState | null>(null)
  const snapshotRef = useRef<NetworkState | null>(null)
  const cacheRef = useRef<CachedVecs>(makeCachedVecs())
  const liveBeamIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const unsub = useEditorStore.subscribe((state) => {
      isSimulatingRef.current = state.isSimulating
    })
    isSimulatingRef.current = useEditorStore.getState().isSimulating
    return unsub
  }, [])

  useFrame((_, delta) => {
    const isSimulating = isSimulatingRef.current
    const wasSimulating = wasSimulatingRef.current

    if (!isSimulating && !wasSimulating) {
      return
    }

    if (isSimulating && !wasSimulating) {
      const committed = useNetworkStore.getState().networkState
      snapshotRef.current = cloneNetworkState(committed)
      liveStateRef.current = resetKinematics(committed)
      wasSimulatingRef.current = true
    }

    if (!isSimulating && wasSimulating) {
      const snapshot = snapshotRef.current
      if (snapshot !== null) {
        useNetworkStore.getState().setNetworkState(resetKinematics(snapshot))
      }
      liveStateRef.current = null
      snapshotRef.current = null
      wasSimulatingRef.current = false
      for (const mesh of sharedMeshRegistry.beamMeshes.values()) {
        mesh.visible = true
      }
      return
    }

    if (isSimulating && liveStateRef.current !== null) {
      const clamped = Math.min(delta, MAX_DELTA)
      liveStateRef.current = stepPhysics(liveStateRef.current, clamped)
      const live = liveStateRef.current
      const cache = cacheRef.current

      for (const node of live.nodes.values()) {
        const mesh = sharedMeshRegistry.nodeMeshes.get(node.id)
        if (mesh !== undefined) {
          mesh.position.copy(node.position)
        }
      }

      const liveBeamIds = liveBeamIdsRef.current
      liveBeamIds.clear()
      for (const beam of live.beams.values()) {
        liveBeamIds.add(beam.id)
        const a = live.nodes.get(beam.nodeAId)
        const b = live.nodes.get(beam.nodeBId)
        if (a === undefined || b === undefined) {
          continue
        }
        writeBeamTransform(beam.id, a.position, b.position, cache)
      }

      for (const [beamId, mesh] of sharedMeshRegistry.beamMeshes) {
        if (!liveBeamIds.has(beamId)) {
          mesh.visible = false
        }
      }
    }
  })

  return null
}
