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

- **Align faces** on an axis. (Distribute is done: `lib/arrange.ts`, a
  Distribute X / Y / Z row for three or more parts: equal edge-to-edge gaps,
  or equal centre spacing where they don't fit side by side.)
- **Select similar** (same material / same size / same part group).

No data-model change anywhere in this section.

## 2. Rotation and orientation

Done: the orientation dropdown is gone. `Rotate 90°` buttons (X / Y / Z,
Shift+click for the other way) and `R` / `Shift+R` turn the selection a quarter
turn about a world axis, as a group around its bounding-box centre, keeping the
grain on the wood (`lib/rotate.ts`). Still open:

- Re-run snapping after a turn so a rotated panel re-lands on its neighbours.

**Mirror** is done as mirrored copies (`lib/mirror.ts`): the Mirror X / Y / Z
buttons add a reflected copy of the selection against its far side (Shift: near
side), corners and lap halves flipped, joints kept between the copies.

## 3. Keyboard shortcuts

Done: the keymap lives in `hooks/useShortcuts.tsx` (`?` lists it, mouse
controls included), with `F` to frame, `H` / `Alt+H` to hide and show, and
`R` / `Shift+R` to rotate.

## 4. Camera views and orthographic mode

The axis gizmo's dots already snap the camera to an axis. Named Front / Side /
Top buttons and an orthographic toggle were weighed and judged not worth it.

## 6. Array and distribute

Tried as "N copies, a gap apart" and dropped: the copy count read oddly, and
Duplicate plus Space evenly (§1) covers shelf pitch.

## 7. Exploded view

Tried as a "pull apart" slider in the viewport and dropped: it didn't add much.
The joint editor's close-up (§13) already shows a joint's pieces apart.

## 8. Overall dimensions readout

Done: a corner chip (`viewport/PieceReadout.tsx`) with the piece's — or the
selection's — width × height × depth. Pointing at a size names it and draws it
on the model in its axis colour.

## 9. Edge banding

Per panel, flag which of the four face edges get banding; the parts list totals
linear metres. Small model addition (`edges?: [boolean, boolean, boolean, boolean]`),
real shop need. Deferred: marking which edges are banded is per-panel UI work
that costs more than the total is worth for now.

## 10. Named project slots

Done: projects have a name and are kept separately in localStorage
(`lib/projects.ts`), listed newest first in the toolbar's projects menu. Imports
and shared links open as new projects instead of replacing the open one.

## 11. Templates

"Base cabinet", "bookshelf", "drawer box", parameterised by W×H×D. Delivers the
README's five-minutes-to-a-cutlist promise before the user has learned a single
tool.

## 12. Part numbers in the viewport

The cutlist diagram already labels parts. A toggle that shows matching labels on
the meshes makes the saw diagram map back onto the model.

## 13. Cut joints

Done: clicking a joint's marker in the viewport (or its line under Joints)
opens the joint editor — a close-up of just those parts, each in its own
colour, pulled apart or together — with one question: who keeps the wood
where they overlap? One part (the other is notched: dado, groove, rabbet),
half each (a half lap), or neither. Three parts meeting get a 3-way corner,
one part running through and keeping a quarter. A cut is stored on the panel that loses wood and points at the panel
doing the cutting, so it follows that panel as it moves (`lib/cuts.ts`,
`lib/joints.ts`). Panels stay boxes everywhere else: the cutlist still sees
the full rectangle. Still open:

- **Grooves in the DXF.** Export each cut as a pocket (its own layer, depth
  in the layer name) for a CNC.
- **Depth control.** A dado is as deep as the shelf is sunk; a stopped dado or
  a groove of its own depth needs a cut that isn't another panel's shape.

---

## Carried over from the refactor

CSV escaping is fixed, and `parse` now drops panels with unusable geometry and
falls back on bad settings. Still open:

- **Versioned migrations.** `version` / `VERSION` are written but never read.
  Shared links make old files a public API, so the next schema change should add
  a `migrations[v]` chain rather than more ad-hoc back-filling.

## Not doing

- **Cost estimate** (a price per stock sheet, totals per material). Not needed:
  the cutlist's sheet counts are what gets bought.

- **Arbitrary angles** (mitres, tapers, angled sides). This breaks the
  axis-aligned assumption in `bounds`, `snapping` and `nesting` simultaneously.
  The cost is the whole geometry layer; the benefit is a minority of designs.
- **Joint-driven auto-sizing.** Settled deliberately: the size you draw is the
  size you cut. A joint is cut into the parts (§13), never by resizing them:
  auto-shortening a shelf to account for a dado would make the cutlist stop
  matching the model.
