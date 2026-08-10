# Optimum Phase 4.5 — Engineering Standard 1.0

This release establishes one stable CAD standard for Optimum instead of changing the drawing language between revisions.

## Workspace

- The drawing board keeps its full 1600 × 1000 engineering area.
- The title/legend panel is external and flush to the board on the right.
- Web UI scale, board zoom, sheet size and drawing-content scale are independent.
- The guidance/status message is outside the printable board.
- Ctrl/Shift selection, marquee selection, group move, align, distribute and scale selection are supported.

## Catalog standard

- Nodes are presented as families with a variant selector.
- Routes are presented as families with diameter/ways/cable variants.
- The saved object still records the exact catalog code and all engineering properties.

## Frame standard

The external panel contains:

- Dynamic legend of used items only.
- Project, site, drawing, discipline, revision, status, scale and date.
- Contract, client, consultant, main contractor and subcontractor.
- Cabinet number/type/U size/buildings/ports/ODF/LGX/splitters/base.
- Drawn, checked and approved register.
- Up to four controlled logos/images.

## Engineering data

Node tags include ODF, ODF port, splitter, splitter port, core range, distance and box number. Route data includes from/to, ways, diameter, cable, cores, cable count, spare length and actual length.

## Export

SVG/PNG include the full drawing plus the adjacent external title panel. DXF uses the full drawing width and creates an adjacent title panel rather than reducing the network drawing area.
