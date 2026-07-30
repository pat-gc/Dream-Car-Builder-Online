import * as THREE from 'three'
import type { Beam3D, Node3D } from '../types/nodeGraph'
import type { NetworkState } from './network'

export interface PhysicsOptions {
  gravity: number
  subSteps: number
  groundY: number
  groundDamping: number
  friction: number
}

export const DEFAULT_GRAVITY = -9.81
export const DEFAULT_SUB_STEPS = 10
export const DEFAULT_GROUND_Y = 0
export const DEFAULT_GROUND_DAMPING = 0.5
export const DEFAULT_FRICTION = 0.8

export const DEFAULT_PHYSICS_OPTIONS: PhysicsOptions = {
  gravity: DEFAULT_GRAVITY,
  subSteps: DEFAULT_SUB_STEPS,
  groundY: DEFAULT_GROUND_Y,
  groundDamping: DEFAULT_GROUND_DAMPING,
  friction: DEFAULT_FRICTION,
}

function resolveOptions(
  options?: Partial<PhysicsOptions>,
): PhysicsOptions {
  return { ...DEFAULT_PHYSICS_OPTIONS, ...(options ?? {}) }
}

function cloneNode(node: Node3D): Node3D {
  return {
    id: node.id,
    position: node.position.clone(),
    velocity: node.velocity.clone(),
    force: node.force.clone(),
    mass: node.mass,
    isFixed: node.isFixed,
  }
}

function cloneState(state: NetworkState): NetworkState {
  const nodes = new Map<string, Node3D>()
  for (const [id, node] of state.nodes) {
    nodes.set(id, cloneNode(node))
  }
  const beams = new Map<string, Beam3D>()
  for (const [id, beam] of state.beams) {
    beams.set(id, { ...beam })
  }
  return { nodes, beams }
}

const _axis = new THREE.Vector3()
const _relVel = new THREE.Vector3()
const _gravForce = new THREE.Vector3()
const _springForce = new THREE.Vector3()

function applyBeamForces(
  state: NetworkState,
  brokenBeamIds: Set<string>,
): void {
  for (const [beamId, beam] of state.beams) {
    if (brokenBeamIds.has(beamId)) continue

    const nodeA = state.nodes.get(beam.nodeAId)
    const nodeB = state.nodes.get(beam.nodeBId)
    if (nodeA === undefined || nodeB === undefined) {
      brokenBeamIds.add(beamId)
      continue
    }

    _axis.subVectors(nodeB.position, nodeA.position)
    const length = _axis.length()
    if (length < 1e-9) {
      beam.currentStress = 0
      continue
    }

    _axis.divideScalar(length)

    const displacement = length - beam.restLength
    const springMag = beam.stiffness * displacement

    _relVel.subVectors(nodeB.velocity, nodeA.velocity)
    const dampMag = beam.damping * _relVel.dot(_axis)

    const forceMag = springMag + dampMag
    beam.currentStress = Math.abs(forceMag)

    if (beam.maxStress !== Infinity && beam.currentStress > beam.maxStress) {
      brokenBeamIds.add(beamId)
      continue
    }

    _springForce.copy(_axis).multiplyScalar(forceMag)

    if (nodeA.isFixed === false) {
      nodeA.force.add(_springForce)
    }
    if (nodeB.isFixed === false) {
      nodeB.force.sub(_springForce)
    }
  }
}

function integrate(state: NetworkState, options: PhysicsOptions, subDt: number): void {
  for (const node of state.nodes.values()) {
    if (node.isFixed === true) {
      node.velocity.set(0, 0, 0)
      continue
    }

    const invMass = 1 / node.mass
    node.velocity.addScaledVector(node.force, invMass * subDt)
    node.position.addScaledVector(node.velocity, subDt)

    if (node.position.y < options.groundY) {
      node.position.y = options.groundY
      node.velocity.y = -node.velocity.y * options.groundDamping
      node.velocity.x *= options.friction
      node.velocity.z *= options.friction
    }
  }
}

function resetForces(state: NetworkState, options: PhysicsOptions): void {
  for (const node of state.nodes.values()) {
    if (node.isFixed === true) {
      node.force.set(0, 0, 0)
      continue
    }
    _gravForce.set(0, node.mass * options.gravity, 0)
    node.force.copy(_gravForce)
  }
}

export function stepPhysics(
  state: NetworkState,
  dt: number,
  options?: Partial<PhysicsOptions>,
): NetworkState {
  const opts = resolveOptions(options)
  const subSteps = Math.max(1, Math.floor(opts.subSteps))
  const subDt = dt / subSteps

  const next = cloneState(state)
  const brokenBeamIds = new Set<string>()

  for (let step = 0; step < subSteps; step++) {
    resetForces(next, opts)
    applyBeamForces(next, brokenBeamIds)
    integrate(next, opts, subDt)
  }

  if (brokenBeamIds.size > 0) {
    for (const id of brokenBeamIds) {
      next.beams.delete(id)
    }
  }

  for (const node of next.nodes.values()) {
    node.force.set(0, 0, 0)
  }

  return next
}
