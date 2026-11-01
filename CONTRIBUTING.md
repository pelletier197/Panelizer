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

Storage is always millimetres — units are only about entry and display (`lib/units.ts`). A design works in one unit (mm / cm / inch, saved in the file): bare numbers are read in it and every field displays in it. A field accepts an explicit unit from the same system (`2.5cm` in a mm design) and simple arithmetic (`30+15+2-3`, `23 3/4 + 1/2`), but refuses the other system, so a value never silently becomes a lossy fraction. Sizes snap to the unit's grid — 1 mm, or the design's inch precision (1/16" by default) — and switching between metric and inches converts every part onto the new grid (`lib/repair.ts`).

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
  store/
    designStore.ts        The one store, built from the slices below; autosave
    history.ts            Undo / redo, and commit(): the way every edit lands
    panelsSlice.ts        Add, change, remove, copy and paste panels
    selectionSlice.ts     Selection and what the viewport lights up
    toolsSlice.ts         Viewport tools, gesture readout, open views
    documentSlice.ts      Materials, stock, units, cutlist settings, name
    projectsSlice.ts      Open, new, replace and delete saved projects
```


Under the hood:

- **Zustand** for state management
- **React Three Fiber** for 3D rendering
- **MaxRects** nesting algorithm
- Undo / redo
- JSON persistence
- Unit-aware value parser
- Derived cutlist engine
