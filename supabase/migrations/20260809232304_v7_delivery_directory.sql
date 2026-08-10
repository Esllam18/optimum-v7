-- Optimum V7 — scalable Site Delivery directory with tenant/resource scope enforcement.
create or replace function public.delivery_directory_query(
  p_company_id uuid,
  p_project_id uuid default null,
  p_site_id uuid default null,
  p_status text default null,
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_query text:=trim(coalesce(p_query,''));
  v_status text:=nullif(trim(coalesce(p_status,'')),'');
  v_unscoped_files boolean:=false;
  v_unscoped_projects boolean:=false;
  v_result jsonb;
begin
  if v_uid is null or not app_private.has_company_permission(p_company_id,'files.view') then raise exception 'Permission denied'; end if;
  if v_status is not null and v_status not in ('collecting','ready','submitted','approved','rejected','archived') then raise exception 'Invalid claim status'; end if;
  if p_project_id is not null and not exists(select 1 from public.projects where id=p_project_id and company_id=p_company_id) then raise exception 'Invalid project'; end if;
  if p_site_id is not null and not exists(select 1 from public.sites where id=p_site_id and company_id=p_company_id and (p_project_id is null or project_id=p_project_id)) then raise exception 'Invalid site'; end if;
  v_unscoped_files:=app_private.user_permission_is_unscoped(v_uid,p_company_id,'files.view');
  v_unscoped_projects:=app_private.has_company_permission(p_company_id,'projects.view') and app_private.user_permission_is_unscoped(v_uid,p_company_id,'projects.view');

  with visible_packages as materialized (
    select cp.*,pr.code project_code,pr.name project_name,s.code site_code,s.name site_name
    from public.site_claim_packages cp
    join public.projects pr on pr.id=cp.project_id
    join public.sites s on s.id=cp.site_id
    where cp.company_id=p_company_id
      and (p_project_id is null or cp.project_id=p_project_id)
      and (p_site_id is null or cp.site_id=p_site_id)
      and (v_unscoped_files or app_private.user_has_resource_permission(v_uid,p_company_id,'files.view',cp.project_id,cp.site_id,null,null))
  ), filtered as materialized (
    select * from visible_packages
    where (v_status is null or status=v_status)
      and (v_query='' or package_no ilike '%'||v_query||'%' or title ilike '%'||v_query||'%' or project_name ilike '%'||v_query||'%' or site_name ilike '%'||v_query||'%')
  ), page as materialized (
    select * from filtered order by updated_at desc,id limit v_limit offset v_offset
  ), package_counts as (
    select count(*) packages,
      count(*) filter(where status='collecting') collecting,
      count(*) filter(where status='ready') ready,
      count(*) filter(where status='submitted') submitted,
      count(*) filter(where status='approved') approved,
      count(*) filter(where status='rejected') rejected
    from visible_packages
  ), cabinet_count as (
    select count(*) cabinets
    from public.site_cabinets c
    where c.company_id=p_company_id and c.archived_at is null
      and (p_project_id is null or c.project_id=p_project_id)
      and (p_site_id is null or c.site_id=p_site_id)
      and (v_unscoped_projects or app_private.user_has_resource_permission(v_uid,p_company_id,'projects.view',c.project_id,c.site_id,null,null))
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'offset',v_offset,'limit',v_limit,
    'has_more',(select count(*) from filtered)>v_offset+v_limit,
    'counts',jsonb_build_object(
      'packages',(select packages from package_counts),
      'collecting',(select collecting from package_counts),
      'ready',(select ready from package_counts),
      'submitted',(select submitted from package_counts),
      'approved',(select approved from package_counts),
      'rejected',(select rejected from package_counts),
      'cabinets',(select cabinets from cabinet_count)
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.delivery_directory_query(uuid,uuid,uuid,text,text,integer,integer) from public,anon;
grant execute on function public.delivery_directory_query(uuid,uuid,uuid,text,text,integer,integer) to authenticated;
comment on function public.delivery_directory_query(uuid,uuid,uuid,text,text,integer,integer) is 'V7 paginated Site Delivery directory. Enforces tenant and resource scope and returns accurate package/cabinet counts independent of page size.';
