import * as THREE from 'three'

export interface Node3D {
  id: string
  position: THREE.Vector3
  velocity: THREE.Vector3
  force: THREE.Vector3
  mass: number
  isFixed: boolean
}

export interface Beam3D {
  id: string
  nodeAId: string
  nodeBId: string
  restLength: number
  stiffness: number
  damping: number
  maxStress: number
  currentStress: number
}
