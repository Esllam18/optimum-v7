# Release Notes — Optimum 6.9.0

## Added
- First-class Site Cabinets.
- Auto-provisioned Cabinet workspace (6 standardized folders).
- Cabinet 360 and Site Delivery 360.
- Final Site Claim / Delivery Package.
- Default + custom claim requirements.
- Canonical Document references with exact-version Freeze.
- Claim progress: Required + Cabinet coverage + Overall.
- Add to Claim from Document card/details and during Upload.
- Auto Collect recognized claim documents from normal Site/Cabinet folders.
- Cabinet/Claim entity deep links.
- Fiber Delivery folder naming aligned with Work Orders, Contracts, Cabinets, Quantity Survey, As-Built and Handover.

## Hardened
- Resource-scoped server capabilities for Site/Cabinet/Document management.
- RLS wrapper fix for new Site Delivery tables.
- Archived Cabinet folder trees are read-only.
- Covering indexes for all new 6.9 foreign keys.

## Fixed during QA
- Restored five Document Control lifecycle actions accidentally lost during 6.9 Document 360 merge.
- Restored top Download and Description in Document 360.
- Document management buttons now use server resource capabilities with compatibility fallback.

## Verified
`npm test` PASS; contract audit 251 Actions / 57 Forms / 113 RPCs. All independent browser release gates PASS. Live rollback proofs confirm no duplicate file/version creation from Claim or Auto Collect.

## Known production gates
Next production build not proven due audit-environment package-registry 404. Supabase SECURITY DEFINER warnings and leaked-password protection require final production security work. Fresh DB replay requires staging/CI.
