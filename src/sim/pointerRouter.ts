import * as THREE from 'three'
import type { Object3D } from 'three'

const sharedRaycaster = new THREE.Raycaster()
const sharedNdc = new THREE.Vector2()

interface NodeHit {
  nodeId: string
}

export function getNearestNodeHit(
  camera: THREE.Camera,
  clientX: number,
  clientY: number,
  rect: DOMRect,
  nodeMeshes: Map<string, Object3D>,
): NodeHit | null {
  const id = getNearestIdHit(camera, clientX, clientY, rect, nodeMeshes)
  return id === null ? null : { nodeId: id }
}

interface BeamHit {
  beamId: string
}

export function getNearestBeamHit(
  camera: THREE.Camera,
  clientX: number,
  clientY: number,
  rect: DOMRect,
  beamMeshes: Map<string, Object3D>,
): BeamHit | null {
  const id = getNearestIdHit(camera, clientX, clientY, rect, beamMeshes)
  return id === null ? null : { beamId: id }
}

function getNearestIdHit(
  camera: THREE.Camera,
  clientX: number,
  clientY: number,
  rect: DOMRect,
  meshesById: Map<string, Object3D>,
): string | null {
  if (meshesById.size === 0) {
    return null
  }

  sharedNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1
  sharedNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1)

  sharedRaycaster.setFromCamera(sharedNdc, camera)

  const reverse = new Map<Object3D, string>()
  const meshes: Object3D[] = []
  meshesById.forEach((obj, id) => {
    if (obj !== null && obj !== undefined) {
      meshes.push(obj)
      reverse.set(obj, id)
    }
  })
  if (meshes.length === 0) {
    return null
  }

  const intersects = sharedRaycaster.intersectObjects(meshes, false)
  if (intersects.length === 0) {
    return null
  }

  let nearest = intersects[0]
  for (let i = 1; i < intersects.length; i++) {
    if (intersects[i].distance < nearest.distance) {
      nearest = intersects[i]
    }
  }

  return findIdForMesh(reverse, nearest.object)
}

function findIdForMesh(
  reverse: Map<Object3D, string>,
  target: Object3D,
): string | null {
  let current: Object3D | null = target
  while (current !== null) {
    const id = reverse.get(current)
    if (id !== undefined) {
      return id
    }
    current = current.parent
  }
  return null
}

export function raycastPlane(
  planeMesh: Object3D,
  camera: THREE.Camera,
  clientX: number,
  clientY: number,
  rect: DOMRect,
): THREE.Vector3 | null {
  sharedNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1
  sharedNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1)

  sharedRaycaster.setFromCamera(sharedNdc, camera)
  const intersects = sharedRaycaster.intersectObject(planeMesh, false)
  if (intersects.length === 0) {
    return null
  }
  return intersects[0].point.clone()
}

const sharedProjected = new THREE.Vector3()

export function projectToScreen(
  camera: THREE.Camera,
  worldPoint: THREE.Vector3,
  rect: DOMRect,
): { x: number; y: number } {
  sharedProjected.copy(worldPoint).project(camera)
  const x = (sharedProjected.x * 0.5 + 0.5) * rect.width + rect.left
  const y = (-sharedProjected.y * 0.5 + 0.5) * rect.height + rect.top
  return { x, y }
}
