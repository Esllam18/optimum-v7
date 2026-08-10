-- Optimum V7 — scalable People directory and explicit authenticated RPC contract.
-- Business SECURITY DEFINER RPCs remain intentional authenticated API endpoints when
-- they perform their own authorization checks. Internal scheduler helpers stay private.

create or replace function public.member_directory_query(
  p_company_id uuid,
  p_query text default null,
  p_status text default null,
  p_role_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public','auth','app_private','pg_temp'
as $function$
declare
  v_query text := trim(coalesce(p_query,''));
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_status text := nullif(trim(coalesce(p_status,'')),'');
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.is_platform_admin()
     and not app_private.has_company_permission(p_company_id,'members.view') then
    raise exception 'Permission denied';
  end if;
  if v_status is not null and v_status not in ('invited','active','suspended','left') then
    raise exception 'Invalid member status';
  end if;
  if p_role_id is not null and not exists(select 1 from public.roles r where r.id=p_role_id and r.company_id=p_company_id) then
    raise exception 'Invalid role';
  end if;

  with filtered as materialized (
    select
      m.id membership_id,m.user_id,m.employee_code,m.job_title,m.department,m.status,
      m.lifecycle_stage,m.employment_type,m.work_mode,m.weekly_capacity_hours,
      m.primary_site_id,m.manager_user_id,m.joined_at,m.access_starts_at,m.access_ends_at,
      coalesce(m.invited_email,u.email) email,
      p.full_name,p.avatar_path,
      r.id role_id,r.slug role_slug,r.name_ar role_name_ar,r.name_en role_name_en,r.color role_color,r.icon role_icon
    from public.company_memberships m
    join public.roles r on r.id=m.role_id
    left join public.profiles p on p.id=m.user_id
    left join auth.users u on u.id=m.user_id
    where m.company_id=p_company_id
      and (v_status is null or m.status::text=v_status)
      and (p_role_id is null or m.role_id=p_role_id)
      and (
        v_query=''
        or coalesce(p.full_name,'') ilike '%'||v_query||'%'
        or coalesce(m.employee_code,'') ilike '%'||v_query||'%'
        or coalesce(m.job_title,'') ilike '%'||v_query||'%'
        or coalesce(m.department,'') ilike '%'||v_query||'%'
        or coalesce(m.invited_email,u.email,'') ilike '%'||v_query||'%'
        or r.name_ar ilike '%'||v_query||'%'
        or r.name_en ilike '%'||v_query||'%'
      )
  ), page as materialized (
    select * from filtered
    order by
      case status when 'active' then 0 when 'invited' then 1 when 'suspended' then 2 else 3 end,
      coalesce(full_name,email,'') asc,
      membership_id
    limit v_limit offset v_offset
  ), counts as (
    select
      count(*) total_members,
      count(*) filter(where status='active') active_members,
      count(*) filter(where status='invited') invited_members,
      count(*) filter(where status='suspended') suspended_members,
      count(*) filter(where status='left') left_members
    from public.company_memberships where company_id=p_company_id
  ), invites as (
    select count(*) pending_invites
    from public.company_invitations
    where company_id=p_company_id and status='pending' and expires_at>now()
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'offset',v_offset,
    'limit',v_limit,
    'has_more',(select count(*) from filtered)>v_offset+v_limit,
    'status_counts',jsonb_build_object(
      'members',(select total_members from counts),
      'active',(select active_members from counts),
      'invited',(select invited_members from counts),
      'pending_invites',(select pending_invites from invites),
      'suspended',(select suspended_members from counts),
      'left',(select left_members from counts)
    )
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.member_directory_query(uuid,text,text,uuid,integer,integer) from public,anon;
grant execute on function public.member_directory_query(uuid,text,text,uuid,integer,integer) to authenticated;

comment on function public.member_directory_query(uuid,text,text,uuid,integer,integer) is
'V7 authenticated People directory API. Authorization is enforced inside the SECURITY DEFINER function; results are tenant scoped and paginated.';
comment on function public.cleanup_stale_uploads(integer) is
'Intentional backward-compatible authenticated maintenance API in V6.9. It only cleans the caller own abandoned reservations or company reservations when files.manage is held, and never deletes Storage objects.';
comment on function public.create_company_invitation(uuid,text,uuid,integer) is
'Intentional authenticated invitation command. Enforces members.invite, role delegation, tenant ownership, email validation and expiry limits.';
