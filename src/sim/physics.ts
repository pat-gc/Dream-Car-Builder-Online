import * as THREE from 'three'
import { NodeBeamNetworkState, Beam } from './network'

export interface PhysicsOptions {
  gravity?: number
  subSteps?: number
  groundY?: number
  groundDamping?: number
  groundFriction?: number
}

const DEFAULT_OPTIONS: Required<PhysicsOptions> = {
  gravity: -9.81,
  subSteps: 10,
  groundY: 0,
  groundDamping: 0.5,
  groundFriction: 0.9,
}

function isBeamBroken(beam: Beam): boolean {
  return beam.maxStress !== Infinity && beam.currentStress !== undefined && beam.currentStress > beam.maxStress
}

function removeBrokenBeams(state: NodeBeamNetworkState): void {
  const brokenIds: number[] = []
  for (const [id, beam] of Object.entries(state.beams)) {
    if (isBeamBroken(beam)) {
      brokenIds.push(Number(id))
    }
  }
  for (const id of brokenIds) {
    delete state.beams[id]
  }
}

export function stepPhysics(
  state: NodeBeamNetworkState,
  dt: number,
  options: PhysicsOptions = {},
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const subDt = dt / opts.subSteps

  for (let step = 0; step < opts.subSteps; step++) {
    for (const node of Object.values(state.nodes)) {
      if (!node.isFixed) {
        node.forceAccumulator.set(0, node.mass * opts.gravity, 0)
      }
    }

    for (const beam of Object.values(state.beams)) {
      const nodeA = state.nodes[beam.nodeAId]
      const nodeB = state.nodes[beam.nodeBId]
      if (!nodeA || !nodeB) continue

      const posA = nodeA.position
      const posB = nodeB.position
      const velA = nodeA.velocity
      const velB = nodeB.velocity

      const direction = new THREE.Vector3().subVectors(posB, posA)
      const currentLength = direction.length()
      if (currentLength === 0) continue

      const displacement = currentLength - beam.restLength
      const springForceMagnitude = beam.stiffness * displacement

      direction.normalize()
      const relativeVelocity = new THREE.Vector3().subVectors(velB, velA)
      const velocityAlongBeam = relativeVelocity.dot(direction)
      const dampingForceMagnitude = beam.damping * velocityAlongBeam

      const totalForceMagnitude = springForceMagnitude + dampingForceMagnitude

      beam.currentStress = Math.abs(totalForceMagnitude)

      const forceVector = direction.clone().multiplyScalar(totalForceMagnitude)

      if (!nodeA.isFixed) {
        nodeA.forceAccumulator.add(forceVector)
      }
      if (!nodeB.isFixed) {
        nodeB.forceAccumulator.sub(forceVector)
      }
    }

    for (const node of Object.values(state.nodes)) {
      if (node.isFixed) continue

      const acceleration = new THREE.Vector3().copy(node.forceAccumulator).divideScalar(node.mass)
      node.velocity.addScaledVector(acceleration, subDt)
      node.position.addScaledVector(node.velocity, subDt)

      if (node.position.y <= opts.groundY) {
        node.position.y = opts.groundY
        node.velocity.y = -node.velocity.y * opts.groundDamping
        node.velocity.x *= opts.groundFriction
        node.velocity.z *= opts.groundFriction
      }
    }

    removeBrokenBeams(state)
  }
}

export { DEFAULT_OPTIONS }