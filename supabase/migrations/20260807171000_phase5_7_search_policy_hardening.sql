create or replace function public.global_search(p_company_id uuid,p_query text,p_limit integer default 30)
returns table(entity_type text,entity_id uuid,title text,subtitle text,project_id uuid,site_id uuid,folder_id uuid)
language plpgsql
stable
security invoker
set search_path to 'public','pg_temp'
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.has_company_permission(p_company_id,'search.use') then raise exception 'Search is not available for this account'; end if;
  return query
  with q as(select trim(coalesce(p_query,'')) needle,least(greatest(coalesce(p_limit,30),1),100) lim),
  results(entity_type,entity_id,title,subtitle,project_id,site_id,folder_id,rank) as(
    select 'project'::text,p.id,p.name,p.code,p.id,null::uuid,null::uuid,1 from public.projects p,q where p.company_id=p_company_id and p.archived_at is null and(p.name ilike '%'||q.needle||'%' or p.code ilike '%'||q.needle||'%')
    union all select 'site',s.id,s.name,s.code,s.project_id,s.id,null::uuid,2 from public.sites s,q where s.company_id=p_company_id and s.archived_at is null and(s.name ilike '%'||q.needle||'%' or s.code ilike '%'||q.needle||'%')
    union all select 'folder',f.id,f.name,coalesce(f.code,''),f.project_id,f.site_id,f.id,3 from public.folders f,q where f.company_id=p_company_id and f.trashed_at is null and(f.name ilike '%'||q.needle||'%' or coalesce(f.code,'') ilike '%'||q.needle||'%')
    union all select 'document',d.id,d.display_name,d.document_type,d.project_id,d.site_id,d.folder_id,4 from public.documents d,q where d.company_id=p_company_id and d.state='active' and(d.display_name ilike '%'||q.needle||'%' or coalesce(d.description,'') ilike '%'||q.needle||'%')
    union all select 'task',t.id,t.title,'#'||t.task_number::text,t.project_id,t.site_id,t.folder_id,5 from public.tasks t,q where t.company_id=p_company_id and t.status<>'cancelled' and(t.title ilike '%'||q.needle||'%' or coalesce(t.description,'') ilike '%'||q.needle||'%')
    union all select 'engineering_drawing',d.id,d.title,d.drawing_no,d.project_id,d.site_id,d.folder_id,6 from public.engineering_drawings d,q where d.company_id=p_company_id and d.archived_at is null and(d.title ilike '%'||q.needle||'%' or d.drawing_no ilike '%'||q.needle||'%'))
  select r.entity_type,r.entity_id,r.title,r.subtitle,r.project_id,r.site_id,r.folder_id from results r,q order by r.rank,r.title limit(select lim from q);
end;
$$;
revoke all on function public.global_search(uuid,text,integer) from public,anon;
grant execute on function public.global_search(uuid,text,integer) to authenticated;
