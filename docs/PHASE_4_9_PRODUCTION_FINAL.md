# Optimum Phase 4.9 — CAD Production Final

## UI and workflow
- Header tools centered and grouped.
- Removed the misleading static user chip from CAD mode.
- Navigation now opens drawing management, takeoff, or exits to drawings instead of unrelated duplicate screens.
- Frame standard button has a clear icon, label, tooltip, and dedicated workflow.
- Mini map is docked at the bottom-left and kept outside the printable sheet.
- Route-family cards are larger, centered, and easier to select.
- Element cards are larger and more readable.
- Responsive rules reduce collisions on medium and small screens.

## Saving
- Autosave remains the cloud/database save every five seconds.
- The main Save File button now opens the browser's native save-location picker for SVG, with normal download fallback.
- Ctrl+S saves a local SVG file; Ctrl+Shift+S forces the database save.
- Node and route inspectors include a sticky Save Changes button at the top.
- Frame settings are preserved after reloading drawing data and are immediately persisted to the revision snapshot.

## Routes
- Route labels remain independently draggable.
- Route data remains editable in the inspector.
- Route labels were enlarged for readability.
- Route cards and actions were enlarged and centered in the bottom dock.

## Attachments and references
- Signed URLs now open through a synchronously-created browser tab, preventing popup blocking after the async URL request.
- Signed URL lifetime increased for the viewer session.
- A fallback anchor is used when the popup is unavailable.

## Library and assemblies
- Existing complete catalog and family/variant architecture remains active.
- Favorites and saved assemblies remain stored locally in the browser.
- The assembly save action uses the current multi-selection, including routes whose endpoints are selected.

## Verification
- JavaScript syntax check passed.
- Application smoke test passed.
- Portable server returned HTTP 200 with no-store cache headers.
- Public and portable asset copies are identical.
