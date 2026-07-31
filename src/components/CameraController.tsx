import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEditorStore, type SnapView } from '../store/editorStore'

// Step 15 — Camera orthographic snap views.
// Lives INSIDE <Canvas> (uses useThree/useFrame, per SPEC rule 2). Subscribes
// to a Zustand request (`snapRequestId`) that EditorUI (outside Canvas) raises
// via `requestSnapView`. Animates camera position + OrbitControls target so
// the camera looks straight down the requested axis at the current pivot,
// preserving the current distance from target (zoom/distance preserved). This
// is a one-time snap; OrbitControls remains fully interactive afterwards.

// Direction (unit vector) the camera moves TOWARD the target FROM, per view.
// i.e. final camera position = target + direction * distance.
const VIEW_DIRECTIONS: Record<SnapView, THREE.Vector3> = {
  TOP: new THREE.Vector3(0, 1, 0),
  BOTTOM: new THREE.Vector3(0, -1, 0),
  FRONT: new THREE.Vector3(0, 0, 1),
  BACK: new THREE.Vector3(0, 0, -1),
  RIGHT: new THREE.Vector3(1, 0, 0),
  LEFT: new THREE.Vector3(-1, 0, 0),
}

const DURATION_SECONDS = 0.4

// Minimal shape of OrbitControls we use (avoids importing the three/examples
// type, which isn't in the core THREE namespace).
interface OrbitControlsLike {
  target: THREE.Vector3
  update: () => void
}

// Scratch vectors reused across frames (zero per-frame allocations).
const _startPos = new THREE.Vector3()
const _startTarget = new THREE.Vector3()
const _endPos = new THREE.Vector3()
const _endTarget = new THREE.Vector3()
const _tmpPos = new THREE.Vector3()
const _tmpTarget = new THREE.Vector3()

interface Tween {
  startTime: number
  startPos: THREE.Vector3
  startTarget: THREE.Vector3
  endPos: THREE.Vector3
  endTarget: THREE.Vector3
}

// Ease-in-out (smoothstep) so the start/end of the snap is gentle.
function easeInOut(t: number): number {
  return t * t * (3 - 2 * t)
}

export default function CameraController() {
  const { camera, controls } = useThree()

  const tweenRef = useRef<Tween | null>(null)

  // Subscribe to snapRequestId changes; trigger (or replace) an active tween.
  // Wrapped in useEffect so cleanup removes the listener (HMR-safe) and so it
  // only attaches once per mount.
  useEffect(() => {
    return useEditorStore.subscribe((state, prev) => {
      if (
        state.snapRequestId !== prev.snapRequestId &&
        state.snapView !== null
      ) {
        const view = state.snapView
        if (controls === null || controls === undefined) return
        const orbit = controls as unknown as OrbitControlsLike

        // Current pivot + distance (preserve zoom/distance from target).
        _startTarget.copy(orbit.target)
        _startPos.copy(camera.position)
        const distance = _startPos.distanceTo(_startTarget)

        const dir = VIEW_DIRECTIONS[view]
        _endTarget.copy(_startTarget)
        _endPos.copy(_startTarget).addScaledVector(dir, distance)

        tweenRef.current = {
          startTime: -1, // set on first frame via performance.now()
          startPos: _startPos.clone(),
          startTarget: _startTarget.clone(),
          endPos: _endPos.clone(),
          endTarget: _endTarget.clone(),
        }
        void view
      }
    })
  }, [camera, controls])

  useFrame((_, delta) => {
    const orbit = (controls ?? null) as unknown as OrbitControlsLike | null
    if (orbit === null) return
    const tween = tweenRef.current
    if (tween === null) return

    if (tween.startTime < 0) {
      tween.startTime = (performance.now() / 1000)
      // Re-capture actual live start in case user moved since subscribe fired.
      tween.startPos.copy(camera.position)
      tween.startTarget.copy(orbit.target)
    }

    const elapsed = performance.now() / 1000 - tween.startTime
    const raw = Math.min(elapsed / DURATION_SECONDS, 1)
    const t = easeInOut(raw)

    _tmpPos.lerpVectors(tween.startPos, tween.endPos, t)
    _tmpTarget.lerpVectors(tween.startTarget, tween.endTarget, t)

    camera.position.copy(_tmpPos)
    orbit.target.copy(_tmpTarget)
    orbit.update()

    if (raw >= 1) {
      // Snap complete — one-time; leave OrbitControls fully interactive.
      tweenRef.current = null
    }
    // delta is unused but kept for API shape (useFrame).
    void delta
  })

  return null
}
