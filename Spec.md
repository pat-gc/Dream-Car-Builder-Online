# Node-Beam Vehicle Builder — Project Spec

## Goal
A web-based, node-and-beam DIY vehicle/structure builder. Players draw beams
directly (nodes only exist as beam endpoints, never placed standalone) to
construct trusses, chassis, and vehicles — no pre-molded Lego-block parts —
simulated with real spring-mass-damper physics (stiffness, damping, breaking
under stress). Long-term: wheels, engine, transmission, driver seat →
drivable vehicles. Stretch: extend to rockets using the same node/beam engine.

## Stack
- React 18 + TypeScript + Vite
- @react-three/fiber + @react-three/drei + three.js
- Vitest for physics/sim unit tests
- Deploy target: Vercel

## Hard Architectural Rules (never violate, restate in every relevant prompt)
1. **HTML/DOM UI (toolbars, panels, buttons) always renders OUTSIDE `<Canvas>`.**
   R3F cannot mount `<div>`/`<button>` etc. as children of `<Canvas>`.
2. **R3F hooks (`useFrame`, `useThree`) only run inside components that are
   children of `<Canvas>`.** Never call them in `App` itself or in overlay UI.
3. **Left mouse button = build/edit/select. Right mouse button = camera only.**
   OrbitControls: `mouseButtons={{ LEFT: undefined, MIDDLE: DOLLY, RIGHT: ROTATE }}`.
4. **No ground-plane raycasting fallback.** All node/beam placement raycasts
   exclusively against a camera-perpendicular placement plane, whose depth is
   set by the first point of the beam being drawn (defaults to ground depth).
5. **ID checks must be explicit** (`id !== null && id !== undefined`), never
   truthy checks — node/index `0` is valid and falsy in JS.
6. **Nodes within a small merge-distance threshold auto-merge** into one node
   instead of overlapping duplicates.
7. **Camera has no artificial horizon lock** — `minPolarAngle=0`,
   `maxPolarAngle=Math.PI` — so side/bottom views work.

## Data Model
```ts
Node3D {
  id: string
  position: Vector3
  velocity: Vector3
  force: Vector3
  mass: number
  isFixed: boolean   // pinned/anchored
}

Beam3D {
  id: string
  nodeAId: string
  nodeBId: string
  restLength: number
  stiffness: number   // k
  damping: number      // c
  maxStress: number
  currentStress: number
}
```

## Vehicle Parts Data Model
Parts are NOT a separate free-floating layer — all four part types (Wheel,
Engine, Seat, Transmission) attach to and merge with the SAME structural
node graph as regular beams, using the identical `findOrCreateNode` merge
behavior (rule 6). The key difference between them is purely how they
participate in the physics solve.

### Physics classification — three categories
1. **Spring beams** (existing `Beam3D`) — flex per Hooke's law, can break
   above `maxStress`. This is the default/only category through Step 15.
2. **Rigid parts** (Wheel, Engine, Seat) — heavy, but must NOT flex at all.
   These are NOT implemented as very-high-stiffness springs (that still
   jitters/approximates); they are solved as hard distance constraints
   (fixed-length rods) between their mounting nodes, enforced as a
   post-integration correction pass in `stepPhysics`, separate from and
   after the spring-force pass. They still contribute mass to their
   mounting node(s) for gravity/inertia purposes.
3. **Non-structural connectors** (Transmission) — contribute ZERO physics
   constraint of any kind (no spring, no rigid distance-lock). They still
   attach to and merge with existing structural nodes exactly like a beam
   or WheelPart (same `findOrCreateNode` two-click flow) — the ONLY
   difference from a spring beam is that they're entirely excluded from
   the physics solve, so they can visually cross/overlap other beams
   without needing to structurally align with them. They exist purely as a
   logical/visual link for the future drivetrain system (Step 17: mapping
   engine → transmission → wheel for torque delivery).

