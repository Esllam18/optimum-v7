-- Phase 5.5.2 — Workspace loading contract reliability
revoke all on function app_private.user_has_resource_permission(uuid,uuid,text,uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function app_private.resource_permission_for_row(uuid,text,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function app_private.resource_permission_for_row(uuid,text,uuid,uuid,uuid,uuid) to authenticated, service_role;
drop policy if exists engineering_boq_select on public.engineering_revision_boq;
create policy engineering_boq_select on public.engineering_revision_boq for select to authenticated using (
  exists (select 1 from public.engineering_revisions r join public.engineering_drawings d on d.id=r.drawing_id
    where r.id=engineering_revision_boq.revision_id and app_private.resource_permission_for_row(d.company_id,'boq.view',d.project_id,d.site_id,d.folder_id,d.id))
);
