# Panelizer — Idea Backlog

Features worth building, roughly in the order they should land. Nothing here is a
commitment; it is the shortlist that survived a pass over the codebase, kept
deliberately short so the tool stays *fast to learn* rather than growing into a
second-rate CAD package.

The guiding constraint: **a panel is an axis-aligned box** (`normal` picks the
axis its thickness runs along). Every idea below respects that. Ideas that would
break it are in [Not doing](#not-doing) with the reason.

---

## 1. Selection and batch editing

Done: the batch primitive (`updatePanels`, one undo step), a multi-select
inspector (material, orientation, face size and thickness, with differing values
shown as `Mixed`), duplicating a whole selection, `Ctrl+A` / `Ctrl+I` / `Esc`, and
modeless box-select (`Shift+drag` adds, `Ctrl+Shift+drag` removes; left→right
encloses, right→left touches, with a live preview). Still open:

- **Batch rotate / mirror.** Come from §2 and are group-aware for free if they
  pivot on the selection bounding box.
- **Align and distribute.** Align faces on an axis, space evenly. Shares its math
  with the array tool (§6).
- **Select similar** (same material / same size / same part group).
- **Parts list wiring.** A group row click calls `select(id)` and *cycles one
  panel at a time*, so clicking a quantity-4 row selects one panel. Row click
  should select the whole group, `Shift+click` should add, and cycling can move to
  `Alt+click` or its own affordance.

No data-model change anywhere in this section.

## 2. Rotation and orientation

Orientation is a single dropdown offering the three `normal` axes, and it has
three problems:

- The labels describe *roles* ("Upright side", "Back / door") but set a raw axis,
  so they lie as soon as a panel is repurposed.
- **Switching `normal` is not a 90° turn.** Going `x`→`y` sends thickness X→Y,
  width Y→Z and length Z→X — a 120° rotation about the cube diagonal. The panel
  lands somewhere nobody predicted.
- **There is no in-plane rotation.** Turning a 600×400 shelf into 400×600 means
  hand-typing two fields, and because `grain` is face-relative (`'length' |
  'width'`) it silently follows the *field* rather than the wood, so the physical
  grain direction flips without saying so.

**Proposal: one primitive — rotate 90° about a world axis.** Replace the dropdown
with three buttons (`⟲X ⟲Y ⟲Z`, Shift for counter-clockwise). Each is a pure
permutation, expressible as a lookup table beside `AXIS_FIELD` in `geometry.ts`.
Rotating about Y (X→Z, Z→−X) works out to:

| old `normal` | new `normal` | face dimensions |
| --- | --- | --- |
| `x` | `z` | unchanged |
| `y` | `y` | length ↔ width |
| `z` | `x` | unchanged |

X and Z get the same treatment — three small tables, no runtime trigonometry.
What falls out:

- Every orientation stays reachable, always one predictable 90° step at a time,
  and the steps compose.
- In-plane rotation is free (rotating about a panel's own normal is exactly the
  length/width swap). **The same patch must swap `grain`** so the physical grain
  stays put.
- It generalises to a multi-selection: rotate about the selection bounding-box
  centre and permute positions too. A single panel pivots on its own centre.
- Re-run snapping afterwards so a rotated panel re-lands on its neighbours.
- Hotkeys `R` / `Shift+R` in the viewport, so orientation stops being
  sidebar-only.

**Mirror** belongs to the same family and is about fifteen lines: reflect the
selection across a plane through its bounding-box centre (`x → 2c − x`). Model
the left side of a cabinet, mirror it to the right.

## 3. Keyboard shortcuts

Done: the keymap lives in `hooks/useShortcuts.tsx` (`?` lists it, mouse
controls included), with `F` to frame and `H` / `Alt+H` to hide and show. Still
missing: `R` / `Shift+R` once rotation (§2) exists.

## 4. Camera views and orthographic mode

Navigation is free orbit only. Add Front / Side / Top / Iso presets and an
orthographic toggle — an ortho top view makes alignment obvious without leaning
on snapping. drei supplies most of the parts.

## 5. Cost estimate

Add a `price` field to `Stock`. The cutlist already computes sheets needed and
waste, so multiplying through gives a project total and a per-material breakdown.
One field, one line of output, and it takes Panelizer from hobby modelling to
something you can quote from.

## 6. Array and distribute

Select a shelf, then "5 copies, evenly distributed between these two panels" or
"spaced 320". Shelf pitch is the single most repetitive modelling task in a
carcass. Emits ordinary panels — no new concept in the data model.

## 7. Exploded view

A slider that slides panels outward along their normals. Render-only, so the
model is untouched. Makes assembly order readable and shows off a shared link.

## 8. Overall dimensions readout

A persistent corner chip with the design's total bounding box (W×H×D), derived
from `panelBounds`. Answers "will it fit the alcove" without measuring anything.

## 9. Edge banding

Per panel, flag which of the four face edges get banding; the parts list totals
linear metres. Small model addition (`edges?: [boolean, boolean, boolean, boolean]`),
real shop need.

## 10. Named project slots

Autosave writes a single localStorage document, so "New (clear all)" is the only
way to start something else and it discards the previous design. Named slots
close a real path to losing work.

## 11. Templates

"Base cabinet", "bookshelf", "drawer box", parameterised by W×H×D. Delivers the
README's five-minutes-to-a-cutlist promise before the user has learned a single
tool.

## 12. Part numbers in the viewport

The cutlist diagram already labels parts. A toggle that shows matching labels on
the meshes makes the saw diagram map back onto the model.

---

## Carried over from the refactor

CSV escaping is fixed, and `parse` now drops panels with unusable geometry and
falls back on bad settings. Still open:

- **Versioned migrations.** `version` / `VERSION` are written but never read.
  Shared links make old files a public API, so the next schema change should add
  a `migrations[v]` chain rather than more ad-hoc back-filling.

## Not doing

- **Arbitrary angles** (mitres, tapers, angled sides). This breaks the
  axis-aligned assumption in `bounds`, `snapping` and `nesting` simultaneously.
  The cost is the whole geometry layer; the benefit is a minority of designs.
- **Joint-driven auto-sizing.** Settled deliberately: the size you draw is the
  size you cut, and joints are only ever indicated as a referential overlap tint.
  Auto-shortening a shelf to account for a dado would make the cutlist stop
  matching the model.
