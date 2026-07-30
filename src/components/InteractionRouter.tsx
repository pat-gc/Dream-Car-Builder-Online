import { useEffect, useMemo, type MutableRefObject } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../store/editorStore'
import { useNetworkStore } from '../store/networkStore'
import { sharedMeshRegistry } from '../sim/meshRegistry'
import { getNearestNodeHit, raycastPlane } from '../sim/pointerRouter'
import { snapToAxis, snapToIncrement } from '../sim/snap'

interface InteractionRouterProps {
  planeMeshRef: MutableRefObject<THREE.Object3D | null>
  ghostPointRef: MutableRefObject<THREE.Vector3 | null>
}

const temp = {
  snapped: new THREE.Vector3(),
  startPos: new THREE.Vector3(),
  axisSnapped: new THREE.Vector3(),
}

export default function InteractionRouter({
  planeMeshRef,
  ghostPointRef,
}: InteractionRouterProps) {
  const { gl, camera } = useThree()

  const snapshot = useMemo(
    () => ({
      camera: camera as THREE.Camera,
      domElement: gl.domElement,
    }),
    [gl, camera],
  )

  useEffect(() => {
    const dom = snapshot.domElement

    function activeForBuild(): boolean {
      const s = useEditorStore.getState()
      if (s.isSimulating) return false
      if (s.mode !== 'ADD_BEAM') return false
      return true
    }

    function onPointerMove(e: PointerEvent) {
      if (!activeForBuild()) return

      const rect = dom.getBoundingClientRect()
      const nodeHit = getNearestNodeHit(
        snapshot.camera,
        e.clientX,
        e.clientY,
        rect,
        sharedMeshRegistry.nodeMeshes,
      )

      if (nodeHit !== null) {
        useEditorStore.getState().setHoveredNodeId(nodeHit.nodeId)
        return
      }

      const prev = useEditorStore.getState().hoveredNodeId
      if (prev !== null && prev !== undefined) {
        useEditorStore.getState().clearHoveredNodeId()
      }

      const planeMesh = planeMeshRef.current
      if (planeMesh === null) return

      const planePoint = raycastPlane(
        planeMesh,
        snapshot.camera,
        e.clientX,
        e.clientY,
        rect,
      )
      if (planePoint === null) return

      writeSnappedHit(planePoint)

      const state = useEditorStore.getState()
      if (state.beamStage !== 'awaiting-second-point') return
      const startId = state.beamStartNodeId
      if (startId === null || startId === undefined) return

      const startNode = useNetworkStore.getState().networkState.nodes.get(startId)
      if (startNode === undefined) return

      if (state.axisSnapEnabled) {
        const current = ghostPointRef.current
        if (current === null) return
        temp.startPos.copy(startNode.position)
        temp.axisSnapped.copy(snapToAxis(temp.startPos, current))
        current.copy(temp.axisSnapped)
      }
    }

    function onClick(e: MouseEvent) {
      if (e.button !== 0) return
      if (!activeForBuild()) return

      const rect = dom.getBoundingClientRect()
      const nodeHit = getNearestNodeHit(
        snapshot.camera,
        e.clientX,
        e.clientY,
        rect,
        sharedMeshRegistry.nodeMeshes,
      )

      if (nodeHit !== null) {
        const state = useEditorStore.getState()
        const network = useNetworkStore.getState()

        if (state.beamStage === 'idle') {
          const node =
            network.networkState.nodes.get(nodeHit.nodeId)
          if (node === undefined) return
          state.setBeamStart(nodeHit.nodeId, {
            x: node.position.x,
            y: node.position.y,
            z: node.position.z,
          })
          return
        }

        if (state.beamStage === 'awaiting-second-point') {
          const startId = state.beamStartNodeId
          if (startId === null || startId === undefined) return
          if (nodeHit.nodeId === startId) return
          const ok = network.commitBeamEndToNode(nodeHit.nodeId, startId)
          if (ok) state.resetBeamPlacement()
        }
        return
      }

      const state = useEditorStore.getState()
      if (state.hoveredNodeId !== null && state.hoveredNodeId !== undefined) {
        return
      }

      const planeMesh = planeMeshRef.current
      if (planeMesh === null) return

      const planePoint = raycastPlane(
        planeMesh,
        snapshot.camera,
        e.clientX,
        e.clientY,
        rect,
      )
      if (planePoint === null) return

      const snapped = writeSnappedHit(planePoint)

      if (state.beamStage === 'idle') {
        const { setBeamStart } = useEditorStore.getState()
        const { commitBeamStart } = useNetworkStore.getState()
        const startNodeId = commitBeamStart(snapped.clone())

        const startNode =
          useNetworkStore.getState().networkState.nodes.get(startNodeId)
        if (startNode === undefined) return
        setBeamStart(startNodeId, {
          x: startNode.position.x,
          y: startNode.position.y,
          z: startNode.position.z,
        })
        return
      }

      if (state.beamStage === 'awaiting-second-point') {
        const endPoint =
          ghostPointRef.current !== null
            ? ghostPointRef.current.clone()
            : snapped.clone()

        const { beamStartNodeId, resetBeamPlacement } =
          useEditorStore.getState()
        if (beamStartNodeId === null || beamStartNodeId === undefined) return

        const { commitBeamEnd } = useNetworkStore.getState()
        const ok = commitBeamEnd(endPoint, beamStartNodeId)
        if (ok) resetBeamPlacement()
      }
    }

    function writeSnappedHit(point: THREE.Vector3): THREE.Vector3 {
      const inc = useEditorStore.getState().snapIncrement
      temp.snapped.set(
        snapToIncrement(point.x, inc),
        snapToIncrement(point.y, inc),
        snapToIncrement(point.z, inc),
      )
      if (ghostPointRef.current === null) {
        ghostPointRef.current = new THREE.Vector3()
      }
      ghostPointRef.current.copy(temp.snapped)
      return temp.snapped
    }

    dom.addEventListener('pointermove', onPointerMove)
    dom.addEventListener('click', onClick)
    return () => {
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('click', onClick)
    }
  }, [snapshot, planeMeshRef, ghostPointRef])

  return null
}
