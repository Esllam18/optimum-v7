# Phase 4.16 — Final Drawing Adjustments

This release applies the final requested drawing-interface corrections without changing fixed element data or the Phase 4.15 route geometry fix.

## Delivered changes

1. **Classic route library restored**
   - The bottom route and cable library uses the earlier compact cards again.
   - Route family selection, drag-to-draw, draw button, hide button and dock resizing remain available.

2. **Element catalog name restored on the drawing**
   - The element's catalog/type name appears below the symbol in a small, light style.
   - It is only shown when it differs from the element's main label, avoiding duplicate text.
   - The same caption is included in both R12 and R2000 DXF exports.

3. **Full route-data text editor restored**
   - Custom multiline text.
   - Font size.
   - Start, center and end alignment.
   - Line spacing.
   - Rotation.
   - Horizontal and vertical flip.
   - Bold toggle.
   - White-background toggle.
   - Technical route-data visibility toggle.

4. **Independent route-data placement**
   - Route data remains separate from the route polyline.
   - It can be dragged to any suitable position on the drawing.
   - Double-clicking the label reopens its editor.
   - Screen, print SVG, R12 DXF and R2000 DXF preserve its placement and transforms.

## Preserved behavior

- Element data remains fixed inside the element symbol.
- Element-data drag, rotation and flip remain disabled.
- Route lines still stop at the true node-box boundary.
- Compact element-library display from Phase 4.15 remains unchanged.
