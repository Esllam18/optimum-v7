# V7 Engineering Save Performance — Root Cause Note 01

## Finding
Engineering draft saves were slow because frame images were stored directly as Base64/data URLs inside `engineering_revisions.sheet_settings`.

The active draft measured approximately 8.38 MB in `sheet_settings`, while the engineering snapshot itself was only about 2.7 KB. The revision table occupied approximately 18 MB with only three visible revisions because the large settings document was stored through PostgreSQL TOAST.

## Why this hurts
The old save RPC updates the revision row on every save. When `sheet_settings` carries several megabytes of embedded image data, each edit can force PostgreSQL to process/rewrite a very large toasted value. This explains why tiny geometry changes could take hundreds of milliseconds or seconds despite the drawing JSON itself being small.

## Proof
Rollback-only tests were run against the live schema and current authenticated permission path. No data changes were committed.

Observed after replacing embedded logo bytes with compact asset references inside the transaction:
- one-time compaction: ~63 ms
- changed save calls after warm-up: ~3–4 ms
- repeated same payload through the current RPC: ~2–8 ms

The test therefore isolates the embedded frame-logo payload as the dominant cause of the previously observed save spikes.

## Implemented application fix
1. New frame logo uploads use the existing `engineering_assets` storage workflow.
2. Existing Base64 logos are converted to assets lazily before a draft save.
3. Server `sheet_settings` keeps only compact metadata/reference fields; `src`, `dataUrl`, and local runtime URLs are removed before RPC persistence.
4. When reopening a drawing, asset URLs are signed, fetched, and embedded at runtime for SVG/print reliability.
5. Autosave waits for a short idle period and enforces a minimum interval, reducing saves during continuous editing.
6. A separate no-op RPC fast-path migration is prepared locally but remains unapplied to production.

## Safety
- Existing 6.9 CAD behavior and regression tests remain green.
- Reference-image behavior remains green.
- Approved-revision restore behavior remains green.
- No production DDL or data rewrite was committed during this investigation.
