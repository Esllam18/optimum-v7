-- Optimum 6.3 — Operational Calendar, milestones, leave visibility and availability.

create table if not exists public.work_milestones(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 2 and 240),
  description text,
  due_at timestamptz,
  status text not null default 'planned' check(status in ('planned','at_risk','achieved','missed','cancelled')),
  owner_user_id uuid references public.profiles(id) on delete set null,
  weight numeric not null default 1 check(weight>0 and weight<=100),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_milestones_company_due_idx on public.work_milestones(company_id,due_at);
create index if not exists work_milestones_project_due_idx on public.work_milestones(project_id,due_at) where project_id is not null;

alter table public.work_milestones enable row level security;
drop policy if exists work_milestones_select on public.work_milestones;
create policy work_milestones_select on public.work_milestones for select to authenticated using(
  app_private.has_company_permission(company_id,'tasks.view')
  and (project_id is null or app_private.resource_permission_for_row(company_id,'tasks.view',project_id,null,null,null))
);

do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.tasks'::regclass and conname='tasks_milestone_id_fkey') then
  alter table public.tasks add constraint tasks_milestone_id_fkey foreign key(milestone_id) references public.work_milestones(id) on delete set null;
 end if;
end $$;

create or replace function public.save_work_milestone(p_payload jsonb)
returns uuid language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
declare v_id uuid:=nullif(p_payload->>'id','')::uuid;v_company uuid:=nullif(p_payload->>'company_id','')::uuid;v_project uuid:=nullif(p_payload->>'project_id','')::uuid;v_owner uuid:=nullif(p_payload->>'owner_user_id','')::uuid;v_existing_company uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if v_id is not null then select company_id into v_existing_company from public.work_milestones where id=v_id; if v_existing_company is not null and v_existing_company<>v_company then raise exception 'Milestone belongs to another company'; end if; end if;
 if not (app_private.has_company_permission(v_company,'tasks.manage_milestones') or app_private.has_company_permission(v_company,'tasks.manage')) then raise exception 'Permission denied'; end if;
 if v_project is not null then
  if not exists(select 1 from public.projects p where p.id=v_project and p.company_id=v_company) then raise exception 'Project belongs to another company'; end if;
  if not app_private.resource_permission_for_row(v_company,'tasks.view',v_project,null,null,null) then raise exception 'Permission denied for milestone scope'; end if;
 end if;
 if v_owner is not null then
  if not exists(select 1 from public.company_memberships m where m.company_id=v_company and m.user_id=v_owner and m.status='active' and coalesce(m.lifecycle_stage,'active') not in ('on_leave','offboarding','left','suspended')) then raise exception 'Milestone owner is not available'; end if;
  if not app_private.user_has_resource_permission(v_owner,v_company,'tasks.view',v_project,null,null,null) then raise exception 'Milestone owner cannot access this scope'; end if;
 end if;
 insert into public.work_milestones(id,company_id,project_id,title,description,due_at,status,owner_user_id,weight,created_by,updated_by)
 values(coalesce(v_id,gen_random_uuid()),v_company,v_project,trim(p_payload->>'title'),nullif(trim(p_payload->>'description'),''),nullif(p_payload->>'due_at','')::timestamptz,coalesce(nullif(p_payload->>'status',''),'planned'),v_owner,coalesce(nullif(p_payload->>'weight','')::numeric,1),auth.uid(),auth.uid())
 on conflict(id) do update set project_id=excluded.project_id,title=excluded.title,description=excluded.description,due_at=excluded.due_at,status=excluded.status,owner_user_id=excluded.owner_user_id,weight=excluded.weight,updated_by=auth.uid(),updated_at=now()
 where public.work_milestones.company_id=v_company returning id into v_id;
 if v_id is null then raise exception 'Milestone could not be saved'; end if;
 perform app_private.bump_work_runtime(v_company);return v_id;
end; $$;

