import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Vector3, Plane } from 'three'
import { NodeBeamNetworkState, Node } from '../sim/network'

export type EditorMode = 'addNode' | 'addBeam' | 'delete' | 'select'

export function snapToGrid(val: number, step: number): number {
  return step > 0 ? Math.round(val / step) * step : val
}

export function snapPointToGrid(point: Vector3, step: number): Vector3 {
  if (step <= 0) return point.clone()
  return new Vector3(
    snapToGrid(point.x, step),
    snapToGrid(point.y, step),
    snapToGrid(point.z, step),
  )
}

interface ViewportInteractionsProps {
  mode: EditorMode
  networkState: NodeBeamNetworkState
  beamStage: 'idle' | 'placing' | 'dragging'
  beamStartNodeId: number | null
  beamStartPoint: THREE.Vector3 | null
  snapSize: number
  draggedNodeId: number | null
  onBeamStageChange: (stage: 'idle' | 'placing' | 'dragging') => void
  onBeamEndPointChange: (point: THREE.Vector3 | null) => void
  onSnapPointChange: (point: THREE.Vector3 | null) => void
  onSnapTargetTypeChange: (type: 'node' | 'plane' | null) => void
  onNetworkUpdate: (updater: (prev: NodeBeamNetworkState) => NodeBeamNetworkState) => void
}

function findNearestNode(
  nodes: NodeBeamNetworkState['nodes'],
  point: Vector3,
  excludeId: number | null,
  maxDist: number,
): Node | null {
  let nearest: Node | null = null
  let minDist = maxDist
  for (const node of Object.values(nodes)) {
    if (excludeId !== null && node.id === excludeId) continue
    const d = node.position.distanceTo(point)
    if (d < minDist) {
      minDist = d
      nearest = node
    }
  }
  return nearest
}

export function ViewportInteractions({
  mode,
  networkState,
  beamStage,
  beamStartNodeId,
  beamStartPoint,
  snapSize,
  draggedNodeId,
  // Unused now that beam stage advancement is single-sourced in App.tsx.
  // Kept in the prop interface for stability/forward-compat; prefixed with
  // underscore to signal "intentionally unused".
  onBeamStageChange: _onBeamStageChange,
  onBeamEndPointChange,
  onSnapPointChange,
  onSnapTargetTypeChange,
  onNetworkUpdate,
}: ViewportInteractionsProps) {
  const { camera, pointer } = useThree()

  // Placement/drag plane: camera-perpendicular, through beam start point or
  // ground Y=0.
  function buildPlane(cam: THREE.Camera): Plane {
    const direction = new THREE.Vector3()
    cam.getWorldDirection(direction)
    const planeY = beamStartPoint ? beamStartPoint.y : 0
    const planePoint = beamStartPoint
      ? new THREE.Vector3().copy(beamStartPoint)
      : new THREE.Vector3(0, planeY, 0)
    return new THREE.Plane().setFromNormalAndCoplanarPoint(direction, planePoint)
  }

  useFrame(() => {
    const cam = camera as THREE.Camera
    if (!cam) return

    const plane = buildPlane(cam)

    // 1) Node dragging with grid snapping (Move/Select mode).
    if (mode === 'select' && draggedNodeId !== null && draggedNodeId !== undefined) {
      const mouse = new THREE.Vector2(pointer.x, pointer.y)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, cam)
      const intersection = new THREE.Vector3()
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        const snapped = snapPointToGrid(intersection, snapSize)
        onNetworkUpdate((prev) => {
          const next: NodeBeamNetworkState = {
            ...prev,
            nodes: { ...prev.nodes },
            beams: { ...prev.beams },
          }
          const node = next.nodes[draggedNodeId]
          if (node) node.position.copy(snapped)
          return next
        })
      }
      return
    }

    // 2) Beam dragging + snap logic.
    //
    // NOTE: the historical 'placing' -> 'dragging' stage advancement that
    // lived here was removed. App.tsx now transitions beamStage directly to
    // 'dragging' on Click 1 (synchronously), eliminating the one-frame race
    // that previously dropped beams when a second click landed while stage
    // was still 'placing'. The state machine is now single-sourced in
    // App.tsx handleBeamPlace + the beamStageRef wrapper.
    if (mode === 'addBeam' && beamStage === 'dragging' && beamStartPoint) {
      const mouse = new THREE.Vector2(pointer.x, pointer.y)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, cam)

      const intersection = new THREE.Vector3()
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        const snapped = snapPointToGrid(intersection, snapSize)
        onBeamEndPointChange(snapped.clone())

        const nearest = findNearestNode(networkState.nodes, intersection, beamStartNodeId, 0.4)
        if (nearest) {
          onSnapPointChange(nearest.position.clone())
          onSnapTargetTypeChange('node')
        } else {
          onSnapPointChange(snapped.clone())
          onSnapTargetTypeChange('plane')
        }
      }
    } else if (mode === 'addNode') {
      // Snap preview in addNode mode
      const mouse = new THREE.Vector2(pointer.x, pointer.y)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, cam)

      const intersection = new THREE.Vector3()
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        const nearest = findNearestNode(networkState.nodes, intersection, null, 0.3)
        if (nearest) {
          onSnapPointChange(nearest.position.clone())
          onSnapTargetTypeChange('node')
        } else {
          const snapped = snapPointToGrid(intersection, snapSize)
          onSnapPointChange(snapped.clone())
          onSnapTargetTypeChange('plane')
        }
      }
    } else {
      onSnapPointChange(null)
      onSnapTargetTypeChange(null)
    }
  })

  return null
}
