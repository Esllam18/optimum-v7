-- Optimum 6.9.0 — Site Delivery read models, blueprint reconciliation & grants

begin;

-- ---------------------------------------------------------------------------
-- Rich read models: Site 360 + Document 360 + Project 360 + deep links.
-- ---------------------------------------------------------------------------
create or replace function public.site_360(p_site_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$
declare s public.sites%rowtype;p public.projects%rowtype;v_package uuid;v_claim jsonb;
begin
  select * into s from public.sites where id=p_site_id;if not found then raise exception 'Site not found';end if;select * into p from public.projects where id=s.project_id;
  if not app_private.user_has_resource_permission(auth.uid(),s.company_id,'projects.view',s.project_id,s.id,null,null) then raise exception 'Permission denied';end if;
  select id into v_package from public.site_claim_packages where site_id=s.id and claim_type='final' and status<>'archived' order by created_at limit 1;
  if v_package is not null and app_private.user_has_resource_permission(auth.uid(),s.company_id,'files.view',s.project_id,s.id,null,null) then v_claim:=public.site_claim_package_360(v_package);end if;
  return jsonb_build_object('site',to_jsonb(s),'project',jsonb_build_object('id',p.id,'code',p.code,'name',p.name),'manager_name',(select full_name from public.profiles where id=s.manager_user_id),
    'stats',jsonb_build_object(
      'folders',(select count(*) from public.folders f where f.site_id=s.id and f.trashed_at is null and app_private.user_has_resource_permission(auth.uid(),s.company_id,'files.view',s.project_id,s.id,f.id,null)),
      'documents',(select count(*) from public.documents d where d.site_id=s.id and d.state='active' and app_private.user_has_resource_permission(auth.uid(),s.company_id,'files.view',s.project_id,s.id,d.folder_id,null)),
      'storage_bytes',(select coalesce(sum(v.size_bytes),0) from public.document_versions v join public.documents d on d.id=v.document_id where d.site_id=s.id and v.upload_state='ready' and app_private.user_has_resource_permission(auth.uid(),s.company_id,'files.view',s.project_id,s.id,d.folder_id,null)),
      'open_tasks',(select count(*) from public.tasks t where t.site_id=s.id and t.status not in ('done','cancelled') and app_private.can_view_task(t.id)),
      'overdue_tasks',(select count(*) from public.tasks t where t.site_id=s.id and t.status not in ('done','cancelled') and t.due_at<now() and app_private.can_view_task(t.id)),
      'drawings',(select count(*) from public.engineering_drawings d where d.site_id=s.id and d.archived_at is null and app_private.can_view_engineering_drawing(d.id)),
      'cabinets',(select count(*) from public.site_cabinets c where c.site_id=s.id and c.archived_at is null)
    ),
    'cabinets',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'name',c.name,'cabinet_type',c.cabinet_type,'status',c.status,'description',c.description,'location_label',c.location_label,'root_folder_id',c.root_folder_id,'archived_at',c.archived_at,'claim_items',(select count(*) from public.site_claim_items i where i.cabinet_id=c.id)) order by c.archived_at nulls first,c.code) from public.site_cabinets c where c.site_id=s.id),'[]'::jsonb),
    'claim_package',coalesce(v_claim,'null'::jsonb),
    'can_create_cabinet',app_private.user_has_resource_permission(auth.uid(),s.company_id,'projects.edit',s.project_id,s.id,null,null) and app_private.user_has_resource_permission(auth.uid(),s.company_id,'files.create_folder',s.project_id,s.id,null,null),
    'can_manage_cabinets',app_private.user_has_resource_permission(auth.uid(),s.company_id,'projects.edit',s.project_id,s.id,null,null),
    'can_manage_claim',app_private.user_has_resource_permission(auth.uid(),s.company_id,'files.manage',s.project_id,s.id,null,null),
    'can_edit_site',app_private.user_has_resource_permission(auth.uid(),s.company_id,'projects.edit',s.project_id,s.id,null,null),
    'can_archive_site',app_private.user_has_resource_permission(auth.uid(),s.company_id,'projects.archive',s.project_id,s.id,null,null)
  );
