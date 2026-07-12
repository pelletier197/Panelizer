# Contributing to Panelizer

This is the developer guide — how the project is built and how to work on it. For what Panelizer does and who it's for, see the [README](README.md).

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev      # dev server on http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build locally
npm run lint     # oxlint
```

Deploy by publishing the `dist/` folder to any static host (GitHub Pages, Netlify, S3, …).

## How it works

The design is a plain list of **panels** held in one store. Everything else — the 3D scene and the cutlist — is a *derived view* of that list, never a second source of truth. Get the data model right and the rest follows.

A `Panel` is a rectangular piece described by a face (`length` × `width`) and a `thickness` running along its `normal` axis. Thickness is the one dimension you cannot change by dragging in the viewport; it is edited in the properties panel and follows the chosen material. All measurements are stored in millimetres; the scene is rendered in metres (see `MM_TO_M`).

A second invariant, enforced everywhere: **the size you set is the size you cut** — panels are never auto-resized by any tool.

### Units

Storage is always millimetres — units are only about entry and display (`lib/units.ts`). A design has one default unit (mm / cm / inch, saved in the file), used for bare numbers and as the starting display unit. Any field accepts an explicit unit though — `24.5 in`, `3/4"`, `23 3/4`, `2.5cm`, `5 ft` — and remembers it, so you can have thickness in mm next to a width in inches. Inches display as shop-friendly fractions to the nearest 1/16".

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
```


Under the hood:

- **Zustand** for state management
- **React Three Fiber** for 3D rendering
- **MaxRects** nesting algorithm
- Undo / redo
- JSON persistence
- Unit-aware value parser
- Derived cutlist engine

### Ideas for later

- **Rotation.** Add a real rotation to `Panel` (beyond the discrete
  thickness-axis) plus a rotate gizmo, with **snapping like move and resize**
  (snap to common angles / neighbour orientations). Cut dimensions are
  unaffected.
- **Bundle code-splitting.** The build is a single ~1.18 MB chunk (mostly
  Three.js). Fine for now; lazy-load / split if first-load matters.
  - **Shortcuts** add shortcuts to activate all tools
