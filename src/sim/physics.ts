import * as THREE from 'three'
import type { Beam3D, Node3D } from '../types/nodeGraph'
import type { NetworkState } from './network'

export interface PhysicsOptions {
  gravity: number
  subSteps: number
  groundY: number
  groundDamping: number
  friction: number
  // Step 16b — how many PBD relaxation passes are applied to rigid
  // constraints per substep. RigidMount enforces three pairwise distances
  // simultaneously; multiple passes let the three constraints converge
  // (a single pass leaves residual flex on a loaded triangle).
  rigidIterations: number
}

export const DEFAULT_GRAVITY = -9.81
export const DEFAULT_SUB_STEPS = 10
export const DEFAULT_GROUND_Y = 0
export const DEFAULT_GROUND_DAMPING = 0.5
export const DEFAULT_FRICTION = 0.8
export const DEFAULT_RIGID_ITERATIONS = 8

export const DEFAULT_PHYSICS_OPTIONS: PhysicsOptions = {
  gravity: DEFAULT_GRAVITY,
  subSteps: DEFAULT_SUB_STEPS,
  groundY: DEFAULT_GROUND_Y,
  groundDamping: DEFAULT_GROUND_DAMPING,
  friction: DEFAULT_FRICTION,
  rigidIterations: DEFAULT_RIGID_ITERATIONS,
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
  return {
    nodes,
    beams,
    wheels: new Map(state.wheels),
    rigidMounts: new Map(state.rigidMounts),
    transmissions: new Map(state.transmissions),
  }
}

const _axis = new THREE.Vector3()
const _relVel = new THREE.Vector3()
const _gravForce = new THREE.Vector3()
const _springForce = new THREE.Vector3()

// Step 16b scratch (rigid constraint correction).
const _corr = new THREE.Vector3()

// The rigid constraint passes (WheelPart + RigidMount) distribute the position
// correction by inverse mass. A fixed node contributes weight 0 so it absorbs
// no movement and the corrective load falls entirely on the other node.
function inverseMass(node: Node3D, effective: number): number {
  if (node.isFixed === true) return 0
  return 1 / effective
}

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

// Step 16b — enforce a single rigid distance constraint between two nodes.
// Position-Based Dynamics style: move both nodes along the connecting axis to
// close the gap between current distance and restLength, weighted by inverse
// mass (heavier nodes move less); fixed nodes move nothing.
function satisfyDistanceConstraint(
  state: NetworkState,
  aId: string,
  bId: string,
  restLength: number,
  effectiveMass: Map<string, number>,
): void {
  const nodeA = state.nodes.get(aId)
  const nodeB = state.nodes.get(bId)
  if (nodeA === undefined || nodeB === undefined) return

  const massA = effectiveMass.get(aId) ?? nodeA.mass
  const massB = effectiveMass.get(bId) ?? nodeB.mass

  const wA = inverseMass(nodeA, massA)
  const wB = inverseMass(nodeB, massB)
  const wSum = wA + wB
  if (wSum === 0) return // both fixed: nothing to do

  _axis.subVectors(nodeB.position, nodeA.position)
  const length = _axis.length()
  if (length < 1e-9) return

  const delta = (length - restLength) / length // signed scale on _axis
  // nodeA moves +axis by (delta * wA/wSum); nodeB moves -axis by the
  // complementary share.
  const aFrac = wA / wSum
  const bFrac = wB / wSum

  _corr.copy(_axis).multiplyScalar(delta * aFrac)
  nodeA.position.add(_corr)

  _corr.copy(_axis).multiplyScalar(delta * bFrac)
  nodeB.position.sub(_corr)
}

// Step 16b — post-integration correction pass for all rigid parts. WheelPart
// contributes one constraint; RigidMount contributes three pairwise
// constraints. TransmissionLink is intentionally excluded (zero constraint).
function satisfyRigidConstraints(
  state: NetworkState,
  options: PhysicsOptions,
  effectiveMass: Map<string, number>,
): void {
  const iters = Math.max(1, Math.floor(options.rigidIterations))
  for (let pass = 0; pass < iters; pass++) {
    for (const w of state.wheels.values()) {
      satisfyDistanceConstraint(state, w.nodeAId, w.nodeBId, w.restLength, effectiveMass)
    }
    for (const m of state.rigidMounts.values()) {
      satisfyDistanceConstraint(state, m.nodeIds[0], m.nodeIds[1], m.restLengths[0], effectiveMass)
      satisfyDistanceConstraint(state, m.nodeIds[1], m.nodeIds[2], m.restLengths[1], effectiveMass)
      satisfyDistanceConstraint(state, m.nodeIds[2], m.nodeIds[0], m.restLengths[2], effectiveMass)
    }
  }
}

function integrate(
  state: NetworkState,
  options: PhysicsOptions,
  subDt: number,
  effectiveMass: Map<string, number>,
): void {
  for (const node of state.nodes.values()) {
    if (node.isFixed === true) {
      node.velocity.set(0, 0, 0)
      continue
    }

    const mass = effectiveMass.get(node.id) ?? node.mass
    const invMass = 1 / mass
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

function resetForces(
  state: NetworkState,
  options: PhysicsOptions,
  effectiveMass: Map<string, number>,
): void {
  for (const node of state.nodes.values()) {
    if (node.isFixed === true) {
      node.force.set(0, 0, 0)
      continue
    }
    const mass = effectiveMass.get(node.id) ?? node.mass
    _gravForce.set(0, mass * options.gravity, 0)
    node.force.copy(_gravForce)
  }
}

// Step 16b — rigid parts (Wheel/RigidMount) contribute their mass to the
// mounting nodes for gravity/inertia. Distribution: each part's mass is split
// equally among its attachment nodes (Wheel: half to each of 2; RigidMount: a
// third to each of 3). TransmissionLink mass is excluded — it is a
// non-structural connector with no physics constraint, and per SPEC the engine
// → transmission → wheel torque path is a future (Step 17) concern; for now its
// mass does not enter the constraint/inertia graph.
function buildEffectiveMasses(state: NetworkState): Map<string, number> {
  const masses = new Map<string, number>()
  for (const [id, node] of state.nodes) {
    masses.set(id, node.mass)
  }
  const add = (id: string, amount: number): void => {
    const prev = masses.get(id)
    if (prev === undefined) return
    masses.set(id, prev + amount)
  }
  for (const w of state.wheels.values()) {
    add(w.nodeAId, w.mass * 0.5)
    add(w.nodeBId, w.mass * 0.5)
  }
  for (const m of state.rigidMounts.values()) {
    const share = m.mass / 3
    add(m.nodeIds[0], share)
    add(m.nodeIds[1], share)
    add(m.nodeIds[2], share)
  }
  return masses
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
  // Effective masses are built once per step; part topology doesn't change
  // across substeps, so this is safe and cheap.
  const effectiveMass = buildEffectiveMasses(next)

  for (let step = 0; step < subSteps; step++) {
    resetForces(next, opts, effectiveMass)
    applyBeamForces(next, brokenBeamIds)
    integrate(next, opts, subDt, effectiveMass)
    // Step 16b — enforce rigid distance constraints as a post-integration
    // correction pass (PBD-style), after the spring force/integration step.
    satisfyRigidConstraints(next, opts, effectiveMass)
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
