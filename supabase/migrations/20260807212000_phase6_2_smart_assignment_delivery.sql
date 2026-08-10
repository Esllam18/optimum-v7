-- Optimum 6.2 — Smart assignment, availability and delivery intelligence.

create table if not exists public.member_leave_periods(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  membership_id uuid not null references public.company_memberships(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  leave_type text not null default 'leave',
  status text not null default 'approved' check(status in ('pending','approved','cancelled')),
  notes text,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(end_at>start_at)
);
create index if not exists member_leave_company_range_idx on public.member_leave_periods(company_id,start_at,end_at);
create index if not exists member_leave_membership_range_idx on public.member_leave_periods(membership_id,start_at,end_at);

alter table public.member_leave_periods enable row level security;
drop policy if exists member_leave_select on public.member_leave_periods;
create policy member_leave_select on public.member_leave_periods for select to authenticated using(
  exists(select 1 from public.company_memberships m where m.id=membership_id and m.user_id=auth.uid() and m.status='active')
  or app_private.has_company_permission(company_id,'tasks.view_workload')
  or app_private.has_company_permission(company_id,'members.manage')
  or app_private.has_company_permission(company_id,'tasks.manage')
);

create or replace function public.save_member_leave_period(p_payload jsonb)
returns uuid language plpgsql security definer set search_path='public','app_private','pg_temp' as $$
declare v_id uuid:=nullif(p_payload->>'id','')::uuid;v_membership uuid:=nullif(p_payload->>'membership_id','')::uuid;v_company uuid;v_user uuid;v_existing public.member_leave_periods%rowtype;v_manage boolean;v_status text;v_start timestamptz:=(p_payload->>'start_at')::timestamptz;v_end timestamptz:=(p_payload->>'end_at')::timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select company_id,user_id into v_company,v_user from public.company_memberships where id=v_membership;
  if v_company is null then raise exception 'Member not found'; end if;
  if v_start is null or v_end is null or v_end<=v_start then raise exception 'Leave end must be after start'; end if;
  if v_id is not null then select * into v_existing from public.member_leave_periods where id=v_id; if found and (v_existing.company_id<>v_company or v_existing.membership_id<>v_membership) then raise exception 'Leave period belongs to another member or company'; end if; end if;
  v_manage:=app_private.has_company_permission(v_company,'members.manage') or app_private.has_company_permission(v_company,'tasks.manage');
  if not (v_user=auth.uid() or v_manage) then raise exception 'Permission denied'; end if;
  v_status:=case when v_manage then coalesce(nullif(p_payload->>'status',''),'approved') else 'pending' end;
  if v_status<>'cancelled' and exists(select 1 from public.member_leave_periods l where l.membership_id=v_membership and l.id<>coalesce(v_id,'00000000-0000-0000-0000-000000000000'::uuid) and l.status<>'cancelled' and tstzrange(l.start_at,l.end_at,'[)') && tstzrange(v_start,v_end,'[)')) then raise exception 'Leave period overlaps another active request'; end if;
  insert into public.member_leave_periods(id,company_id,membership_id,start_at,end_at,leave_type,status,notes,created_by,updated_by)
  values(coalesce(v_id,gen_random_uuid()),v_company,v_membership,v_start,v_end,coalesce(nullif(p_payload->>'leave_type',''),'leave'),v_status,nullif(trim(p_payload->>'notes'),''),auth.uid(),auth.uid())
  on conflict(id) do update set start_at=excluded.start_at,end_at=excluded.end_at,leave_type=excluded.leave_type,status=case when v_manage then excluded.status else 'pending' end,notes=excluded.notes,updated_by=auth.uid(),updated_at=now()
  where public.member_leave_periods.company_id=v_company and public.member_leave_periods.membership_id=v_membership
  returning id into v_id;
  if v_id is null then raise exception 'Leave period could not be saved'; end if;
  perform app_private.bump_work_runtime(v_company);return v_id;
end; $$;

create or replace function public.work_assignment_candidates(p_company_id uuid,p_context jsonb default '{}'::jsonb)
returns table(membership_id uuid,user_id uuid,full_name text,job_title text,experience_level text,skills text[],weekly_capacity numeric,planned_minutes bigint,utilization_percent numeric,on_leave boolean,permission_ok boolean,site_match boolean,skill_match_count integer,score integer,reasons jsonb)
language sql stable security definer set search_path='public','app_private','pg_temp' as $$
with args as (
 select nullif(p_context->>'project_id','')::uuid project_id,nullif(p_context->>'site_id','')::uuid site_id,coalesce(nullif(p_context->>'estimated_minutes','')::integer,0) estimated_minutes,coalesce(array(select jsonb_array_elements_text(coalesce(p_context->'required_skills','[]'::jsonb))),array[]::text[]) required_skills,coalesce(nullif(p_context->>'start_at','')::timestamptz,now()) start_at,coalesce(nullif(p_context->>'due_at','')::timestamptz,now()+interval '7 days') due_at
), base as (
 select m.id membership_id,m.user_id,p.full_name,m.job_title,m.experience_level,coalesce(m.skills,array[]::text[]) skills,coalesce(m.weekly_capacity_hours,cws.default_weekly_hours,40)::numeric weekly_capacity,m.primary_site_id,a.*,
 app_private.user_has_resource_permission(m.user_id,p_company_id,'tasks.view',a.project_id,a.site_id,null,null) permission_ok,
 exists(select 1 from public.member_leave_periods l where l.membership_id=m.id and l.status='approved' and tstzrange(l.start_at,l.end_at,'[)') && tstzrange(a.start_at,a.due_at,'[)')) on_leave,
 coalesce((select sum(coalesce(t.estimated_minutes,0)) from public.tasks t where t.company_id=p_company_id and t.owner_user_id=m.user_id and t.status not in ('done','cancelled') and app_private.can_view_task(t.id) and coalesce(t.due_at,t.start_at,now())>=date_trunc('week',a.start_at) and coalesce(t.start_at,t.due_at,now())<date_trunc('week',a.start_at)+interval '7 days'),0)::bigint planned_minutes,
 coalesce(pref.default_project_ids,array[]::uuid[]) default_project_ids
 from public.company_memberships m join public.profiles p on p.id=m.user_id cross join args a
 left join public.company_work_settings cws on cws.company_id=m.company_id left join public.member_work_preferences pref on pref.membership_id=m.id
 where m.company_id=p_company_id and m.status='active' and coalesce(m.lifecycle_stage,'active') not in ('on_leave','offboarding','left','suspended')
), scored as (
 select b.*,case when b.project_id is null or cardinality(b.default_project_ids)=0 then true else b.project_id=any(b.default_project_ids) end project_match,case when b.site_id is null then true else b.primary_site_id is null or b.primary_site_id=b.site_id end site_match,coalesce((select count(*) from unnest(b.required_skills) req where exists(select 1 from unnest(b.skills) s where lower(s)=lower(req))),0)::integer skill_match_count,case when b.weekly_capacity<=0 then 100 else round((b.planned_minutes/60.0)/(b.weekly_capacity)*100,1) end utilization_percent from base b
)
select membership_id,user_id,full_name,job_title,experience_level,skills,weekly_capacity,planned_minutes,utilization_percent,on_leave,permission_ok,site_match,skill_match_count,greatest(0,least(100,(case when permission_ok then 30 else 0 end)+(case when not on_leave then 20 else 0 end)+(case when project_match then 10 else 0 end)+(case when site_match then 10 else 0 end)+(case when cardinality(required_skills)=0 then 15 else least(15,round(skill_match_count::numeric/greatest(cardinality(required_skills),1)*15)::int) end)+(case when utilization_percent<70 then 15 when utilization_percent<90 then 10 when utilization_percent<110 then 4 else 0 end)))::integer score,
 jsonb_build_array(jsonb_build_object('key','permission','ok',permission_ok),jsonb_build_object('key','availability','ok',not on_leave),jsonb_build_object('key','project','ok',project_match),jsonb_build_object('key','site','ok',site_match),jsonb_build_object('key','skills','ok',cardinality(required_skills)=0 or skill_match_count=cardinality(required_skills),'matched',skill_match_count,'required',cardinality(required_skills)),jsonb_build_object('key','capacity','ok',utilization_percent<100,'utilization',utilization_percent)) reasons
from scored where permission_ok and (app_private.has_company_permission(p_company_id,'tasks.assign') or app_private.has_company_permission(p_company_id,'tasks.manage')) order by score desc,utilization_percent asc,full_name;
$$;

create or replace function public.work_delivery_snapshot(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','app_private','pg_temp' as $$
declare v_result jsonb;
begin
 if not app_private.has_company_permission(p_company_id,'tasks.view') then raise exception 'Permission denied';end if;
 with visible as (select t.*,app_private.task_risk_snapshot(t.id) risk from public.tasks t where t.company_id=p_company_id and app_private.can_view_task(t.id)),
 attention as (select jsonb_agg(jsonb_build_object('id',id,'task_number',task_number,'title',title,'status',status,'priority',priority,'due_at',due_at,'risk',risk) order by coalesce((risk->>'score')::int,0) desc,due_at nulls last) items from (select * from visible where status not in ('done','cancelled') and coalesce((risk->>'score')::int,0)>=25 order by coalesce((risk->>'score')::int,0) desc limit 20) q),
 workload as (select jsonb_agg(jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'name',p.full_name,'capacity_hours',coalesce(m.weekly_capacity_hours,cws.default_weekly_hours,40),'planned_minutes',coalesce(w.planned_minutes,0),'utilization',case when coalesce(m.weekly_capacity_hours,cws.default_weekly_hours,40)>0 then round(coalesce(w.planned_minutes,0)/60.0/coalesce(m.weekly_capacity_hours,cws.default_weekly_hours,40)*100,1) else 100 end) order by p.full_name) items from public.company_memberships m join public.profiles p on p.id=m.user_id left join public.company_work_settings cws on cws.company_id=m.company_id left join lateral (select sum(coalesce(t.estimated_minutes,0)) planned_minutes from public.tasks t where t.company_id=m.company_id and t.owner_user_id=m.user_id and t.status not in ('done','cancelled') and app_private.can_view_task(t.id) and coalesce(t.due_at,t.start_at,now())>=date_trunc('week',now()) and coalesce(t.start_at,t.due_at,now())<date_trunc('week',now())+interval '7 days') w on true where m.company_id=p_company_id and m.status='active' and (app_private.has_company_permission(p_company_id,'tasks.view_workload') or app_private.has_company_permission(p_company_id,'tasks.manage')))
 select jsonb_build_object('open',count(*) filter(where status not in ('done','cancelled')),'overdue',count(*) filter(where status not in ('done','cancelled') and due_at<now()),'blocked',count(*) filter(where status='blocked'),'high_risk',count(*) filter(where status not in ('done','cancelled') and coalesce((risk->>'score')::int,0)>=60),'due_today',count(*) filter(where status not in ('done','cancelled') and due_at::date=current_date),'completed_week',count(*) filter(where status='done' and completed_at>=date_trunc('week',now())),'attention',coalesce((select items from attention),'[]'::jsonb),'workload',coalesce((select items from workload),'[]'::jsonb),'milestones','[]'::jsonb) into v_result from visible;
 return coalesce(v_result,'{}'::jsonb);
end; $$;

drop trigger if exists member_leave_updated_at on public.member_leave_periods;
create trigger member_leave_updated_at before update on public.member_leave_periods for each row execute function public.set_updated_at();
drop trigger if exists work_runtime_bump_member_leave_periods on public.member_leave_periods;
create trigger work_runtime_bump_member_leave_periods after insert or update or delete on public.member_leave_periods for each row execute function app_private.work_runtime_trigger();

revoke all privileges on table public.member_leave_periods from anon;
grant select on table public.member_leave_periods to authenticated;
revoke all on function public.save_member_leave_period(jsonb) from public,anon;
revoke all on function public.work_assignment_candidates(uuid,jsonb) from public,anon;
revoke all on function public.work_delivery_snapshot(uuid) from public,anon;
grant execute on function public.save_member_leave_period(jsonb) to authenticated;
grant execute on function public.work_assignment_candidates(uuid,jsonb) to authenticated;
grant execute on function public.work_delivery_snapshot(uuid) to authenticated;
