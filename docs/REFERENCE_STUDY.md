# Phase 4 Reference Study — Hand Sketches and Issued Drawings

## Material reviewed

The two uploaded RAR archives were extracted and reviewed locally. They contained:

- Seven hand-sketch PDF sets used by the office to define routes, branches, distances, cabinets, boxes, and quantities.
- Approximately eighty issued/working PDF drawings and related logs from the company workflow.
- A3 landscape line diagrams with title blocks, legends, revision tables, colored routes, box schedules, and engineering notes.

The source PDFs are not copied into the product package. Only the product decisions and catalog learned from them are recorded here.

## Recurring drawing language

The company drawings repeatedly use the following concepts:

- Sub cabinets and telecom cabinets.
- Termination boxes with capacities such as 4, 8, 24, 32, 36, 48, 60, 72, and 96 cores.
- ODF equipment, LGX racks, splitters, joints, TDM units, manholes, and handholes.
- Microduct bundles with 1, 2, 4, 7, 12, and 24 ways, commonly using 7/3.5 dimensions.
- Fiber cables with 4, 8, 12, 24, 36, 48, 72, 96, 144, and 288 cores.
- Route lengths, distance from sub cabinet, box number, ODF number, splitter/port, and core ranges.
- Connector counts, open/end bundle points, and suspended wire lengths.

These concepts became the initial global Engineering Catalog in the database.

## UX conclusions

A generic AutoCAD clone would make the workflow harder, not easier. The product therefore uses a domain-specific schematic editor:

1. Pick a known engineering symbol from the catalog.
2. Click the sheet to place it.
3. Pick a route or cable type and click orthogonal route points.
4. Fill only the engineering properties that matter to the office.
5. See the takeoff sheet update immediately.
6. Save a controlled revision and export a professional sheet.

A field sketch image can be added as a semi-transparent tracing reference. PDF references are stored securely, while in-sheet tracing is intentionally image-based.

## Output decisions

- **SVG** is the source-quality vector output for browser and print workflows.
- **PNG** is available for quick review and sharing.
- **A3 print/PDF** uses the browser print engine and includes the drawing and BOQ.
- **DXF R12 ASCII** is the AutoCAD-compatible exchange output. It preserves 2D routes, node outlines, labels, and text.
- **CSV and Excel-compatible XLS** are the takeoff outputs.

Native DWG generation is not claimed. Reliable DWG authoring requires a dedicated licensed CAD engine; DXF is the controlled interchange format for this phase.

## Deliberately deferred

The following are future engineering extensions, not hidden incomplete features:

- Native DWG read/write.
- GIS coordinates and map basemaps.
- Optical loss calculations and splice/core allocation engine.
- Automatic recognition of handwritten sketches from images.
- Full AutoCAD block/layer fidelity.
- Electrical and mechanical discipline-specific calculators.