create or replace function public.work_calendar_feed(p_company_id uuid,p_from timestamptz,p_to timestamptz,p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp' as $$
declare v_result jsonb;v_team boolean;
begin
 if not app_private.has_company_permission(p_company_id,'tasks.view') then raise exception 'Permission denied'; end if;
 if p_to<=p_from or p_to-p_from>interval '370 days' then raise exception 'Invalid calendar range'; end if;
 v_team:=app_private.has_company_permission(p_company_id,'tasks.view_workload') or app_private.has_company_permission(p_company_id,'tasks.manage');
 if p_user_id is not null then
  if not exists(select 1 from public.company_memberships m where m.company_id=p_company_id and m.user_id=p_user_id and m.status='active') then raise exception 'Calendar member not found'; end if;
  if p_user_id<>auth.uid() and not v_team then raise exception 'Workload permission required for another member calendar'; end if;
 end if;
 with events as (
  select jsonb_build_object('kind','task','id',t.id,'title',t.title,'task_type',t.task_type,'status',t.status,'priority',t.priority,'start_at',coalesce(t.start_at,t.due_at),'end_at',coalesce(t.due_at,t.start_at),'all_day',false,'project_id',t.project_id,'owner_user_id',t.owner_user_id,'risk',app_private.task_risk_snapshot(t.id)) item
  from public.tasks t where t.company_id=p_company_id and t.status<>'cancelled' and app_private.can_view_task(t.id) and coalesce(t.due_at,t.start_at) is not null and coalesce(t.start_at,t.due_at)<p_to and coalesce(t.due_at,t.start_at)>=p_from and (p_user_id is null or t.owner_user_id=p_user_id or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=p_user_id))
  union all
  select jsonb_build_object('kind','milestone','id',m.id,'title',m.title,'status',m.status,'start_at',m.due_at,'end_at',m.due_at,'all_day',true,'project_id',m.project_id,'owner_user_id',m.owner_user_id)
  from public.work_milestones m where m.company_id=p_company_id and m.status<>'cancelled' and m.due_at>=p_from and m.due_at<p_to and (m.project_id is null or app_private.resource_permission_for_row(m.company_id,'tasks.view',m.project_id,null,null,null)) and (p_user_id is null or m.owner_user_id=p_user_id)
  union all
  select jsonb_build_object('kind','leave','id',l.id,'title',coalesce(p.full_name,'')||' — '||l.leave_type,'status',l.status,'start_at',l.start_at,'end_at',l.end_at,'all_day',true,'owner_user_id',m.user_id)
  from public.member_leave_periods l join public.company_memberships m on m.id=l.membership_id join public.profiles p on p.id=m.user_id
  where l.company_id=p_company_id and l.status='approved' and l.start_at<p_to and l.end_at>p_from and ((p_user_id is null and v_team) or m.user_id=coalesce(p_user_id,auth.uid()))
  union all
  select jsonb_build_object('kind','holiday','id',null,'title',coalesce(h.value->>'name',h.value->>'date'),'status','holiday','start_at',(h.value->>'date')::date::timestamptz,'end_at',((h.value->>'date')::date+1)::timestamptz,'all_day',true)
  from public.company_work_settings c cross join lateral jsonb_array_elements(coalesce(c.holidays,'[]'::jsonb)) h(value)
  where c.company_id=p_company_id and (h.value->>'date')::date>=p_from::date and (h.value->>'date')::date<p_to::date
 ) select coalesce(jsonb_agg(item order by item->>'start_at'),'[]'::jsonb) into v_result from events;
 return v_result;
end; $$;

create or replace function public.work_leave_requests(p_company_id uuid,p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp' as $$
declare v_manage boolean;v_limit integer:=greatest(1,least(coalesce(p_limit,100),200));v_offset integer:=greatest(coalesce(p_offset,0),0);v_result jsonb;
begin
 if auth.uid() is null or not app_private.is_company_member(p_company_id) then raise exception 'Permission denied'; end if;
 v_manage:=app_private.has_company_permission(p_company_id,'members.manage') or app_private.has_company_permission(p_company_id,'tasks.manage');
 with rows as (
  select l.id,l.company_id,l.membership_id,m.user_id,p.full_name,l.start_at,l.end_at,l.leave_type,l.status,l.notes,l.created_by,l.updated_by,l.created_at,l.updated_at
  from public.member_leave_periods l join public.company_memberships m on m.id=l.membership_id and m.company_id=l.company_id join public.profiles p on p.id=m.user_id
  where l.company_id=p_company_id and (v_manage or m.user_id=auth.uid())
  order by case l.status when 'pending' then 0 when 'approved' then 1 else 2 end,l.start_at desc,l.created_at desc
 ), page as (select * from rows limit v_limit offset v_offset)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from rows),'offset',v_offset,'limit',v_limit,'has_more',(select count(*) from rows)>v_offset+v_limit,'can_manage',v_manage) into v_result;
 return v_result;
end; $$;

create or replace function public.cancel_member_leave_period(p_leave_id uuid)
returns void language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
declare v_leave public.member_leave_periods%rowtype;v_user uuid;v_manage boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into v_leave from public.member_leave_periods where id=p_leave_id for update;
 if not found then raise exception 'Leave request not found'; end if;
 select m.user_id into v_user from public.company_memberships m where m.id=v_leave.membership_id and m.company_id=v_leave.company_id;
 if v_user is null then raise exception 'Leave member not found'; end if;
 v_manage:=app_private.has_company_permission(v_leave.company_id,'members.manage') or app_private.has_company_permission(v_leave.company_id,'tasks.manage');
 if v_user<>auth.uid() and not v_manage then raise exception 'Permission denied'; end if;
 if v_leave.status='cancelled' then return; end if;
 update public.member_leave_periods set status='cancelled',updated_by=auth.uid(),updated_at=now() where id=p_leave_id;
 perform app_private.bump_work_runtime(v_leave.company_id);
end; $$;

drop trigger if exists work_runtime_bump_work_milestones on public.work_milestones;
create trigger work_runtime_bump_work_milestones after insert or update or delete on public.work_milestones for each row execute function app_private.work_runtime_trigger();

grant select on public.work_milestones to authenticated;
revoke select on public.member_leave_periods from authenticated;
revoke all on function public.save_work_milestone(jsonb) from public,anon;
revoke all on function public.work_calendar_feed(uuid,timestamptz,timestamptz,uuid) from public,anon;
revoke all on function public.work_leave_requests(uuid,integer,integer) from public,anon;
revoke all on function public.cancel_member_leave_period(uuid) from public,anon;
grant execute on function public.save_work_milestone(jsonb) to authenticated;
grant execute on function public.work_calendar_feed(uuid,timestamptz,timestamptz,uuid) to authenticated;
grant execute on function public.work_leave_requests(uuid,integer,integer) to authenticated;
grant execute on function public.cancel_member_leave_period(uuid) to authenticated;
