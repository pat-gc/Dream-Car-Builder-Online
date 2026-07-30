import type { Object3D } from 'three'

export interface MeshRegistry {
  nodeMeshes: Map<string, Object3D>
  beamMeshes: Map<string, Object3D>
  registerNode: (id: string, obj: Object3D | null) => void
  registerBeam: (id: string, obj: Object3D | null) => void
  clear: () => void
}

export function createMeshRegistry(): MeshRegistry {
  const nodeMeshes = new Map<string, Object3D>()
  const beamMeshes = new Map<string, Object3D>()
  return {
    nodeMeshes,
    beamMeshes,
    registerNode(id, obj) {
      if (obj === null) {
        nodeMeshes.delete(id)
      } else {
        nodeMeshes.set(id, obj)
      }
    },
    registerBeam(id, obj) {
      if (obj === null) {
        beamMeshes.delete(id)
      } else {
        beamMeshes.set(id, obj)
      }
    },
    clear() {
      nodeMeshes.clear()
      beamMeshes.clear()
    },
  }
}

export const sharedMeshRegistry = createMeshRegistry()
