import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore } from '../store/editorStore'
import { useNetworkStore } from '../store/networkStore'
import { sharedMeshRegistry } from '../sim/meshRegistry'
import {
  getNearestBeamHit,
  getNearestNodeHit,
  projectToScreen,
  raycastPlane,
} from '../sim/pointerRouter'
import { snapToAxis, snapToIncrement } from '../sim/snap'
import {
  makeBeamTransformCache,
  writeBeamTransform,
  type BeamTransformCache,
} from '../sim/beamTransform'

interface InteractionRouterProps {
  planeMeshRef: MutableRefObject<THREE.Object3D | null>
  ghostPointRef: MutableRefObject<THREE.Vector3 | null>
  marqueeDivRef: MutableRefObject<HTMLDivElement | null>
}

const temp = {
  snapped: new THREE.Vector3(),
  startPos: new THREE.Vector3(),
  axisSnapped: new THREE.Vector3(),
  delta: new THREE.Vector3(),
}

export default function InteractionRouter({
  planeMeshRef,
  ghostPointRef,
  marqueeDivRef,
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

  // Group-drag state: maps selected nodeId -> start world position (store snapshot).
  const groupStartPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map())
  // Grab plane-point at pointerdown for the group (single anchor for delta calc).
  const groupGrabPlanePointRef = useRef<THREE.Vector3 | null>(null)
  // Cached move targets reused across pointermove frames and the final commit.
  const groupMoveTargetsRef = useRef<Map<string, THREE.Vector3>>(new Map())

  // Marquee live rectangle in canvas-relative pixels.
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null)
  const marqueeActiveRef = useRef<boolean>(false)
  // Tracks whether last pointerdown→up was a real drag (so the synthetic
  // `click` handler can skip re-selection logic).
  const hadRealDragRef = useRef<boolean>(false)

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

    function activeForDelete(): boolean {
      const s = useEditorStore.getState()
      if (s.isSimulating) return false
      if (s.mode !== 'DELETE') return false
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

    function collectConnectedBeamsForGroup(nodeIds: Iterable<string>): Set<string> {
      const result = new Set<string>()
      const beams = useNetworkStore.getState().networkState.beams
      beams.forEach((beam, beamId) => {
        if (
          isIdInSet(nodeIds, beam.nodeAId) ||
          isIdInSet(nodeIds, beam.nodeBId)
        ) {
          result.add(beamId)
        }
      })
      return result
    }

    function isIdInSet(ids: Iterable<string>, id: string): boolean {
      for (const n of ids) {
        if (n === id) return true
      }
      return false
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

    function writeGroupFrame(
      nodeIds: string[],
      positionsById: Map<string, THREE.Vector3>,
      connectedBeamIds: Set<string>,
    ): void {
      const cache = beamCacheRef.current
      const beams = useNetworkStore.getState().networkState.beams
      for (const id of nodeIds) {
        const mesh = sharedMeshRegistry.nodeMeshes.get(id)
        const pos = positionsById.get(id)
        if (mesh === undefined || pos === undefined) continue
        mesh.position.copy(pos)
      }
      for (const beamId of connectedBeamIds) {
        const beam = beams.get(beamId)
        if (beam === undefined) continue
        const aPos = positionsById.get(beam.nodeAId)
        const bPos = positionsById.get(beam.nodeBId)
        if (aPos !== undefined && bPos !== undefined) {
          writeBeamTransform(beamId, aPos, bPos, cache)
        } else {
          const fallA = aPos ?? nodeStorePosition(beam.nodeAId)
          const fallB = bPos ?? nodeStorePosition(beam.nodeBId)
          if (fallA !== null && fallB !== null) {
            writeBeamTransform(beamId, fallA, fallB, cache)
          }
        }
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

    function restoreGroupImperatively(nodeIds: string[]): void {
      const positions = new Map<string, THREE.Vector3>()
      for (const id of nodeIds) {
        const storePos = nodeStorePosition(id)
        if (storePos !== null) positions.set(id, storePos)
      }
      const connectedBeams = collectConnectedBeamsForGroup(nodeIds)
      writeGroupFrame(nodeIds, positions, connectedBeams)
    }

    function setControlsEnabled(value: boolean): void {
      if (controlsImpl !== null && controlsImpl !== undefined) {
        controlsImpl.enabled = value
      }
    }

    function canvasCoords(e: PointerEvent | MouseEvent): { x: number; y: number } {
      const rect = dom.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    function updateMarqueeRect(
      startX: number,
      startY: number,
      curX: number,
      curY: number,
    ): void {
      const div = marqueeDivRef.current
      if (div === null) return
      const left = Math.min(startX, curX)
      const top = Math.min(startY, curY)
      const width = Math.abs(curX - startX)
      const height = Math.abs(curY - startY)
      div.style.display = width > 1 || height > 1 ? 'block' : 'none'
      div.style.left = `${left}px`
      div.style.top = `${top}px`
      div.style.width = `${width}px`
      div.style.height = `${height}px`
    }

    function hideMarquee(): void {
      const div = marqueeDivRef.current
      if (div !== null) {
        div.style.display = 'none'
      }
      marqueeStartRef.current = null
      marqueeActiveRef.current = false
    }

    function computeMarqueeSelection(
      startX: number,
      startY: number,
      curX: number,
      curY: number,
    ): string[] {
      const rect = dom.getBoundingClientRect()
      const minX = Math.min(startX, curX)
      const maxX = Math.max(startX, curX)
      const minY = Math.min(startY, curY)
      const maxY = Math.max(startY, curY)
      const cam = snapshot.camera
      const selected: string[] = []
      useNetworkStore.getState().networkState.nodes.forEach((node) => {
        const p = projectToScreen(cam, node.position, rect)
        const lx = p.x - rect.left
        const ly = p.y - rect.top
        if (lx >= minX && lx <= maxX && ly >= minY && ly <= maxY) {
          selected.push(node.id)
        }
      })
      return selected
    }

    function onPointerMove(e: PointerEvent) {
      const s = useEditorStore.getState()

      // --- Active group drag ---
      if (
        s.mode === 'SELECT_MOVE' &&
        s.draggedNodeId !== null &&
        s.draggedNodeId !== undefined &&
        groupStartPositionsRef.current.size >= 2
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
        const grab = groupGrabPlanePointRef.current
        if (grab === null) return
        temp.delta.subVectors(planePoint, grab)
        const inc = s.snapIncrement
        const moveTargets = groupMoveTargetsRef.current
        moveTargets.clear()
        let anyMoved = false
        const nodeIds: string[] = []
        for (const [id, start] of groupStartPositionsRef.current) {
          const nx = snapToIncrement(start.x + temp.delta.x, inc)
          const ny = snapToIncrement(start.y + temp.delta.y, inc)
          const nz = snapToIncrement(start.z + temp.delta.z, inc)
          temp.snapped.set(nx, ny, nz)
          moveTargets.set(id, temp.snapped.clone())
          nodeIds.push(id)
          if (!anyMoved && !start.equals(temp.snapped)) anyMoved = true
        }
        const connectedBeams = collectConnectedBeamsForGroup(nodeIds)
        writeGroupFrame(nodeIds, moveTargets, connectedBeams)
        if (anyMoved) hadRealDragRef.current = true
        return
      }

      // --- Active single-node drag ---
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
        if (!hadRealDragRef.current && dragStartPosRef.current !== null) {
          if (!dragStartPosRef.current.equals(temp.snapped)) {
            hadRealDragRef.current = true
          }
        }
        return
      }

      // --- Active marquee drag ---
      if (marqueeActiveRef.current && activeForSelectMove()) {
        const { x, y } = canvasCoords(e)
        const start = marqueeStartRef.current
        if (start === null) return
        updateMarqueeRect(start.x, start.y, x, y)
        hadRealDragRef.current = true
        return
      }

      if (activeForDelete()) {
        const rect = dom.getBoundingClientRect()
        const nodeHit = getNearestNodeHit(
          snapshot.camera,
          e.clientX,
          e.clientY,
          rect,
          sharedMeshRegistry.nodeMeshes,
        )
        if (nodeHit !== null) {
          const store = useEditorStore.getState()
          store.setHoveredNodeId(nodeHit.nodeId)
          if (store.hoveredBeamId !== null && store.hoveredBeamId !== undefined) {
            store.clearHoveredBeamId()
          }
          return
        }

        const beamHit = getNearestBeamHit(
          snapshot.camera,
          e.clientX,
          e.clientY,
          rect,
          sharedMeshRegistry.beamMeshes,
        )
        if (beamHit !== null) {
          const store = useEditorStore.getState()
          store.setHoveredBeamId(beamHit.beamId)
          if (store.hoveredNodeId !== null && store.hoveredNodeId !== undefined) {
            store.clearHoveredNodeId()
          }
          return
        }

        const store = useEditorStore.getState()
        if (store.hoveredNodeId !== null && store.hoveredNodeId !== undefined) {
          store.clearHoveredNodeId()
        }
        if (store.hoveredBeamId !== null && store.hoveredBeamId !== undefined) {
          store.clearHoveredBeamId()
        }
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
      hadRealDragRef.current = false

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

      const screen = canvasCoords(e)

      if (nodeHit === null) {
        // Empty space: begin marquee.
        marqueeStartRef.current = { x: screen.x, y: screen.y }
        marqueeActiveRef.current = true
        updateMarqueeRect(screen.x, screen.y, screen.x, screen.y)
        return
      }

      const storePos = nodeStorePosition(nodeHit.nodeId)
      if (storePos === null) return

      const selection = useEditorStore.getState().selectedNodeIds
      const isMultiGroup =
        selection.size >= 2 && selection.has(nodeHit.nodeId)

      if (isMultiGroup) {
        // Group drag: snapshot all selected nodes' start positions.
        groupStartPositionsRef.current.clear()
        selection.forEach((id) => {
          const pos = nodeStorePosition(id)
          if (pos !== null) groupStartPositionsRef.current.set(id, pos.clone())
        })
        groupMoveTargetsRef.current.clear()
        const planeMesh = planeMeshRef.current
        let grabPlanePoint: THREE.Vector3 | null = null
        if (planeMesh !== null) {
          grabPlanePoint = raycastPlane(
            planeMesh,
            snapshot.camera,
            e.clientX,
            e.clientY,
            rect,
          )
        }
        groupGrabPlanePointRef.current = grabPlanePoint
        committedRef.current = false
        draggedIdBeforeClearRef.current = nodeHit.nodeId
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
        return
      }

      // Single-node ready-to-drag (existing Step 11 flow).
      groupStartPositionsRef.current.clear()
      groupMoveTargetsRef.current.clear()
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

      // --- Marquee drag end ---
      if (marqueeActiveRef.current) {
        const start = marqueeStartRef.current
        const cur = canvasCoords(e)
        const { shiftKey } = e
        let selectionResult: string[] = []
        if (start !== null) {
          selectionResult = computeMarqueeSelection(start.x, start.y, cur.x, cur.y)
        }
        if (hadRealDragRef.current && start !== null) {
          const store = useEditorStore.getState()
          if (shiftKey) {
            const next = new Set(store.selectedNodeIds)
            for (const id of selectionResult) next.add(id)
            store.setSelection(Array.from(next))
          } else {
            store.setSelection(selectionResult)
          }
        }
        hideMarquee()
        return
      }

      if (s.mode !== 'SELECT_MOVE') return
      if (s.draggedNodeId === null || s.draggedNodeId === undefined) {
        return
      }

      const isGroup = groupStartPositionsRef.current.size >= 2

      if (!hadRealDragRef.current) {
        // Treat as a click (no real movement): apply selection logic,
        // discard the optimistic drag (no move to commit).
        const nodeId = s.draggedNodeId
        const { shiftKey } = e
        const store = useEditorStore.getState()
        if (shiftKey) {
          store.toggleNodeSelection(nodeId)
        } else {
          store.setSelection([nodeId])
        }
        committedRef.current = true
        groupStartPositionsRef.current.clear()
        groupMoveTargetsRef.current.clear()
        groupGrabPlanePointRef.current = null
        dragStartPosRef.current = null
        store.clearDraggedNode()
        setControlsEnabled(true)
        try {
          dom.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
        return
      }

      if (isGroup) {
        const moves = new Map<string, THREE.Vector3>()
        for (const [id, pos] of groupMoveTargetsRef.current) {
          moves.set(id, pos)
        }
        committedRef.current = true
        useNetworkStore.getState().commitNodeMoves(moves)
        useEditorStore.getState().clearDraggedNode()
        groupStartPositionsRef.current.clear()
        groupMoveTargetsRef.current.clear()
        groupGrabPlanePointRef.current = null
        setControlsEnabled(true)
        try {
          dom.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
        return
      }

      const nodeId = s.draggedNodeId
      const finalPos = dragCurrentPosRef.current.clone()

      committedRef.current = true
      useNetworkStore.getState().commitNodeMove(nodeId, finalPos)
      useEditorStore.getState().clearDraggedNode()
      dragStartPosRef.current = null
      setControlsEnabled(true)
      try {
        dom.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
    }

    function onClick(e: MouseEvent) {
      if (e.button !== 0) return

      if (activeForDelete()) {
        const state = useEditorStore.getState()
        const network = useNetworkStore.getState()
        const hoveredNodeId = state.hoveredNodeId
        if (hoveredNodeId !== null && hoveredNodeId !== undefined) {
          network.deleteNode(hoveredNodeId)
          return
        }
        const hoveredBeamId = state.hoveredBeamId
        if (hoveredBeamId !== null && hoveredBeamId !== undefined) {
          network.deleteBeam(hoveredBeamId)
        }
        return
      }

      if (!activeForBuild()) {
        // SELECT_MOVE: selection is handled in pointerup (shift-click toggle,
        // plain-click set, marquee box). Here we only clear selection when the
        // click landed on empty space AND no marquee/node drag occurred.
        if (activeForSelectMove() && !hadRealDragRef.current) {
          const rect = dom.getBoundingClientRect()
          const nodeHit = getNearestNodeHit(
            snapshot.camera,
            e.clientX,
            e.clientY,
            rect,
            sharedMeshRegistry.nodeMeshes,
          )
          if (nodeHit === null) {
            useEditorStore.getState().clearSelection()
          }
        }
        return
      }

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
          const groupIds = Array.from(groupStartPositionsRef.current.keys())
          if (groupIds.length >= 2) {
            restoreGroupImperatively(groupIds)
          } else {
            restoreNodeImperatively(id)
          }
        }
        committedRef.current = false
        dragStartPosRef.current = null
        groupStartPositionsRef.current.clear()
        groupMoveTargetsRef.current.clear()
        groupGrabPlanePointRef.current = null
        hideMarquee()
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
  }, [snapshot, planeMeshRef, ghostPointRef, marqueeDivRef, controls])

  return null
}
