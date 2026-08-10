# QA Checklist — Phase 4.7 Visual Master

## Visual
- [x] Two-level header rendered at 1648×927.
- [x] Left library, center board, right inspector, and bottom dock remain in one stable grid.
- [x] Entire A3 landscape sheet and title block fit in the canvas viewport.
- [x] Mini Map is docked at the bottom of the right inspector.
- [x] Route labels render without clipping or overflowing a fixed rectangle.
- [x] Library symbols are family-specific, not identical generic cards.

## Interaction
- [x] Select and multi-select contracts are present.
- [x] Copy, cut, and paste toolbar actions and Ctrl+C/X/V shortcuts are present.
- [x] Copy/Paste test duplicates two selected nodes and keeps a new selection.
- [x] Board zoom is separate from browser/UI scale.
- [x] Center, Fit, 100%, and Mini Map controls are distinct.

## Engineering
- [x] Node and route properties remain in the snapshot and takeoff.
- [x] DXF R2000 export remains available.
- [x] Title block and Legend remain in SVG/DXF/print output.
- [x] No database migration is required.

## Automated
- [x] JavaScript syntax check.
- [x] Smoke tests.
- [x] Portable server HTTP test.
- [x] Chromium render with zero console/page errors.
- [x] Public/assets, assets, and app CSS copies match.
