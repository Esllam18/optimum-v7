# V7 Native CDE & Claim Control — Checkpoint 05

## Scope closed

This checkpoint extends Document 360 and Delivery 360 from read/navigation surfaces into native operational controls using the existing secured Optimum RPC contracts.

### Document 360 controls
- Rename → `rename_document`
- Move inside the same Project/Site CDE scope → `move_document`
- Review/control lifecycle → `set_document_control_status`
- Trash → `trash_document`
- Restore from scoped CDE Trash → `restore_document`
- New immutable version and secure version downloads remain native from the previous checkpoint.

The status editor matches the backend contract exactly:
- `working`
- `in_review`
- `approved`
- `rejected`
- `superseded`

Approval continues to record actor/time in the backend contract; no version is overwritten by a control-status change.

### CDE Trash
- Reads the existing resource-scoped `trash_query` read model.
- Shows direct trashed documents in the active Project/Site context.
- Restore is shown only when the V7 workspace permission set includes `files.restore`.
- Ancestor-deleted descendants remain hidden and are explained as requiring parent-folder restore.

### Claim evidence
Document 360 can now add a site document to an open claim requirement through:
- `add_document_to_site_claim`

It adds a canonical document reference only; it does not duplicate the binary.

Unlocked evidence can be removed through:
- `remove_site_claim_item`

Pinned/frozen evidence does not expose the remove action in V7.

### Claim package lifecycle
Delivery 360 now supports the backend lifecycle when `can_manage` is true:
- Collecting/open → `freeze_site_claim_package`
- Ready/frozen → `reopen_site_claim_package`
- Ready/frozen → `submit_site_claim_package`

The UI deliberately relies on backend completeness checks rather than duplicating them client-side.

## Rollback-only live Supabase smoke

Authenticated against the live Optimum schema inside one transaction and rolled back:

1. Rename an existing canonical document.
2. Change control status to `in_review` with review due date.
3. Move the document to another valid Project CDE folder.
4. Move it back to its original folder.
5. Trash the document.
6. Restore the same canonical document.
7. Reserve a temporary Site document upload using `begin_document_upload`.
8. Add the temporary site document to the open final package as `photos` evidence.
9. Remove the evidence item.
10. Abort the temporary upload reservation so the temporary document is cleaned up.
11. Attempt to freeze the currently incomplete package.

Observed results:
- rename succeeded;
- status became `in_review`;
- move succeeded;
- trash state became `trashed`;
- restore returned state to `active`;
- claim evidence add succeeded;
- claim evidence remove succeeded;
- temporary upload/document cleanup succeeded;
- freeze was correctly rejected because 6 required requirements remain missing.

Post-rollback verification confirmed:
- original document name restored;
- original folder restored;
- document state remains `active`;
- original document control status remains `approved`;
- no temporary claim-evidence document persisted;
- no temporary claim item persisted.

## UX improvements

- Added actual SVG glyphs for upload/download/edit/move/trash/archive instead of allowing those action names to fall back to the generic grid icon.
- Document-control actions are permission/capability driven from `document_360`.
- Claim evidence explains the canonical-reference/freeze model in the action surface itself.
- Trash is scoped to the current Project/Site rather than mixing unrelated tenant records.

## Validation

- V7 JS/JSX parser/no-emit pass: PASS.
- New static contract `v7-cde-claim-control-7.0.mjs`: PASS.
- Full `npm run test:release` (Optimum 6.9 + V7): PASS.
- No V7 production DDL applied in this checkpoint.
- Next production build remains unverified because the execution environment still has an incomplete Next/React dependency installation.
