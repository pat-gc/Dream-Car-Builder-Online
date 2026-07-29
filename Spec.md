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

## Modes (explicit state machine, build/test in isolation before wiring to 3D)
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

## Build Order (one concern per prompt, verify before moving on)
1. Scaffold: Vite + R3F canvas, grid floor, camera, deploy config
2. Node3D/Beam3D types + network manager (add/remove/merge) — with unit tests
3. Static renderer: nodes as spheres, beams as cylinders
4. Editor UI overlay (outside Canvas) with mode toggle — no interactivity yet
5. Camera-perpendicular placement plane (isolated, no beam logic yet — just
   confirm raycasting works and logs hit points)
6. Placement plane wired to a live ghost point (single node preview only,
   no beam logic yet) with grid-increment snapping
7. Full ADD_BEAM two-click flow + ghost beam preview + axis snap toggle
8. Physics solver (`stepPhysics`) as a pure function + unit tests, not yet
   wired to rendering
9. PhysicsLoop component inside Canvas, Simulate/Stop toggle with state
   snapshot + reset
10. Pinned/anchor nodes
11. SELECT_MOVE drag tool
12. DELETE tool
13. Multi-select (box + shift)
14. Symmetry/mirror mode
15. Camera orthographic snap views (Top/Bottom/Front/Back/Left/Right) via
    viewport gizmo or buttons
16. Vehicle parts: wheels, engine, transmission, seat
17. Drivable physics (input → torque/steering)

## Workflow Discipline
- One prompt = one numbered step above. Don't bundle fixes with features.
- `git commit` after every step that works. Revert instead of patching blind
  when something breaks.
- Ask the agent to summarize which files it changed before testing.
- Enable Kilo Code codebase indexing once the project passes ~10 files.