end $$;

create or replace function public.document_360(p_document_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$
declare d public.documents%rowtype;v_cab uuid;
begin
  select * into d from public.documents where id=p_document_id;if not found or not app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.view',d.project_id,d.site_id,d.folder_id,null) then raise exception 'Permission denied';end if;
  v_cab:=app_private.cabinet_for_folder(d.folder_id);
  return jsonb_build_object(
    'document',to_jsonb(d)-'search_vector',
    'project',(select jsonb_build_object('id',p.id,'code',p.code,'name',p.name) from public.projects p where p.id=d.project_id),
    'site',(select jsonb_build_object('id',s.id,'code',s.code,'name',s.name) from public.sites s where s.id=d.site_id),
    'folder',(select jsonb_build_object('id',f.id,'name',f.name,'code',f.code) from public.folders f where f.id=d.folder_id),
    'cabinet',(select jsonb_build_object('id',c.id,'code',c.code,'name',c.name,'status',c.status) from public.site_cabinets c where c.id=v_cab),
    'owner_name',(select full_name from public.profiles where id=d.owner_user_id),
    'versions',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'version_number',v.version_number,'version_label',v.version_label,'original_filename',v.original_filename,'mime_type',v.mime_type,'size_bytes',v.size_bytes,'checksum_sha256',v.checksum_sha256,'upload_state',v.upload_state,'change_note',v.change_note,'uploaded_by',v.uploaded_by,'uploader_name',p.full_name,'created_at',v.created_at,'finalized_at',v.finalized_at) order by v.version_number desc) from public.document_versions v left join public.profiles p on p.id=v.uploaded_by where v.document_id=d.id),'[]'::jsonb),
    'linked_tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'task_number',t.task_number,'title',t.title,'status',t.status,'priority',t.priority,'due_at',t.due_at)) from public.tasks t where t.document_id=d.id and app_private.can_view_task(t.id)),'[]'::jsonb),
    'linked_drawings',coalesce((select jsonb_agg(jsonb_build_object('id',ed.id,'drawing_no',ed.drawing_no,'title',ed.title,'revision_id',l.revision_id,'relation_type',l.relation_type)) from public.engineering_document_links l join public.engineering_drawings ed on ed.id=l.drawing_id where l.document_id=d.id and app_private.can_view_engineering_drawing(ed.id)),'[]'::jsonb),
    'claim_links',coalesce((select jsonb_agg(jsonb_build_object('item_id',i.id,'package_id',p.id,'package_no',p.package_no,'package_status',p.status,'requirement_id',r.id,'requirement_key',r.requirement_key,'label_ar',r.label_ar,'label_en',r.label_en,'selected_version_id',i.selected_version_id,'cabinet_id',i.cabinet_id)) from public.site_claim_items i join public.site_claim_packages p on p.id=i.package_id join public.site_claim_requirements r on r.id=i.requirement_id where i.document_id=d.id),'[]'::jsonb),
    'claim_options',case when d.site_id is not null and app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.manage',d.project_id,d.site_id,d.folder_id,null) then coalesce((select jsonb_agg(jsonb_build_object('package_id',p.id,'package_no',p.package_no,'package_status',p.status,'requirement_id',r.id,'requirement_key',r.requirement_key,'label_ar',r.label_ar,'label_en',r.label_en,'sort_order',r.sort_order) order by r.sort_order) from public.site_claim_packages p join public.site_claim_requirements r on r.package_id=p.id where p.site_id=d.site_id and p.status in('collecting','rejected') and p.locked_at is null),'[]'::jsonb) else '[]'::jsonb end,
    'recent_activity',case when app_private.user_has_company_permission(auth.uid(),d.company_id,'audit.view') then coalesce((select jsonb_agg(x order by x.created_at desc) from(select a.id,a.action,a.actor_id,a.metadata,a.created_at from public.audit_events a where a.company_id=d.company_id and(a.entity_id=d.id or a.metadata#>>'{after,document_id}'=d.id::text) order by a.created_at desc limit 20)x),'[]'::jsonb) else '[]'::jsonb end,
    'can_manage',app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.manage',d.project_id,d.site_id,d.folder_id,null),
    'can_download',app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.download',d.project_id,d.site_id,d.folder_id,null),
    'can_upload',app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.upload',d.project_id,d.site_id,d.folder_id,null),
    'can_rename',app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.rename',d.project_id,d.site_id,d.folder_id,null),
    'can_move',app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.move',d.project_id,d.site_id,d.folder_id,null),
    'can_archive',app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.archive',d.project_id,d.site_id,d.folder_id,null)
  );
end $$;

create or replace function public.project_360(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$ declare p public.projects%rowtype;v_manage boolean;begin
  select * into p from public.projects where id=p_project_id;if not found or not app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.view',p.id,null,null,null) then raise exception 'Permission denied';end if;v_manage:=app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.edit',p.id,null,null,null);
  return jsonb_build_object('project',to_jsonb(p),'blueprint',(select jsonb_build_object('id',b.id,'code',b.code,'name_ar',b.name_ar,'name_en',b.name_en) from public.project_blueprints b where b.id=p.blueprint_id),'manager_name',(select full_name from public.profiles where id=p.manager_user_id),'stats',jsonb_build_object(
    'sites',(select count(*) from public.sites s where s.project_id=p.id and s.archived_at is null),
    'cabinets',(select count(*) from public.site_cabinets c where c.project_id=p.id and c.archived_at is null),
    'claim_packages',(select count(*) from public.site_claim_packages cp where cp.project_id=p.id and cp.status<>'archived'),
    'folders',(select count(*) from public.folders f where f.project_id=p.id and f.trashed_at is null and app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.view',p.id,f.site_id,f.id,null)),
    'documents',(select count(*) from public.documents d where d.project_id=p.id and d.state='active' and app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.view',p.id,d.site_id,d.folder_id,null)),
    'storage_bytes',(select coalesce(sum(v.size_bytes),0) from public.document_versions v join public.documents d on d.id=v.document_id where d.project_id=p.id and v.upload_state='ready' and app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.view',p.id,d.site_id,d.folder_id,null)),
    'open_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status not in('done','cancelled') and app_private.can_view_task(t.id)),
    'overdue_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status not in('done','cancelled') and t.due_at<now() and app_private.can_view_task(t.id)),
    'blocked_tasks',(select count(*) from public.tasks t where t.project_id=p.id and t.status='blocked' and app_private.can_view_task(t.id)),
    'drawings',(select count(*) from public.engineering_drawings d where d.project_id=p.id and d.archived_at is null and app_private.can_view_engineering_drawing(d.id)),
    'milestones',(select count(*) from public.work_milestones m where m.project_id=p.id)
  ),'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'status',s.status,'manager_user_id',s.manager_user_id,'manager_name',pr.full_name,'address',s.address,'archived_at',s.archived_at,'cabinets',(select count(*) from public.site_cabinets c where c.site_id=s.id and c.archived_at is null),'claim_status',(select cp.status from public.site_claim_packages cp where cp.site_id=s.id and cp.claim_type='final' and cp.status<>'archived' order by cp.created_at limit 1)) order by s.archived_at nulls first,s.name) from public.sites s left join public.profiles pr on pr.id=s.manager_user_id where s.project_id=p.id and app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.view',p.id,s.id,null,null)),'[]'::jsonb),'health',jsonb_build_object('score',greatest(0,100-least(35,(select count(*)*5 from public.tasks t where t.project_id=p.id and t.status not in('done','cancelled') and t.due_at<now() and app_private.can_view_task(t.id)))-least(25,(select count(*)*5 from public.tasks t where t.project_id=p.id and t.status='blocked' and app_private.can_view_task(t.id)))),'archived',p.archived_at is not null),'recent_activity',case when app_private.user_has_company_permission(auth.uid(),p.company_id,'audit.view') then coalesce((select jsonb_agg(x order by x.created_at desc) from(select a.id,a.action,a.entity_type,a.entity_id,a.actor_id,a.metadata,a.created_at from public.audit_events a where a.company_id=p.company_id and(a.entity_id=p.id or a.metadata#>>'{after,project_id}'=p.id::text or a.metadata#>>'{before,project_id}'=p.id::text) order by a.created_at desc limit 15)x),'[]'::jsonb) else '[]'::jsonb end,'can_manage',v_manage);
end $$;

create or replace function public.resolve_entity_context(p_entity_type text,p_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp'
as $$ declare r jsonb;begin
  if auth.uid() is null then raise exception 'Authentication required';end if;
  if p_entity_type in('project','projects') then select jsonb_build_object('type','project','project_id',p.id,'page','projects') into r from public.projects p where p.id=p_entity_id and app_private.user_has_resource_permission(auth.uid(),p.company_id,'projects.view',p.id,null,null,null);
  elsif p_entity_type in('site','sites') then select jsonb_build_object('type','site','project_id',s.project_id,'site_id',s.id,'page','projects') into r from public.sites s where s.id=p_entity_id and app_private.user_has_resource_permission(auth.uid(),s.company_id,'projects.view',s.project_id,s.id,null,null);
  elsif p_entity_type in('site_cabinet','cabinet','site_cabinets') then select jsonb_build_object('type','site_cabinet','project_id',c.project_id,'site_id',c.site_id,'cabinet_id',c.id,'folder_id',c.root_folder_id,'page','projects') into r from public.site_cabinets c where c.id=p_entity_id and app_private.user_has_resource_permission(auth.uid(),c.company_id,'projects.view',c.project_id,c.site_id,null,null);
  elsif p_entity_type in('site_claim_package','claim_package','site_claim_packages') then select jsonb_build_object('type','site_claim_package','project_id',p.project_id,'site_id',p.site_id,'claim_package_id',p.id,'page','projects') into r from public.site_claim_packages p where p.id=p_entity_id and app_private.user_has_resource_permission(auth.uid(),p.company_id,'files.view',p.project_id,p.site_id,null,null);
  elsif p_entity_type in('folder','folders') then select jsonb_build_object('type','folder','project_id',f.project_id,'site_id',f.site_id,'folder_id',f.id,'page','files') into r from public.folders f where f.id=p_entity_id and app_private.user_has_resource_permission(auth.uid(),f.company_id,'files.view',f.project_id,f.site_id,f.id,null);
  elsif p_entity_type in('document','documents') then select jsonb_build_object('type','document','project_id',d.project_id,'site_id',d.site_id,'folder_id',d.folder_id,'document_id',d.id,'page','files') into r from public.documents d where d.id=p_entity_id and app_private.user_has_resource_permission(auth.uid(),d.company_id,'files.view',d.project_id,d.site_id,d.folder_id,null);
  elsif p_entity_type in('task','tasks') then select jsonb_build_object('type','task','project_id',t.project_id,'site_id',t.site_id,'folder_id',t.folder_id,'document_id',t.document_id,'task_id',t.id,'page','tasks') into r from public.tasks t where t.id=p_entity_id and app_private.can_view_task(t.id);
  elsif p_entity_type in('engineering_drawing','engineering_drawings') then select jsonb_build_object('type','engineering_drawing','project_id',d.project_id,'site_id',d.site_id,'folder_id',d.folder_id,'drawing_id',d.id,'page','engineering') into r from public.engineering_drawings d where d.id=p_entity_id and app_private.can_view_engineering_drawing(d.id);
  end if;
  if r is null then raise exception 'Entity is unavailable or outside your access scope';end if;return r;
end $$;

-- ---------------------------------------------------------------------------
-- Fiber blueprint: replace vague folders with the actual delivery record.
-- Existing generated system folders are renamed safely when no sibling conflict exists.
-- ---------------------------------------------------------------------------
do $$
declare v_template uuid;begin
  select folder_template_id into v_template from public.project_blueprints where company_id is null and code='fiber-delivery' limit 1;
  if v_template is not null then
    update public.folder_template_nodes set name_ar=case code
      when '01' then 'أوامر التكليف والعقود' when '02' then 'المعاينة والاعتمادات' when '03' then 'الكابينات' when '04' then 'الحصر والكميات' when '05' then 'الرسومات و As-Built' when '06' then 'الاسكتشات والمستندات الفنية' when '07' then 'التسليم والشهادات' when '08' then 'الصور والمراسلات' else name_ar end,
      name_en=case code
      when '01' then '01 — Work Orders & Contracts' when '02' then '02 — Survey & Approvals' when '03' then '03 — Cabinets' when '04' then '04 — Quantity Survey & BOQ' when '05' then '05 — Drawings & As-Built' when '06' then '06 — Sketches & Technical' when '07' then '07 — Handover & Certificates' when '08' then '08 — Photos & Correspondence' else name_en end
    where template_id=v_template and parent_id is null and code in('01','02','03','04','05','06','07','08');

    update public.folders f set name=n.name_en
    from public.folder_template_nodes n
    where f.template_node_id=n.id and n.template_id=v_template and f.is_system and f.trashed_at is null
      and not exists(select 1 from public.folders sibling where sibling.parent_id is not distinct from f.parent_id and sibling.project_id=f.project_id and sibling.site_id is not distinct from f.site_id and sibling.id<>f.id and sibling.trashed_at is null and lower(sibling.name)=lower(n.name_en));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- API grants.
-- ---------------------------------------------------------------------------
do $$ begin
  revoke all on function app_private.cabinet_for_folder(uuid) from public,anon,authenticated;
  revoke all on function app_private.folder_cabinet_operational(uuid) from public,anon,authenticated;
  revoke all on function app_private.ensure_cabinet_parent_folder(uuid,uuid) from public,anon,authenticated;
  revoke all on function app_private.seed_cabinet_workspace(uuid,uuid) from public,anon,authenticated;
  revoke all on function app_private.ensure_default_site_claim_package(uuid,uuid) from public,anon,authenticated;
end $$;

revoke all on function public.save_site_cabinet(jsonb),public.archive_site_cabinet(uuid),public.reactivate_site_cabinet(uuid),public.cabinet_360(uuid),public.site_claim_package_360(uuid),public.save_site_claim_requirement(jsonb),public.add_document_to_site_claim(uuid,text,uuid,uuid,text),public.remove_site_claim_item(uuid),public.freeze_site_claim_package(uuid),public.reopen_site_claim_package(uuid),public.submit_site_claim_package(uuid) from public,anon;
grant execute on function public.save_site_cabinet(jsonb),public.archive_site_cabinet(uuid),public.reactivate_site_cabinet(uuid),public.cabinet_360(uuid),public.site_claim_package_360(uuid),public.save_site_claim_requirement(jsonb),public.add_document_to_site_claim(uuid,text,uuid,uuid,text),public.remove_site_claim_item(uuid),public.freeze_site_claim_package(uuid),public.reopen_site_claim_package(uuid),public.submit_site_claim_package(uuid) to authenticated;

-- Re-assert read-model grants after replacements.
revoke all on function public.site_360(uuid),public.document_360(uuid),public.project_360(uuid),public.resolve_entity_context(text,uuid) from public,anon;
grant execute on function public.site_360(uuid),public.document_360(uuid),public.project_360(uuid),public.resolve_entity_context(text,uuid) to authenticated;

commit;
