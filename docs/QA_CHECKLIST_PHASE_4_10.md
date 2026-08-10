# QA Checklist — Phase 4.10 CAD Core Fixes

Use a copy of a real drawing and complete the following checks before continuing to the next phase.

## Route label editing

- [ ] Click a route label without moving it; the route-label editor opens.
- [ ] Replace the visible text with a custom sentence and save.
- [ ] Confirm the exact sentence appears on the drawing.
- [ ] Drag the label to a different location without moving the route.
- [ ] Refresh the page and confirm the text and position remain.
- [ ] Change font size and toggle technical details/background.
- [ ] Confirm the label stays above nearby elements and is not clipped.

## Element captions

- [ ] Confirm every node has a small/light name or type caption.
- [ ] Move a node and confirm its caption follows it.
- [ ] Export SVG and confirm the captions are present.

## Refresh and close controls

- [ ] Open a drawing and refresh the browser.
- [ ] Confirm the same drawing and revision reopen.
- [ ] Click the X beside the element library.
- [ ] Confirm only the library hides and the drawing remains open.
- [ ] Use the toolbar button to reopen the library.
- [ ] Use the real exit control and confirm it returns to the drawings list.

## Assemblies

- [ ] Select one node and save it as an assembly.
- [ ] Confirm it appears immediately in the Assemblies tab.
- [ ] Select several connected nodes and save another assembly.
- [ ] Confirm connecting routes are included.
- [ ] Refresh and confirm both assemblies still appear.
- [ ] Insert an assembly and confirm nodes, routes and annotations are restored.

## Export

- [ ] Export SVG and open it in Chrome/Edge.
- [ ] Confirm the drawing area is not covered by the title block.
- [ ] Confirm route labels are readable and keep their moved positions.
- [ ] Export DXF and open it in the company AutoCAD installation.
- [ ] Run `ZOOM` → `Extents` if the workstation opens at a different viewport.
- [ ] Confirm layers, route polylines, node geometry, labels and external title block appear.
- [ ] Save the opened DXF as DWG from AutoCAD and reopen the DWG.
- [ ] Check Arabic font appearance on the target workstation; install/use the approved company font if required.

## Regression

- [ ] Add a node and a route.
- [ ] Edit node properties.
- [ ] Save manually.
- [ ] Wait for autosave.
- [ ] Undo and redo.
- [ ] Select and move multiple objects.
- [ ] Confirm no browser console errors are produced.
