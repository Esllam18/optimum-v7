# V7 Feature Parity — Tranche 17

## Goal
Restore additional Optimum 6.9 operational depth inside the V7 experience without reverting to the legacy UI runtime.

## Restored in this tranche

### Work saved views
- Personal saved views are available directly from the V7 Work queue.
- Current search, status, due and resource-context filters can be saved and reapplied.
- A view can be made the user's default and removed again.
- The backend saved-view contract now explicitly supports `work.tasks` and `files.workspace`.

### Workload planning windows
- Capacity & Workload can move backward or forward in bounded 14-day windows.
- Decision metrics include planned members, over-capacity members and available capacity.
- The selected planning window is reflected in the route so it survives navigation/reload.

### CDE favorites and bulk lifecycle
- Users can favorite folders and documents under their own RLS-protected identity.
- Document rows support bounded multi-selection.
- Authorized users can send selected documents to review, approve, reject, or move them to trash.
- Bulk operations call canonical single-document lifecycle commands inside one transaction, preserving permission checks, notifications and document-control behavior.
- Bulk action size is capped at 100 documents.

### CAD parity
- Engineering component favorites are restored as a persistent personal browser preference.
- The palette can switch between all components and favorites.
- A current engineering revision can be compared with another revision using the V7-native snapshot diff core.
- Added / removed / changed geometry totals are visible without launching the legacy CAD runtime.

## Database
Production migration:
- `20260810221851_v7_feature_parity_saved_views_bulk_cde.sql`

Schema head after this tranche:
- `20260810221851`

## Release rule
This tranche is additive. It does not close total 6.9 parity and does not authorize final production go-live by itself.
