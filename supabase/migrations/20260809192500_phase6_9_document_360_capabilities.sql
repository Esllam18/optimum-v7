begin;
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
commit;