### Types
```ts
// Rigid two-point part: Wheel. Same two-click flow as Beam3D (attaches to
// existing structural nodes via findOrCreateNode/merge), but rendered with
// a wheel mesh perpendicular to the beam axis at nodeBId (the axle/outer
// end), and solved as a rigid distance constraint, never a spring.
WheelPart {
  id: string
  nodeAId: string      // hub-side structural attachment
  nodeBId: string       // axle end — wheel mesh renders here, perpendicular
                          // to the nodeAId→nodeBId axis
  restLength: number     // fixed distance, enforced as rigid constraint
  wheelRadius: number
  mass: number            // heavy
}

// Rigid three-point mount: Engine or Seat. Three existing structural nodes,
// each clicked/merged individually (same findOrCreateNode behavior as a
// beam endpoint). All three pairwise distances are enforced as rigid
// constraints (i.e. the mount behaves as a rigid triangle).
RigidMount {
  id: string
  type: 'ENGINE' | 'SEAT'
  nodeIds: [string, string, string]
  restLengths: [number, number, number]  // pairwise, rigid, never flex
  mass: number                            // heavy
}

// Non-structural connector: Transmission. Attaches to existing structural
// nodes via the SAME two-click flow and findOrCreateNode merge behavior as
// a beam or WheelPart (nodeAId/nodeBId, not raw free-floating points) — so
// it snaps/merges just like everything else. The difference is purely in
// the physics solve: it contributes NO constraint at all (no spring, no
// rigid distance-lock), so it can visually cross/overlap other beams
// without needing to align with them structurally. It exists as a
// logical/visual link for the future drivetrain system (Step 17: mapping
// engine → transmission → wheel for torque delivery).
TransmissionLink {
  id: string
  nodeAId: string
  nodeBId: string
  mass: number   // still contributes to overall vehicle mass display/stats,
                   // but is not attached to the physics constraint graph
}
```


- `ADD_BEAM` — the only placement tool; there is no standalone "place a node"
  mode. Nodes only ever come into existence as the endpoint of a beam
  (or via auto-merge with an existing node). Flow:
  - Before the first click: a ghost/preview node (semi-transparent sphere)
    follows the cursor on the placement plane, snapping to nearby existing
    nodes if in range.
  - Click 1: commits the start point — either attaches to an existing node
    (if snapped) or creates a new one via `findOrCreateNode`.
  - Between click 1 and click 2: a full ghost beam renders (semi-transparent
    cylinder + end-point sphere) live-following the cursor, so the player
    sees exactly what will be placed before committing.
  - Click 2: commits the end point the same way (existing node or new) and
    finalizes the permanent beam.
  - Esc cancels the in-progress beam and clears the ghost.
- `SELECT_MOVE` — drag node with snapping; later: box-select + shift-select
- `DELETE` — click node (cascades connected beams) or beam
- `SIMULATE` — physics running; snapshot state on start, restore on stop

### Camera Orthographic Snap Views
The Editor UI must include a camera control (e.g. a viewport gizmo or a row of
buttons) that smoothly snaps the camera to each of the six standard
orthographic views around the current pivot/focus point:
- Top, Bottom
- Front, Back
- Left, Right
Clicking a view button animates the camera to look straight down that axis
(not just rotates freely near it) so the player gets a true aligned
orthographic-style view for precise building. This is independent of free
orbit — the player can still right-click-drag to rotate freely afterward.
Grid-position snapping (increment snap) alone doesn't guarantee a beam is
perfectly vertical/horizontal/on-axis, since both endpoints snap to a grid
independently. Add a separate, togglable **Axis Snap** mode for beam placement:
- When enabled, after click 1, the ghost beam's second point is constrained to
  the nearest of the primary axes (or fixed angle increments, e.g. every 15°)
  relative to the start point — so dragging near-vertical locks it dead
  vertical, near-horizontal locks it dead horizontal, etc.
- This is independent from and stacks with the grid-increment position snap
  (position snap decides *where* on the plane; axis snap decides the *angle*
  of the beam relative to its start node).
- Both snap toggles should be adjustable/visible in the Editor UI (increment
  size dropdown + axis-snap on/off, with optional angle-increment setting).

## State Management & Performance Patterns
These conventions are confirmed working well through Step 3 and must be
maintained/extended as the project grows:

- **Pure functional state for the network model** (`src/sim/network.ts`):
  every mutation returns a new cloned state, zero React/R3F dependencies,
  only depends on three.js math. Keep this pattern for all future network
  operations (SELECT_MOVE, DELETE, symmetry, etc.) — do not introduce
  in-place mutation here.
