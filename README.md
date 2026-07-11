# Wood3D

A browser-based 3D designer for plywood cabinets. Sketch rectangular carcasses
from panels, resize them freely (thickness stays locked), and generate a cutlist
— all client-side, no backend. Designs export to a `.json` file and re-import,
so the whole thing can be hosted as a static site.

## Getting started

```bash
npm install
npm run dev      # dev server on http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build locally
```

Deploy by publishing the `dist/` folder to any static host (GitHub Pages,
Netlify, S3, …).

## How it works

The design is a plain list of **panels** held in one store. Everything else —
the 3D scene and the cutlist — is a *derived view* of that list, never a second
source of truth. Get the data model right and the rest follows.

A `Panel` is a rectangular piece described by a face (`length` × `width`) and a
`thickness` running along its `normal` axis. Thickness is the one dimension you
cannot change by dragging in the viewport; it is edited in the properties panel
and follows the chosen material. All measurements are stored in millimetres; the
scene is rendered in metres (see `MM_TO_M`).

### Units

Storage is always millimetres — units are only about entry and display
(`lib/units.ts`). A design has one default unit (mm / cm / inch, saved in the
file), used for bare numbers and as the starting display unit. Any field accepts
an explicit unit though — `24.5 in`, `3/4"`, `23 3/4`, `2.5cm`, `5 ft` — and
remembers it, so you can have thickness in mm next to a width in inches.
Inches display as shop-friendly fractions to the nearest 1/16".

### Project layout

```
src/
  types/panel.ts          Panel domain type
  lib/
    materials.ts          Sheet-good materials (name, thickness, colour)
    geometry.ts           mm to m scale + panel <-> world-axis mapping
    panel.ts              createPanel() factory with defaults
    units.ts              Parse / format lengths (mm / cm / inch fractions)
    corners.ts            The 8 corner points of a panel; distance helper
    snapping.ts           Magnetic move-snap + resize-face edge snap
    overlaps.ts           Where two panels interpenetrate (joint markers)
    resize.ts             Single-face resize math (opposite face fixed)
    cutlist.ts            Derive & group the cutlist; CSV export
    persistence.ts        Serialize / parse / download / autosave
  store/designStore.ts    Zustand store — single source of truth + undo/redo
  components/
    viewport/             R3F canvas, scene, per-panel mesh, move/resize gizmos,
                          corner-tool overlay, overlap highlights
    panels/               Toolbar, properties editor, cutlist table
    layout/               Resizable sidebar, tool hint banner
    ui/                    Reusable form controls (unit-aware input, menu)
```

## Status

Core loop and the assembly-aware tools are shipped, all under the rule that
**the size you set is the size you cut** — panels are never auto-resized.

### Ideas for later

- **Stock nesting → cut diagram (the main goal).** Given the project's parts
  and the stock sheets available (sheet size, quantity, maybe grain/kerf), pack
  the parts onto sheets and produce an actual **cutlist** — a diagram showing
  how to lay out and cut each sheet, with offcuts. This is the core deliverable
  of the project; everything else feeds it.
- **Rename "Cutlist" panel → "Parts".** Today's Cutlist panel really lists the
  project's components. Rename it **Parts** so the word "Cutlist" is free for
  the stock-nesting diagram above. Standard woodworking/CAD term (part list /
  BOM).
- **Rotation.** Add a real rotation to `Panel` (beyond the discrete
  thickness-axis) plus a rotate gizmo, with **snapping like move and resize**
  (snap to common angles / neighbour orientations). Cut dimensions are
  unaffected.
- **Slim down the Materials panel.** It takes up too much space and pulls
  attention. Put a material's name and colour on a **single row**, with the
  colour as a small **dropdown/swatch picker** rather than an inline palette.
- **Bundle code-splitting.** The build is a single ~1.18 MB chunk (mostly
  Three.js). Fine for now; lazy-load / split if first-load matters.
