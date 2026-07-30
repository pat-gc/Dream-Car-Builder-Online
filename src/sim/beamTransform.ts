import * as THREE from 'three'
import { sharedMeshRegistry } from './meshRegistry'

const UP = new THREE.Vector3(0, 1, 0)

interface BeamTransformCache {
  axis: THREE.Vector3
  midpoint: THREE.Vector3
  quat: THREE.Quaternion
}

export type { BeamTransformCache }

export function makeBeamTransformCache(): BeamTransformCache {
  return {
    axis: new THREE.Vector3(),
    midpoint: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
  }
}

export function writeBeamTransform(
  beamId: string,
  aPos: THREE.Vector3,
  bPos: THREE.Vector3,
  cache: BeamTransformCache,
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
