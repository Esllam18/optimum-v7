# Phase 4.5.1 — Real Engineering Standard Fix

This correction removes the title panel from the drawing zoom in the live editor, keeps the 1600×1000 drawing board intact, and presents the identity/title panel as a fixed independent panel next to the board. Exports continue to include the official title block.

## Corrected
- Drawing board zoom no longer includes the title panel.
- Full drawing area remains available.
- Fixed live title panel outside the board.
- Compact independent data tags instead of oversized red tables.
- Pointer coordinates, group dragging, and multi-selection use drawing coordinates only.
- Fit Sheet reserves the live panel width but scales the board independently.
- Web UI size remains fixed while canvas zoom changes.
