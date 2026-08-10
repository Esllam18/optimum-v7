# Optimum — Phase 2 Hardening Report

**Release:** 2.1.0  
**Scope:** Platform Control + Files Workspace reliability, UX, and recovery  
**Supabase project:** `wzcaquxuvqfbstpxujsj`

## 1. Why this pass was required

The first Phase 2 build proved the product direction, but real browser use exposed failures that database-only checks could not catch: stale JavaScript bundles, missing client methods, incomplete Storage uploads, unclear invitation onboarding, file actions without a usable open/download path, and ambiguous folder-trash restoration.

Phase 3 was intentionally paused. This release closes those gaps before adding Work Management.

## 2. Invitation and account activation

- Added a public, token-scoped `invitation_preview` RPC.
- An invitation link now opens a dedicated activation experience instead of a generic login screen.
- The page displays the company, invited role, and invited email.
- New users can create an account; existing users can sign in from the same screen.
- The invited email is prefilled and protected from accidental mismatch.
- After authentication, the invitation is accepted automatically.
- Invalid, expired, or already-used links show a clear state.
- The invitation token survives email confirmation through the redirect URL and local browser storage.

The request for authentication is intentional: the system must attach the invitation to a verified identity. The UX now explains that requirement instead of appearing broken.

## 3. File upload reliability

- Replaced the broken upload call with an `XMLHttpRequest` Storage upload implementation.
- Added per-file progress, finalization, success, and retry states.
- A file is not considered ready until the Storage object exists and `finalize_document_upload` succeeds.
- Failed metadata reservations are aborted automatically.
- If the object reached Storage but finalization failed, the browser removes the object through the Storage API before aborting the reservation.
- Added `cleanup_stale_uploads` for abandoned reservations that never created an object.
- Removed the incomplete records produced by the previous build; current database state has no stuck `uploading` versions.
- Multi-file uploads preserve failed rows for retry instead of restarting successful files.

## 4. File opening and downloading

- Added signed private URLs for ready versions.
- Added a direct **Open** action for previewable browser formats.
- Added a direct **Download** action for the current version and every historical ready version.
- Added a blob-download path with a signed-URL fallback.
- A preview tab is opened synchronously to avoid browser popup blocking while the signed URL is generated.
- Uploading or failed versions do not expose misleading open/download controls.

## 5. Trash and restoration semantics

Two independent concepts are now persisted:

- `trash_origin = direct`: the user explicitly deleted the item.
- `trash_origin = ancestor`: the item disappeared only because a parent folder was deleted.

A `trash_root_folder_id` also identifies the root deletion operation.

Result:

- Deleting a file directly keeps it in Trash independently.
- Deleting its parent folder later does not overwrite the file's original deletion identity.
- Restoring the folder restores only items that disappeared because of that folder deletion.
- A file deleted directly before the folder remains in Trash.
- Nested inherited items are hidden from the top-level Trash list to prevent duplicate or incorrect restoration.
- System folders remain protected.

## 6. Client-runtime fixes

Resolved the reported runtime failures:

- `api.delete is not a function`
- `api.uploadObject is not a function`

Changes include:

- Introduced the explicit `api.remove` table method while keeping a compatibility alias.
- Added `uploadObject`, `downloadObject`, `createSignedUrl`, and the corrected Storage `deleteObject` contract.
- Added session refresh before long Storage operations.
- Versioned browser module imports with `v=2.1.0`.
- Portable server responses now use `Cache-Control: no-store` to prevent an older JavaScript bundle from surviving between releases.
- Technical errors are mapped to clear Arabic and English messages.

## 7. UI and UX refinement

- Stronger visual hierarchy and cleaner workspace density.
- More polished cards, dialogs, drawers, toolbar, sidebar, and toast feedback.
- Improved selected, hover, focus, and destructive-action states.
- Clearer upload review with progress bars and retry feedback.
- Better file-card actions and version-history controls.
- Clearer Trash explanations and direct/inherited behavior.
- Dedicated invitation summary, account-mode tabs, and invalid-link state.
- Independent premium light and dark surfaces retained.
- Mobile layouts and touch targets improved.

## 8. Database changes applied

The hardening migration is already applied remotely:

- `20260803230705_phase2_hardening_invites_uploads_trash`

The remote migration ledger also contains the preceding hardening preparation migration:

- `20260803223342_phase2_hardening_trash_uploads_invites`

Current verified database summary:

- 22 public application tables.
- RLS enabled on all 22 tables.
- Zero anonymous grants on public tables.
- Zero stuck uploading versions after cleanup.
- Private `company-files` Storage bucket retained.

Do not run the SQL files again on the connected Optimum project.

## 9. Automated checks completed

- JavaScript syntax checks passed for the application module, API client, and portable server; the Next.js wrapper files are included in the synchronized source smoke checks.
- Portable and Next.js copies of application/API/CSS are byte-for-byte synchronized.
- Source smoke suite passed.
- Portable HTTP server test passed.
- Security headers and `no-store` asset delivery were verified.
- Client contracts for invitations, Storage upload/download/delete, stale cleanup, progress UI, preview actions, and trash-origin behavior are covered by the smoke suite.
- Database schema/state checks passed after the remote migration.

A real browser acceptance checklist is included in `docs/QA_CHECKLIST.md`. Browser interaction with a user's local file picker and authenticated Storage session cannot be fully automated from this packaging environment, so the listed five-minute acceptance run should be completed after extracting the release.

## 10. Release decision

Phase 2 is not treated as complete merely because tables and RPCs exist. The acceptance boundary is now:

1. invitation onboarding works from a separate browser;
2. a real file reaches private Storage and becomes `ready`;
3. the current and historical versions open/download;
4. failed uploads leave no fake file records;
5. direct and inherited trash restoration behave independently;
6. the interface communicates every state clearly.

Phase 3 should begin only after this hardened release passes the manual acceptance run on the user's machine.
