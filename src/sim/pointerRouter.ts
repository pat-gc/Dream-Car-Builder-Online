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
  if (nodeMeshes.size === 0) {
    return null
  }

  sharedNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1
  sharedNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1)

  sharedRaycaster.setFromCamera(sharedNdc, camera)

  const reverse = new Map<Object3D, string>()
  const meshes: Object3D[] = []
  nodeMeshes.forEach((obj, id) => {
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

  const nodeId = findNodeIdForMesh(reverse, nearest.object)
  if (nodeId === null) {
    return null
  }

  return { nodeId }
}

function findNodeIdForMesh(
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
