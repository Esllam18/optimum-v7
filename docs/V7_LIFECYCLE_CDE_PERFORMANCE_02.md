# V7 Lifecycle, CDE & Context Performance — Checkpoint 04

## Scope completed

This checkpoint closes native V7 lifecycle and immutable document-version flows without routing the user back to the 6.9 UI.

### Project / Site / Cabinet lifecycle
- Native edit for Project, Site and Cabinet using the existing secured RPC contracts.
- Native archive and reactivate for all three entity levels.
- Project/Site archive opens an impact review before the force-archive command is issued.
- Archive remains a read-only lifecycle state; it does not delete files, work, drawings or history.
- Cabinet rename continues through `save_site_cabinet`, preserving the existing rule that the canonical CDE root folder follows the cabinet code/name.

### Document 360
- New Version now uses the existing immutable upload lifecycle:
  1. `begin_new_version_upload`
  2. private Storage upload
  3. `finalize_document_upload`
  4. object cleanup + `abort_document_upload` on failure
- Current and historical versions can be downloaded through a short-lived signed URL.
- Storage bucket/path are fetched on demand through RLS-protected `document_versions`, rather than being exposed in `document_360`.
- Document 360 can create work while preserving project/site/folder/document context.

### CDE paging
The V7 Files page no longer asks `file_workspace_snapshot` to return folder documents.

- Workspace snapshot: project/site identity + folder tree only (`p_folder_id = null`).
- Normal folder rows: direct RLS-protected PostgREST query, 50 rows/page.
- Search: existing server-side `document_search_v2`, 50 rows/page.
- Folder change no longer reloads the entire workspace snapshot just to retrieve a document list.

## Rollback-only live validation

Authenticated tests were executed against the live Optimum schema inside transactions and rolled back.

Validated successfully:
- project edit
- site edit
- cabinet edit
- cabinet archive → reactivate
- site archive → reactivate
- project archive → reactivate
- new document-version reservation → abort

After rollback verification:
- project: `active`, original description restored
- site: `active`, original description restored
- cabinet: `active`, original description restored
- tested document remained at exactly 2 persisted versions

No smoke-test rows were left in production.

## Performance observations

### CDE
Current authenticated timings on the small live tenant:
- `file_workspace_snapshot` folder tree: warm calls ~3–4 ms (first profiled call ~26 ms)
- folder snapshot with current documents: warm calls ~3–7 ms
- new V7 paged document query: average ~5.6 ms, min ~1.4 ms, max ~21.4 ms

The important V7 improvement is bounded payload size at enterprise scale, not only today's small-dataset latency.

### Work context
Before applying the prepared V7 Work migration, live `work_task_query` measurements were approximately:
- company-wide: ~196 ms average
- project-scoped: ~55 ms average
- site-scoped: ~54 ms average

A live-contract defect was found: the current production RPC ignores `site_id`, `folder_id` and `document_id` filters even though the V7 client sends them. A document-scoped query therefore returned all 4 visible company tasks.

The prepared migration `20260809225541_v7_work_read_performance.sql` was corrected and rollback-tested. It now:
- enforces project/site/folder/document filters;
- materializes the visible filtered set once for page/count paths;
- preserves `can_edit`, `can_complete` and `can_claim` fields from the existing 6.9 contract;
- carries `site_name` in the read model.

Rollback proof for document `340036d2-ef6c-48ea-a3ee-792119f08768`:
- total returned: 1
- task returned: #38
- `can_edit`: present
- `can_complete`: present
- `can_claim`: present

The migration remains unapplied to production at this checkpoint.

## UX/performance refinement

When Work is opened with Project/Site/Folder/Document context, V7 now skips the company-wide `work_dashboard_metrics` RPC. Showing organization-wide totals beside a scoped task list was both an unnecessary request and a misleading UX. The scoped page instead shows the number of tasks in the active context.

## Validation

- V7 JSX/JS parse pass: `tsc --allowJs --jsx preserve --noEmit --noResolve` across all V7 source.
- V7 static contracts: PASS.
- Full 6.9 + V7 release regression: PASS.
- Next production build remains blocked by the incomplete dependency installation in the execution environment; no successful Next build is claimed.
