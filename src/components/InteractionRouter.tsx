import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../store/editorStore'
import { useNetworkStore } from '../store/networkStore'
import { sharedMeshRegistry } from '../sim/meshRegistry'
import { getNearestNodeHit, raycastPlane } from '../sim/pointerRouter'
import { snapToAxis, snapToIncrement } from '../sim/snap'
import {
  makeBeamTransformCache,
  writeBeamTransform,
  type BeamTransformCache,
} from '../sim/beamTransform'

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
  const { gl, camera, controls } = useThree()

  const snapshot = useMemo(
    () => ({
      camera: camera as THREE.Camera,
      domElement: gl.domElement,
    }),
    [gl, camera],
  )

  const beamCacheRef = useRef<BeamTransformCache>(makeBeamTransformCache())
  const connectedBeamsRef = useRef<Set<string>>(new Set())
  const dragCurrentPosRef = useRef<THREE.Vector3>(new THREE.Vector3())
  const dragStartPosRef = useRef<THREE.Vector3 | null>(null)
  const draggedIdBeforeClearRef = useRef<string | null>(null)
  const committedRef = useRef<boolean>(false)

  useEffect(() => {
    const dom = snapshot.domElement
    const controlsImpl = controls as { enabled: boolean } | null

    function activeForBuild(): boolean {
      const s = useEditorStore.getState()
      if (s.isSimulating) return false
      if (s.mode !== 'ADD_BEAM') return false
      return true
    }

    function activeForSelectMove(): boolean {
      const s = useEditorStore.getState()
      if (s.isSimulating) return false
      if (s.mode !== 'SELECT_MOVE') return false
      return true
    }

    function collectConnectedBeams(nodeId: string): void {
      const set = connectedBeamsRef.current
      set.clear()
      const beams = useNetworkStore.getState().networkState.beams
      beams.forEach((beam, beamId) => {
        if (beam.nodeAId === nodeId || beam.nodeBId === nodeId) {
          set.add(beamId)
        }
      })
    }

    function nodeStorePosition(nodeId: string): THREE.Vector3 | null {
      const node = useNetworkStore.getState().networkState.nodes.get(nodeId)
      return node === undefined ? null : node.position
    }

    function otherBeamNode(
      beam: { nodeAId: string; nodeBId: string },
      nodeId: string,
    ): string | null {
      if (beam.nodeAId === nodeId) return beam.nodeBId
      if (beam.nodeBId === nodeId) return beam.nodeAId
      return null
    }

    function writeDraggedFrame(nodeId: string, pos: THREE.Vector3): void {
      const nodeMesh = sharedMeshRegistry.nodeMeshes.get(nodeId)
      if (nodeMesh !== undefined) {
        nodeMesh.position.copy(pos)
      }
      const beams = useNetworkStore.getState().networkState.beams
      const cache = beamCacheRef.current
      for (const beamId of connectedBeamsRef.current) {
        const beam = beams.get(beamId)
        if (beam === undefined) continue
        const otherId = otherBeamNode(beam, nodeId)
        if (otherId === null) continue
        const other = nodeStorePosition(otherId)
        if (other === null) continue
        writeBeamTransform(beamId, pos, other, cache)
      }
    }

    function restoreNodeImperatively(nodeId: string): void {
      const storePos = nodeStorePosition(nodeId)
      if (storePos === null) return
      const nodeMesh = sharedMeshRegistry.nodeMeshes.get(nodeId)
      if (nodeMesh !== undefined) {
        nodeMesh.position.copy(storePos)
      }
      collectConnectedBeams(nodeId)
      const beams = useNetworkStore.getState().networkState.beams
      const cache = beamCacheRef.current
      for (const beamId of connectedBeamsRef.current) {
        const beam = beams.get(beamId)
        if (beam === undefined) continue
        const otherId = otherBeamNode(beam, nodeId)
        if (otherId === null) continue
        const other = nodeStorePosition(otherId)
        if (other === null) continue
        writeBeamTransform(beamId, storePos, other, cache)
      }
    }

    function setControlsEnabled(value: boolean): void {
      if (controlsImpl !== null && controlsImpl !== undefined) {
        controlsImpl.enabled = value
      }
    }

    function onPointerMove(e: PointerEvent) {
      const s = useEditorStore.getState()

      if (
        s.mode === 'SELECT_MOVE' &&
        s.draggedNodeId !== null &&
        s.draggedNodeId !== undefined
      ) {
        const planeMesh = planeMeshRef.current
        if (planeMesh === null) return
        const rect = dom.getBoundingClientRect()
        const planePoint = raycastPlane(
          planeMesh,
          snapshot.camera,
          e.clientX,
          e.clientY,
          rect,
        )
        if (planePoint === null) return
        const inc = s.snapIncrement
        temp.snapped.set(
          snapToIncrement(planePoint.x, inc),
          snapToIncrement(planePoint.y, inc),
          snapToIncrement(planePoint.z, inc),
        )
        dragCurrentPosRef.current.copy(temp.snapped)
        writeDraggedFrame(s.draggedNodeId, temp.snapped)
        return
      }

      if (!activeForBuild() && !activeForSelectMove()) return

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

      if (!activeForBuild()) return

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

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return
      if (!activeForSelectMove()) return

      const s = useEditorStore.getState()
      if (s.draggedNodeId !== null && s.draggedNodeId !== undefined) {
        return
      }

      const rect = dom.getBoundingClientRect()
      const nodeHit = getNearestNodeHit(
        snapshot.camera,
        e.clientX,
        e.clientY,
        rect,
        sharedMeshRegistry.nodeMeshes,
      )
      if (nodeHit === null) return

      const storePos = nodeStorePosition(nodeHit.nodeId)
      if (storePos === null) return

      committedRef.current = false
      draggedIdBeforeClearRef.current = nodeHit.nodeId
      dragStartPosRef.current = storePos.clone()
      dragCurrentPosRef.current.copy(storePos)
      collectConnectedBeams(nodeHit.nodeId)

      useEditorStore.getState().setDraggedNodeId(nodeHit.nodeId, {
        x: storePos.x,
        y: storePos.y,
        z: storePos.z,
      })
      setControlsEnabled(false)
      try {
        dom.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }

    function onPointerUp(e: PointerEvent) {
      const s = useEditorStore.getState()
      if (s.draggedNodeId === null || s.draggedNodeId === undefined) {
        return
      }
      const nodeId = s.draggedNodeId
      const finalPos = dragCurrentPosRef.current.clone()

      committedRef.current = true
      useNetworkStore.getState().commitNodeMove(nodeId, finalPos)
      useEditorStore.getState().clearDraggedNode()
      setControlsEnabled(true)
      try {
        dom.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }

    function onClick(e: MouseEvent) {
      if (e.button !== 0) return
      if (!activeForBuild()) return

      const s = useEditorStore.getState()
      if (s.draggedNodeId !== null && s.draggedNodeId !== undefined) {
        return
      }

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

    // Restore imperative mesh/beam transforms when a drag is cancelled
    // (mode switch / Escape / Simulate) without a committed move, so the
    // node visually snaps back to its committed store position.
    const unsubStore = useEditorStore.subscribe((state) => {
      const id = draggedIdBeforeClearRef.current
      if (id === null) return
      if (state.draggedNodeId === null || state.draggedNodeId === undefined) {
        draggedIdBeforeClearRef.current = null
        if (!committedRef.current) {
          restoreNodeImperatively(id)
        }
        committedRef.current = false
        dragStartPosRef.current = null
        setControlsEnabled(true)
      }
    })

    dom.addEventListener('pointermove', onPointerMove)
    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointerup', onPointerUp)
    dom.addEventListener('click', onClick)
    return () => {
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('click', onClick)
      unsubStore()
    }
  }, [snapshot, planeMeshRef, ghostPointRef, controls])

  return null
}
