begin;

create or replace function public.file_workspace_snapshot(
  p_company_id uuid,
  p_project_id uuid,
  p_site_id uuid default null,
  p_folder_id uuid default null,
  p_document_limit integer default 200
) returns jsonb
language plpgsql stable security definer
set search_path='public','app_private','pg_temp'
as $$
declare p public.projects%rowtype;s public.sites%rowtype;begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into p from public.projects where id=p_project_id and company_id=p_company_id;
  if not found or not app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',p_project_id,p_site_id,p_folder_id,null) then raise exception 'Permission denied'; end if;
  if p_site_id is not null then select * into s from public.sites where id=p_site_id and project_id=p_project_id and company_id=p_company_id;if not found then raise exception 'Invalid site';end if;end if;
  return jsonb_build_object(
    'project',jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'status',p.status,'archived_at',p.archived_at),
    'site',case when p_site_id is null then null else jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'status',s.status,'archived_at',s.archived_at) end,
    'folders',coalesce((select jsonb_agg(x order by x.sort_order,x.name) from (
      select f.id,f.company_id,f.project_id,f.site_id,f.parent_id,f.template_node_id,f.name,f.code,f.depth,f.sort_order,f.is_system,f.created_by,f.created_at,f.updated_at,f.archived_at,f.trashed_at,
        (select count(*) from public.folders c where c.parent_id=f.id and c.trashed_at is null and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',c.project_id,c.site_id,c.id,null)) child_count,
        (select count(*) from public.documents d where d.folder_id=f.id and d.state='active' and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',d.project_id,d.site_id,d.folder_id,null)) document_count
      from public.folders f where f.company_id=p_company_id and f.project_id=p_project_id and f.site_id is not distinct from p_site_id and f.trashed_at is null
        and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',f.project_id,f.site_id,f.id,null)
    ) x),'[]'::jsonb),
    'documents',case when p_folder_id is null then '[]'::jsonb else coalesce((select jsonb_agg(x order by x.updated_at desc) from (
      select d.id,d.company_id,d.project_id,d.site_id,d.folder_id,d.display_name,d.system_code,d.document_type,d.description,d.tags,d.state,d.current_version_id,d.version_count,d.created_by,d.created_at,d.updated_at,d.control_status,d.discipline,d.owner_user_id,d.review_due_at,d.approved_at,d.approved_by,
        v.version_number,v.version_label,v.original_filename,v.mime_type,v.size_bytes,v.upload_state,v.change_note,v.uploaded_by,v.finalized_at
      from public.documents d left join public.document_versions v on v.id=d.current_version_id
      where d.company_id=p_company_id and d.project_id=p_project_id and d.site_id is not distinct from p_site_id and d.folder_id=p_folder_id and d.state='active'
        and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',d.project_id,d.site_id,d.folder_id,null)
      order by d.updated_at desc limit greatest(1,least(coalesce(p_document_limit,200),500))
    ) x),'[]'::jsonb) end
  );
end $$;

create or replace function public.document_picker_query(p_company_id uuid,p_project_id uuid,p_site_id uuid default null,p_query text default '',p_limit integer default 100)
returns table(id uuid,display_name text,document_type text,control_status text,folder_id uuid,site_id uuid,system_code text,version_count integer)
language sql stable security definer
set search_path='public','app_private','pg_temp'
as $$
  with q as(select trim(coalesce(p_query,'')) raw,case when trim(coalesce(p_query,''))='' then null else websearch_to_tsquery('simple',trim(p_query)) end tsq)
  select d.id,d.display_name,d.document_type,d.control_status,d.folder_id,d.site_id,d.system_code,d.version_count
  from public.documents d cross join q
  where d.company_id=p_company_id and d.project_id=p_project_id and d.state='active'
    and (p_site_id is null or d.site_id is not distinct from p_site_id or d.site_id is null)
    and app_private.user_has_resource_permission(auth.uid(),p_company_id,'files.view',d.project_id,d.site_id,d.folder_id,null)
    and (q.raw='' or d.search_vector @@ q.tsq or d.display_name ilike '%'||q.raw||'%' or coalesce(d.system_code,'') ilike '%'||q.raw||'%' or exists(select 1 from unnest(d.tags) tag where tag ilike '%'||q.raw||'%'))
  order by d.updated_at desc limit greatest(1,least(coalesce(p_limit,100),200));
$$;

create or replace function public.global_search(p_company_id uuid,p_query text,p_limit integer default 30)
returns table(entity_type text,entity_id uuid,title text,subtitle text,project_id uuid,site_id uuid,folder_id uuid)
language plpgsql stable security invoker
set search_path='public','pg_temp'
as $$
declare v_query text:=trim(coalesce(p_query,''));begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_company_permission(p_company_id,'search.use') then raise exception 'Search is not available for this account'; end if;
  if v_query='' then return; end if;
  return query
  with q as(select websearch_to_tsquery('simple',v_query) tsq,least(greatest(coalesce(p_limit,30),1),100) lim),
  results(entity_type,entity_id,title,subtitle,project_id,site_id,folder_id,rank) as(
    select 'project'::text,p.id,p.name,p.code,p.id,null::uuid,null::uuid,1::real from public.projects p where p.company_id=p_company_id and p.archived_at is null and(p.name ilike '%'||v_query||'%' or p.code ilike '%'||v_query||'%')
    union all select 'site',s.id,s.name,s.code,s.project_id,s.id,null::uuid,2 from public.sites s where s.company_id=p_company_id and s.archived_at is null and(s.name ilike '%'||v_query||'%' or s.code ilike '%'||v_query||'%')
    union all select 'folder',f.id,f.name,coalesce(f.code,''),f.project_id,f.site_id,f.id,3 from public.folders f where f.company_id=p_company_id and f.trashed_at is null and(f.name ilike '%'||v_query||'%' or coalesce(f.code,'') ilike '%'||v_query||'%')
    union all select 'document',d.id,d.display_name,concat_ws(' · ',d.system_code,d.document_type,d.control_status),d.project_id,d.site_id,d.folder_id,
      (4-greatest(0,least(2,ts_rank_cd(d.search_vector,q.tsq))))::real from public.documents d cross join q where d.company_id=p_company_id and d.state='active' and(d.search_vector @@ q.tsq or d.display_name ilike '%'||v_query||'%' or coalesce(d.system_code,'') ilike '%'||v_query||'%' or exists(select 1 from unnest(d.tags) tag where tag ilike '%'||v_query||'%'))
    union all select 'task',t.id,t.title,'#'||t.task_number::text,t.project_id,t.site_id,t.folder_id,5 from public.tasks t where t.company_id=p_company_id and t.status<>'cancelled' and(t.title ilike '%'||v_query||'%' or coalesce(t.description,'') ilike '%'||v_query||'%')
    union all select 'engineering_drawing',d.id,d.title,d.drawing_no,d.project_id,d.site_id,d.folder_id,6 from public.engineering_drawings d where d.company_id=p_company_id and d.archived_at is null and(d.title ilike '%'||v_query||'%' or d.drawing_no ilike '%'||v_query||'%')
  ) select r.entity_type,r.entity_id,r.title,r.subtitle,r.project_id,r.site_id,r.folder_id from results r,q order by r.rank,r.title limit(select lim from q);
end $$;

revoke all on function public.file_workspace_snapshot(uuid,uuid,uuid,uuid,integer) from public,anon;
revoke all on function public.document_picker_query(uuid,uuid,uuid,text,integer) from public,anon;
grant execute on function public.file_workspace_snapshot(uuid,uuid,uuid,uuid,integer),public.document_picker_query(uuid,uuid,uuid,text,integer) to authenticated;
revoke all on function public.global_search(uuid,text,integer) from public,anon;
grant execute on function public.global_search(uuid,text,integer) to authenticated;

commit;
