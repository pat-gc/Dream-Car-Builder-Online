// Step 16a — Vehicle parts data model (per SPEC.md "Vehicle Parts Data Model").
// All three part types attach to the SAME structural node graph as regular
// beams (via findOrCreateNode). The difference is purely how they participate
// in the physics solve (handled in Step 16b, not here).

export type RigidMountType = 'ENGINE' | 'SEAT'

// Rigid two-point part: Wheel. Same attach pattern as Beam3D. Rendered with a
// wheel mesh perpendicular to the nodeAId→nodeBId axis at nodeBId (the axle
// end). Solved as a rigid distance constraint (never a spring).
export interface WheelPart {
  id: string
  nodeAId: string // hub-side structural attachment
  nodeBId: string // axle end — wheel mesh renders here
  restLength: number // fixed distance, enforced as rigid constraint
  wheelRadius: number
  mass: number // heavy
}

// Rigid three-point mount: Engine or Seat. All three pairwise distances are
// enforced as rigid constraints (the mount behaves as a rigid triangle).
// Constraint: only one ENGINE and one SEAT may exist in the network at a time.
export interface RigidMount {
  id: string
  type: RigidMountType
  nodeIds: [string, string, string]
  restLengths: [number, number, number] // pairwise, rigid, never flex
  mass: number // heavy
}

// Non-structural connector: Transmission. Attaches via the same two-click flow
// as a beam/WheelPart (nodeAId/nodeBId), merges identically, but contributes
// NO physics constraint — purely a logical/visual link for the drivetrain.
export interface TransmissionLink {
  id: string
  nodeAId: string
  nodeBId: string
  mass: number // contributes to vehicle mass/stats, not the constraint graph
}
