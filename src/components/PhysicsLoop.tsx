import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useEditorStore } from '../store/editorStore'
import { useNetworkStore } from '../store/networkStore'
import {
  cloneNetworkState,
  resetKinematics,
  type NetworkState,
} from '../sim/network'
import { stepPhysics } from '../sim/physics'
import { sharedMeshRegistry } from '../sim/meshRegistry'
import { makeBeamTransformCache, writeBeamTransform } from '../sim/beamTransform'

const MAX_DELTA = 0.1

export default function PhysicsLoop() {
  const isSimulatingRef = useRef(false)
  const wasSimulatingRef = useRef(false)
  const liveStateRef = useRef<NetworkState | null>(null)
  const snapshotRef = useRef<NetworkState | null>(null)
  const cacheRef = useRef(makeBeamTransformCache())
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
