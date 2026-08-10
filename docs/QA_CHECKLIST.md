# Phase 4 Manual QA Checklist

## First drawing

1. Sign in as the company owner.
2. Open **CAD والهندسة**.
3. Create a drawing linked to an existing project and site.
4. Optionally select an existing PDF/image/document as the source file.
5. Confirm that an R0 draft opens in the editor.
6. Place a sub cabinet, two termination boxes, and a manhole.
7. Start one route, click several bends, and press Esc to finish it.
8. Drag one node and confirm its position changes.
9. Edit box number, distance, ODF, splitter, port, and core range.
10. Add a text annotation.
11. Confirm the BOQ changes without reloading the page.

## Takeoff accuracy

1. Set Grid to 20 and m/Grid to 1.
2. Draw a route exactly ten grid spaces long.
3. Confirm the calculated route quantity is 10 m.
4. Add another bend and verify the complete polyline length is used.
5. Add a manual route-length override and confirm it replaces the calculated value.
6. Select a cable inside a microduct route and verify both quantities appear.
7. Add a connector count and confirm the connector BOQ line changes.
8. Add a manual BOQ item.
9. Export CSV and Excel-compatible XLS and open both files.

## Reference tracing

1. Upload a PNG/JPG/WebP hand sketch as a reference.
2. Confirm it appears behind the vector drawing.
3. Change opacity.
4. Save, reload, and confirm the reference remains linked.
5. Upload a PDF reference and confirm it is stored in Drawing Management without being incorrectly rendered as an SVG image.

## Revisions and review

1. Save R0.
2. Add a review mark.
3. Resolve the mark.
4. Issue R0.
5. Create R1.
6. Change one node, remove one route, and add another route.
7. Compare R0 with R1.
8. Confirm additions are green, changes amber, and removals red/dashed.
9. Approve the intended revision.

## Export and Files Workspace

1. Export SVG and open it in a browser.
2. Export PNG.
3. Export A3 Print/PDF and verify the BOQ page.
4. Export DXF and open it in AutoCAD or another DXF viewer.
5. Verify route polylines, node outlines, labels, title information, and orientation.
6. Choose **Save a copy to Files Workspace**.
7. Save DXF to the engineering/CAD folder and BOQ CSV/XLS to the appropriate project folder.
8. Open Drawing Management and verify the generated documents appear under Linked Files.
9. Open a linked document and confirm its v1 file can be downloaded.
10. Unlink it and confirm the Files Workspace document is not deleted.

## Permissions — when more users are available

- Viewer: view/export/BOQ only.
- Supervisor: review/compare/export, no draft editing by default.
- Engineer: create/edit/compare/export/review/BOQ.
- Manager/Admin/Owner: publish and manage the catalog.
- Remove a permission with a member override and confirm both the UI action disappears and the RPC rejects a direct request.
- Verify a user from another company cannot see drawings, linked files, references, or exports.

## Expected limitations

- Native DWG is not generated; DXF is the AutoCAD-compatible output.
- Reference tracing is image-based.
- The editor creates engineering line diagrams, not a full general-purpose CAD suite.