- **Editor/app state moves to Zustand once modes are introduced (Step 4+).**
  `useState` in `App.tsx` is fine for the Step 3 hardcoded test network, but
  once `ADD_BEAM`/`SELECT_MOVE`/`DELETE`/snap settings/selection sets exist,
  centralize them in a Zustand store instead of prop-drilling or scattering
  `useState` calls across `App.tsx`. The `NetworkState` itself can live in
  the same store or a separate one — keep the pure functional update pattern
  either way.
- **Physics loop (Step 8/9) must NOT drive per-frame React state updates.**
  Running `setState` at 60fps inside `useFrame` causes reconciliation
  bottlenecks. Instead:
  - Store live/mutable simulation values (positions, velocities) in refs or
    a transient (non-reactive) store, updated directly inside `useFrame`.
  - Sync coordinates straight to each mesh's underlying `position`/
    `quaternion` objects imperatively — bypass React re-render for the hot
    path.
  - Only push the final state back into reactive state (Zustand/`useState`)
    when the simulation is paused/stopped, e.g. for the reset-to-snapshot
    behavior.
- **Rendering performance conventions** to carry forward from
  `NetworkRenderer.tsx`:
  - Memoize per-beam geometry math (`useMemo` keyed on endpoint positions)
    so only beams connected to a moved node recompute.
  - Reuse a single unit-length `cylinderGeometry`, scaled per beam, rather
    than constructing new geometry per beam.
  - Squared-distance comparisons for any proximity/threshold checks
    (`findOrCreateNode`, merge, snapping) — never take an unnecessary
    `sqrt`.
  - Guard against degenerate/zero-length beams (`NaN` quaternion checks)
    before rendering.
  - **Once node/beam counts grow large (vehicles, complex trusses):**
    migrate `NodeMesh`/`BeamMesh` to `<instancedMesh>` to collapse draw
    calls. Flag this as a checkpoint once a single structure regularly
    exceeds roughly 100+ nodes/beams, rather than doing it prematurely.


1. Scaffold: Vite + R3F canvas, grid floor, camera, deploy config
2. Node3D/Beam3D types + network manager (add/remove/merge) — with unit tests
3. Static renderer: nodes as spheres, beams as cylinders
4. Editor UI overlay (outside Canvas) with mode toggle — no interactivity yet.
   Introduce Zustand store here for editor mode/state (see State Management
   section) rather than continuing with ad-hoc useState.
5. Camera-perpendicular placement plane (isolated, no beam logic yet — just
   confirm raycasting works and logs hit points)
6. Placement plane wired to a live ghost point (single node preview only,
   no beam logic yet) with grid-increment snapping
7. Full ADD_BEAM two-click flow + ghost beam preview + axis snap toggle
8. Physics solver (`stepPhysics`) as a pure function + unit tests, not yet
   wired to rendering
9. PhysicsLoop component inside Canvas, Simulate/Stop toggle with state
   snapshot + reset. Follow the ref-based/imperative-sync pattern from the
   State Management section — no per-frame setState.
10. Pinned/anchor nodes
11. SELECT_MOVE drag tool
12. DELETE tool
13. Multi-select (box + shift)
14. Symmetry/mirror mode
15. Camera orthographic snap views (Top/Bottom/Front/Back/Left/Right) via
    viewport gizmo or buttons
16. Vehicle parts, per the Vehicle Parts Data Model section:
    16a. Data model + network manager functions for WheelPart, RigidMount
         (Engine/Seat), TransmissionLink — placement, merge behavior,
         removal/cascade — with unit tests. No physics solving yet.
    16b. Rigid distance-constraint solving in `stepPhysics` (Wheel/Engine/
         Seat never flex) as a distinct pass from the spring-beam pass —
         with unit tests proving zero flex under load.
    16c. Placement UI/modes (Add Wheel/Engine/Transmission/Seat), ghost
         previews, rendering (wheel mesh perpendicular at axle node, engine/
         seat placeholder geometry, transmission as a simple connector
         mesh), drag-following, deletion cascade.
17. Drivable physics (input → torque/steering, using the Transmission's
    logical engine→wheel graph from the parts layer)

## Workflow Discipline
- One prompt = one numbered step above. Don't bundle fixes with features.
- `git commit` after every step that works. Revert instead of patching blind
  when something breaks.
- Ask the agent to summarize which files it changed before testing.
- Enable Kilo Code codebase indexing once the project passes ~10 files.