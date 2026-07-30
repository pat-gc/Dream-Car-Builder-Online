import * as THREE from 'three'

export function snapToIncrement(value: number, increment: number): number {
  if (increment === 0) {
    return value
  }
  return Math.round(value / increment) * increment + 0
}

export const AXIS_SNAP_INCREMENT_DEG = 15

const DEG2RAD = Math.PI / 180

export function snapToAxis(
  start: THREE.Vector3,
  rawEnd: THREE.Vector3,
  incrementDeg: number = AXIS_SNAP_INCREMENT_DEG,
): THREE.Vector3 {
  const dx = rawEnd.x - start.x
  const dy = rawEnd.y - start.y
  const dz = rawEnd.z - start.z

  const lenSq = dx * dx + dy * dy + dz * dz
  if (lenSq < 1e-12) {
    return rawEnd.clone()
  }

  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const az = Math.abs(dz)

  const dropX = ax <= ay && ax <= az
  const dropY = !dropX && ay <= az
  const dropZ = !dropX && !dropY

  const compA = dropZ ? (dropX ? dz : dx) : (dropX ? dy : dx)
  const compB = dropZ ? (dropX ? dy : dy) : (dropX ? dz : dz)

  const inc = Math.max(1, Math.round(incrementDeg)) * DEG2RAD
  if (inc === 0) {
    return rawEnd.clone()
  }

  const angle = Math.atan2(compB, compA)
  const snappedAngle = Math.round(angle / inc) * inc

  const cosA = Math.cos(snappedAngle)
  const sinA = Math.sin(snappedAngle)

  const r = Math.hypot(compA, compB)

  let result: THREE.Vector3
  if (dropX) {
    const newDz = r * cosA
    const newDy = r * sinA
    result = new THREE.Vector3(0, newDy, newDz)
  } else if (dropY) {
    const newDx = r * cosA
    const newDz = r * sinA
    result = new THREE.Vector3(newDx, 0, newDz)
  } else {
    const newDx = r * cosA
    const newDy = r * sinA
    result = new THREE.Vector3(newDx, newDy, 0)
  }

  return result.add(start)
}
