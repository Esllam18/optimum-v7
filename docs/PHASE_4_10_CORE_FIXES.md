# Optimum Phase 4.10 — CAD Core Fixes

## Scope

This release closes the six defects reported after Phase 4.9 without redesigning the approved CAD workspace.

## 1. Editable and movable route labels

- Route labels are rendered above routes and nodes so they do not disappear behind elements.
- Every route label has independent X/Y offsets and can be dragged without moving the route.
- Clicking a route label without dragging opens a focused text editor.
- The engineer can type the exact visible wording, select the font size, show or hide technical route data, and enable or disable the label background.
- Saving the editor writes the value to the active revision and marks the drawing as changed for autosave.
- The same position and text are used in the editor, SVG export, and DXF export.

## 2. Element names on the drawing

- Every node now has a small, lightweight type/name caption outside the engineering symbol.
- The caption is separate from the detailed values inside the symbol.
- The caption is included in SVG and DXF exports.

## 3. Correct export geometry

- The drawing area is exported at its full configured width.
- The title block is exported as a separate panel to the right instead of reducing or covering the drawing area.
- The exported SVG includes an XML declaration and a complete viewBox that contains the drawing and the external title block.
- Routes render first, then nodes, then route labels, so labels remain readable.

## 4. DXF rebuilt for CAD interoperability

The DXF writer was rebuilt as DXF R2000 (`AC1015`) and now includes:

- HEADER, TABLES, BLOCKS and ENTITIES sections.
- LTYPE, LAYER, STYLE and BLOCK_RECORD tables.
- `AcDbEntity`, `AcDbPolyline`, `AcDbLine` and `AcDbText` subclasses.
- Editable route polylines, node geometry, title-frame geometry, route labels and node captions.
- Final `EOF` marker and code/value pair validation.

The generated DXF was independently opened by LibreOffice Draw and converted to PDF successfully. This validates that the file is structurally openable by an external CAD/vector importer. AutoCAD itself is not installed in the build environment, so the report does not claim a direct AutoCAD launch test. Arabic text appearance can still depend on the fonts and RTL handling installed in the target AutoCAD workstation.

## 5. Refresh and library-close behavior

- The active drawing and revision are saved in company-scoped local storage.
- Refresh restores the same drawing instead of returning to the drawings list.
- The X beside the element library now hides only the library.
- A toolbar button appears to reopen the library when it is hidden.
- The actual exit command remains separate and clears the stored active drawing only when the engineer intentionally exits.

## 6. Assemblies fixed

- Saving an assembly opens a real naming dialog instead of using an unreliable browser prompt.
- A single selected object is allowed; multiple selected nodes, routes and annotations are also supported.
- Routes connecting selected nodes are included automatically.
- Assemblies are written to application state and local storage before the success message is shown.
- The interface switches to the Assemblies tab so the newly saved assembly is visible immediately.
- Reinserting an assembly now restores nodes, routes and annotations with new identifiers and an offset from the original location.

## Verification completed

- JavaScript syntax check passed.
- Existing application smoke test passed.
- Phase 4.10 core-fix test passed.
- Active-drawing refresh restore test passed.
- Exact route-label save and offset test passed.
- Assembly save, persistence and reappearance test passed.
- SVG panel/order/caption assertions passed.
- DXF section, code/value and entity-subclass assertions passed.
- Portable server returned HTTP 200 for the app and engineering asset.
- SVG export rendered to PNG using Inkscape.
- DXF opened in LibreOffice Draw and converted to PDF.

## Database

No new Supabase migration is required for this release. The added route-label settings and assemblies are stored inside the existing revision snapshot and local workspace state.
