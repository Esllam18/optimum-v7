-- Optimum 6.7.0 — Work Experience Excellence
-- Work Cockpit, actionable capacity planning, dependency graph, workflow templates,
-- and richer automation primitives. All browser-facing privileged functions perform
-- explicit authentication + permission checks and anonymous execution is revoked.

-- ---------------------------------------------------------------------------
-- Personal + manager Work Cockpit.
-- ---------------------------------------------------------------------------
create or replace function public.work_cockpit_snapshot(p_company_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_uid uuid:=auth.uid();
  v_tz text:=coalesce((select timezone from public.company_work_settings where company_id=p_company_id),'UTC');
  v_today date;
  v_manage boolean;
  v_result jsonb;
begin
  if v_uid is null or not app_private.has_company_permission(p_company_id,'tasks.view') then
    raise exception 'Permission denied';
  end if;
  v_manage:=app_private.has_company_permission(p_company_id,'tasks.view_workload') or app_private.has_company_permission(p_company_id,'tasks.manage');
  v_today:=(now() at time zone v_tz)::date;

  with visible as (
    select t.*,p.full_name owner_name,pr.name project_name,app_private.task_risk_snapshot(t.id) risk
    from public.tasks t
    left join public.profiles p on p.id=t.owner_user_id
    left join public.projects pr on pr.id=t.project_id
    where t.company_id=p_company_id and app_private.can_view_task(t.id)
  ), mine as (
    select v.*
    from visible v
    where v.owner_user_id=v_uid or v.claimed_by=v_uid or v.reviewer_user_id=v_uid or v.approver_user_id=v_uid
       or exists(select 1 from public.task_assignments a where a.task_id=v.id and a.user_id=v_uid)
  ), focus_rows as (
    select * from mine
    where status not in ('done','cancelled')
    order by
      case when approver_user_id=v_uid then 0 when reviewer_user_id=v_uid then 1 else 2 end,
      case when due_at is not null and (due_at at time zone v_tz)::date<v_today then 0 else 1 end,
      coalesce((risk->>'score')::int,0) desc,
      due_at asc nulls last,
      created_at desc
    limit 12
  ), team_attention_rows as (
    select * from visible
    where v_manage and status not in ('done','cancelled') and coalesce((risk->>'score')::int,0)>=25
    order by coalesce((risk->>'score')::int,0) desc,due_at asc nulls last
    limit 10
  ), overloaded as (
    select m.user_id,p.full_name,
      coalesce(m.weekly_capacity_hours,c.default_weekly_hours,40)::numeric capacity_hours,
      coalesce(sum(case when t.status not in ('done','cancelled') then coalesce(t.estimated_minutes,0) else 0 end),0)::bigint planned_minutes
    from public.company_memberships m
    join public.profiles p on p.id=m.user_id
    left join public.company_work_settings c on c.company_id=m.company_id
    left join public.tasks t on t.company_id=m.company_id and t.owner_user_id=m.user_id
      and coalesce(t.due_at,t.start_at,now())>=date_trunc('week',now())
      and coalesce(t.start_at,t.due_at,now())<date_trunc('week',now())+interval '7 days'
      and app_private.can_view_task(t.id)
    where v_manage and m.company_id=p_company_id and m.status='active'
      and coalesce(m.lifecycle_stage,'active') not in ('offboarding','left','suspended')
    group by m.user_id,p.full_name,m.weekly_capacity_hours,c.default_weekly_hours
    having case when coalesce(m.weekly_capacity_hours,c.default_weekly_hours,40)>0
      then (coalesce(sum(case when t.status not in ('done','cancelled') then coalesce(t.estimated_minutes,0) else 0 end),0)/60.0)/coalesce(m.weekly_capacity_hours,c.default_weekly_hours,40)*100
      else 100 end >=90
    order by case when coalesce(m.weekly_capacity_hours,c.default_weekly_hours,40)>0
      then (coalesce(sum(case when t.status not in ('done','cancelled') then coalesce(t.estimated_minutes,0) else 0 end),0)/60.0)/coalesce(m.weekly_capacity_hours,c.default_weekly_hours,40)*100
      else 100 end desc
    limit 8
  )
  select jsonb_build_object(
    'timezone',v_tz,
    'today',v_today,
    'personal',jsonb_build_object(
      'open',count(*) filter(where status not in ('done','cancelled')),
      'due_today',count(*) filter(where status not in ('done','cancelled') and due_at is not null and (due_at at time zone v_tz)::date=v_today),
      'overdue',count(*) filter(where status not in ('done','cancelled') and due_at is not null and (due_at at time zone v_tz)::date<v_today),
      'blocked',count(*) filter(where status='blocked'),
      'reviews',count(*) filter(where status not in ('done','cancelled') and reviewer_user_id=v_uid),
      'approvals',count(*) filter(where status not in ('done','cancelled') and approver_user_id=v_uid),
      'upcoming',count(*) filter(where status not in ('done','cancelled') and due_at is not null and (due_at at time zone v_tz)::date>v_today and (due_at at time zone v_tz)::date<=v_today+7)
    ),
    'focus',coalesce((select jsonb_agg(jsonb_build_object(
      'id',f.id,'task_number',f.task_number,'title',f.title,'task_type',f.task_type,'status',f.status,'priority',f.priority,
      'project_id',f.project_id,'project_name',f.project_name,'owner_user_id',f.owner_user_id,'owner_name',f.owner_name,
      'reviewer_user_id',f.reviewer_user_id,'approver_user_id',f.approver_user_id,'start_at',f.start_at,'due_at',f.due_at,
      'estimated_minutes',f.estimated_minutes,'progress',f.progress,'risk',f.risk,
      'attention_role',case when f.approver_user_id=v_uid then 'approval' when f.reviewer_user_id=v_uid then 'review' else 'execution' end
    ) order by case when f.approver_user_id=v_uid then 0 when f.reviewer_user_id=v_uid then 1 else 2 end,
      case when f.due_at is not null and (f.due_at at time zone v_tz)::date<v_today then 0 else 1 end,
      coalesce((f.risk->>'score')::int,0) desc,f.due_at asc nulls last) from focus_rows f),'[]'::jsonb),
    'manager',jsonb_build_object(
      'enabled',v_manage,
      'unassigned',case when v_manage then (select count(*) from visible where status not in ('done','cancelled') and owner_user_id is null and not open_unassigned) else 0 end,
      'high_risk',case when v_manage then (select count(*) from visible where status not in ('done','cancelled') and coalesce((risk->>'score')::int,0)>=60) else 0 end,
      'attention',case when v_manage then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'task_number',x.task_number,'title',x.title,'status',x.status,'priority',x.priority,'owner_user_id',x.owner_user_id,'owner_name',x.owner_name,'due_at',x.due_at,'risk',x.risk)) from team_attention_rows x),'[]'::jsonb) else '[]'::jsonb end,
      'overloaded',case when v_manage then coalesce((select jsonb_agg(jsonb_build_object(
        'user_id',o.user_id,'name',o.full_name,'capacity_hours',o.capacity_hours,'planned_minutes',o.planned_minutes,
        'utilization',case when o.capacity_hours>0 then round((o.planned_minutes/60.0)/o.capacity_hours*100,1) else 100 end
      )) from overloaded o),'[]'::jsonb) else '[]'::jsonb end
    )
  ) into v_result
  from mine;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily team capacity plan. Capacity is derived from organization work settings,
-- member weekly capacity, approved leave, public holidays, and visible work.
-- Estimated effort is spread across the calendar span of each work item.
-- ---------------------------------------------------------------------------
create or replace function public.work_capacity_plan(
  p_company_id uuid,
  p_from date default current_date,
  p_days integer default 14
) returns jsonb
language plpgsql stable security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_days integer:=greatest(1,least(coalesce(p_days,14),42));
  v_work_days smallint[]:=coalesce((select work_days from public.company_work_settings where company_id=p_company_id),array[0,1,2,3,4]::smallint[]);
  v_tz text:=coalesce((select timezone from public.company_work_settings where company_id=p_company_id),'UTC');
  v_result jsonb;
begin
  if auth.uid() is null or not (app_private.has_company_permission(p_company_id,'tasks.view_workload') or app_private.has_company_permission(p_company_id,'tasks.manage')) then
    raise exception 'Workload permission required';
  end if;

  with days as (
    select d::date work_date from generate_series(p_from,p_from+(v_days-1),interval '1 day') d
  ), members as (
    select m.id membership_id,m.user_id,p.full_name,m.job_title,m.department,
      coalesce(m.weekly_capacity_hours,c.default_weekly_hours,40)::numeric weekly_capacity_hours,
      m.primary_site_id,coalesce(m.skills,array[]::text[]) skills
    from public.company_memberships m
    join public.profiles p on p.id=m.user_id
    left join public.company_work_settings c on c.company_id=m.company_id
    where m.company_id=p_company_id and m.status='active'
      and coalesce(m.lifecycle_stage,'active') not in ('offboarding','left','suspended')
  ), cells as (
    select m.membership_id,m.user_id,d.work_date,
      (extract(dow from d.work_date)::smallint=any(v_work_days)) is_work_day,
      exists(select 1 from public.company_work_settings c cross join lateral jsonb_array_elements(coalesce(c.holidays,'[]'::jsonb)) h(value)
        where c.company_id=p_company_id and nullif(h.value->>'date','')::date=d.work_date) holiday,
      exists(select 1 from public.member_leave_periods l where l.membership_id=m.membership_id and l.status='approved'
        and tstzrange(l.start_at,l.end_at,'[)') && tstzrange((d.work_date::timestamp at time zone v_tz),((d.work_date+1)::timestamp at time zone v_tz),'[)')) on_leave,
      case when cardinality(v_work_days)>0 then round(m.weekly_capacity_hours*60/cardinality(v_work_days))::integer else 0 end nominal_capacity_minutes,
      coalesce((select sum(
        case
          when coalesce(t.estimated_minutes,0)<=0 then 0
          else round(t.estimated_minutes::numeric/greatest(1,((coalesce(t.due_at,t.start_at) at time zone v_tz)::date-(coalesce(t.start_at,t.due_at) at time zone v_tz)::date)+1))
        end
      )::bigint
      from public.tasks t
      where t.company_id=p_company_id and t.status not in ('done','cancelled') and app_private.can_view_task(t.id)
        and (t.owner_user_id=m.user_id or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=m.user_id))
        and coalesce(t.start_at,t.due_at) is not null
        and d.work_date between (coalesce(t.start_at,t.due_at) at time zone v_tz)::date and (coalesce(t.due_at,t.start_at) at time zone v_tz)::date
      ),0)::bigint planned_minutes,
      coalesce((select count(*) from public.tasks t
      where t.company_id=p_company_id and t.status not in ('done','cancelled') and app_private.can_view_task(t.id)
        and (t.owner_user_id=m.user_id or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.user_id=m.user_id))
        and coalesce(t.start_at,t.due_at) is not null
        and d.work_date between (coalesce(t.start_at,t.due_at) at time zone v_tz)::date and (coalesce(t.due_at,t.start_at) at time zone v_tz)::date),0)::integer work_items
    from members m cross join days d
  )
  select jsonb_build_object(
    'timezone',v_tz,
    'from',p_from,
    'days',coalesce((select jsonb_agg(jsonb_build_object('date',d.work_date,'dow',extract(dow from d.work_date)::int) order by d.work_date) from days d),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(jsonb_build_object('membership_id',m.membership_id,'user_id',m.user_id,'name',m.full_name,'job_title',m.job_title,'department',m.department,'weekly_capacity_hours',m.weekly_capacity_hours,'primary_site_id',m.primary_site_id,'skills',m.skills) order by m.full_name) from members m),'[]'::jsonb),
    'cells',coalesce((select jsonb_agg(jsonb_build_object(
      'membership_id',c.membership_id,'user_id',c.user_id,'date',c.work_date,'is_work_day',c.is_work_day,'holiday',c.holiday,'on_leave',c.on_leave,
      'capacity_minutes',case when c.is_work_day and not c.holiday and not c.on_leave then c.nominal_capacity_minutes else 0 end,
      'planned_minutes',c.planned_minutes,'work_items',c.work_items,
      'utilization',case when c.is_work_day and not c.holiday and not c.on_leave and c.nominal_capacity_minutes>0 then round(c.planned_minutes::numeric/c.nominal_capacity_minutes*100,1) when c.planned_minutes>0 then 999 else 0 end
    ) order by c.user_id,c.work_date) from cells c),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dependency graph for visual planning. Every returned node and edge is filtered
-- by the caller's effective resource scope.
-- ---------------------------------------------------------------------------
create or replace function public.work_dependency_graph(
  p_company_id uuid,
  p_project_id uuid default null,
  p_include_done boolean default false,
  p_limit integer default 180
) returns jsonb
language plpgsql stable security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_limit integer:=greatest(20,least(coalesce(p_limit,180),300));v_result jsonb;
begin
  if auth.uid() is null or not app_private.has_company_permission(p_company_id,'tasks.view') then raise exception 'Permission denied'; end if;
  if p_project_id is not null and not exists(select 1 from public.projects p where p.id=p_project_id and p.company_id=p_company_id) then raise exception 'Project not found'; end if;

  with nodes0 as (
    select t.*,p.full_name owner_name,app_private.task_risk_snapshot(t.id) risk,
      (select count(*) from public.task_dependencies d join public.tasks n on n.id=d.blocked_task_id where d.blocker_task_id=t.id and app_private.can_view_task(n.id)) downstream_count,
      (select count(*) from public.task_dependencies d join public.tasks b on b.id=d.blocker_task_id where d.blocked_task_id=t.id and b.status not in ('done','cancelled') and app_private.can_view_task(b.id)) blocker_count
    from public.tasks t left join public.profiles p on p.id=t.owner_user_id
    where t.company_id=p_company_id and (p_project_id is null or t.project_id=p_project_id)
      and (p_include_done or t.status not in ('done','cancelled')) and app_private.can_view_task(t.id)
    order by coalesce((app_private.task_risk_snapshot(t.id)->>'score')::int,0) desc,t.due_at asc nulls last,t.created_at desc
    limit v_limit
  ), edges as (
    select d.id,d.blocker_task_id,d.blocked_task_id,d.dependency_type
    from public.task_dependencies d
    join nodes0 a on a.id=d.blocker_task_id
    join nodes0 b on b.id=d.blocked_task_id
    where d.company_id=p_company_id
  )
  select jsonb_build_object(
    'nodes',coalesce((select jsonb_agg(jsonb_build_object(
      'id',n.id,'task_number',n.task_number,'title',n.title,'status',n.status,'priority',n.priority,'task_type',n.task_type,
      'project_id',n.project_id,'owner_user_id',n.owner_user_id,'owner_name',n.owner_name,'start_at',n.start_at,'due_at',n.due_at,
      'estimated_minutes',n.estimated_minutes,'progress',n.progress,'risk',n.risk,'downstream_count',n.downstream_count,'blocker_count',n.blocker_count,
      'impact_score',least(100,coalesce((n.risk->>'score')::int,0)+least(n.downstream_count*8,40))
    )) from nodes0 n),'[]'::jsonb),
    'edges',coalesce((select jsonb_agg(to_jsonb(e)) from edges e),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reusable multi-step workflow templates.
-- Definition is intentionally version-light JSON so later releases can add a
-- draft/version layer without altering existing instances.
-- ---------------------------------------------------------------------------
create table if not exists public.work_workflow_templates(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  definition jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(jsonb_typeof(definition)='array')
);
create index if not exists work_workflow_templates_company_active_idx on public.work_workflow_templates(company_id,is_active,updated_at desc);
create index if not exists work_workflow_templates_created_by_idx on public.work_workflow_templates(created_by);
create index if not exists work_workflow_templates_updated_by_idx on public.work_workflow_templates(updated_by);
alter table public.work_workflow_templates enable row level security;
drop policy if exists work_workflow_templates_select on public.work_workflow_templates;
create policy work_workflow_templates_select on public.work_workflow_templates for select to authenticated
using(app_private.has_company_permission(company_id,'tasks.view'));

create or replace function public.save_work_workflow_template(p_payload jsonb)
returns uuid
language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_id uuid:=nullif(p_payload->>'id','')::uuid;
  v_company uuid:=nullif(p_payload->>'company_id','')::uuid;
  v_definition jsonb:=coalesce(p_payload->'definition','[]'::jsonb);
  v_existing uuid;
  v_step jsonb;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (app_private.has_company_permission(v_company,'tasks.manage_templates') or app_private.has_company_permission(v_company,'tasks.manage')) then raise exception 'Permission denied'; end if;
  if v_id is not null then select company_id into v_existing from public.work_workflow_templates where id=v_id; if v_existing is not null and v_existing<>v_company then raise exception 'Workflow template belongs to another company'; end if; end if;
  if char_length(trim(coalesce(p_payload->>'name','')))<2 then raise exception 'Workflow template name is required'; end if;
  if jsonb_typeof(v_definition)<>'array' then raise exception 'Workflow definition must be an array'; end if;
  v_count:=jsonb_array_length(v_definition);
  if v_count<1 or v_count>30 then raise exception 'Workflow template must contain between 1 and 30 steps'; end if;
  for v_step in select value from jsonb_array_elements(v_definition) loop
    if char_length(trim(coalesce(v_step->>'title','')))<2 then raise exception 'Every workflow step requires a title'; end if;
    if coalesce(v_step->>'task_type','task') not in ('task','review','approval','inspection','issue','follow_up') then raise exception 'Invalid workflow step type'; end if;
    if coalesce(v_step->>'priority','medium') not in ('low','medium','high','urgent') then raise exception 'Invalid workflow step priority'; end if;
    if coalesce(nullif(v_step->>'offset_days','')::integer,0)<0 or coalesce(nullif(v_step->>'offset_days','')::integer,0)>3650 then raise exception 'Invalid workflow step offset'; end if;
    if jsonb_typeof(coalesce(v_step->'depends_on','[]'::jsonb))<>'array' then raise exception 'Workflow depends_on must be an array'; end if;
  end loop;

  insert into public.work_workflow_templates(id,company_id,name,description,definition,is_active,created_by,updated_by)
  values(coalesce(v_id,gen_random_uuid()),v_company,trim(p_payload->>'name'),nullif(trim(p_payload->>'description'),''),v_definition,coalesce((p_payload->>'is_active')::boolean,true),auth.uid(),auth.uid())
  on conflict(id) do update set name=excluded.name,description=excluded.description,definition=excluded.definition,is_active=excluded.is_active,updated_by=auth.uid(),updated_at=now()
  where public.work_workflow_templates.company_id=v_company
  returning id into v_id;
  if v_id is null then raise exception 'Workflow template could not be saved'; end if;
  perform app_private.bump_work_runtime(v_company);
  return v_id;
end;
$$;

create or replace function public.instantiate_work_workflow_template(p_template_id uuid,p_context jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_template public.work_workflow_templates%rowtype;
  v_step jsonb;
  v_idx integer;
  v_dep jsonb;
  v_dep_idx integer;
  v_ids uuid[]:=array[]::uuid[];
  v_task_result jsonb;
  v_start timestamptz:=coalesce(nullif(p_context->>'start_at','')::timestamptz,now());
  v_project uuid:=nullif(p_context->>'project_id','')::uuid;
  v_site uuid:=nullif(p_context->>'site_id','')::uuid;
  v_folder uuid:=nullif(p_context->>'folder_id','')::uuid;
  v_document uuid:=nullif(p_context->>'document_id','')::uuid;
  v_owner uuid:=nullif(p_context->>'owner_user_id','')::uuid;
  v_offset integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_template from public.work_workflow_templates where id=p_template_id and is_active;
  if not found then raise exception 'Workflow template not found'; end if;
  if not app_private.has_company_permission(v_template.company_id,'tasks.create') then raise exception 'Create permission required'; end if;
  if not app_private.work_permission_for_row(v_template.company_id,'tasks.create',v_project,v_site,v_folder,v_document) then raise exception 'Permission denied for workflow target scope'; end if;
  if v_owner is not null and not (app_private.work_permission_for_row(v_template.company_id,'tasks.assign',v_project,v_site,v_folder,v_document) or app_private.work_permission_for_row(v_template.company_id,'tasks.manage',v_project,v_site,v_folder,v_document)) then raise exception 'Assignment permission required'; end if;

  v_idx:=0;
  for v_step in select value from jsonb_array_elements(v_template.definition) loop
    v_offset:=coalesce(nullif(v_step->>'offset_days','')::integer,0);
    v_task_result:=public.save_work_item(jsonb_strip_nulls(jsonb_build_object(
      'company_id',v_template.company_id,
      'title',v_step->>'title','description',nullif(v_step->>'description',''),
      'task_type',coalesce(v_step->>'task_type','task'),'priority',coalesce(v_step->>'priority','medium'),
      'project_id',v_project,'site_id',v_site,'folder_id',v_folder,'document_id',v_document,
      'start_at',v_start + make_interval(days=>v_offset),
      'due_at',v_start + make_interval(days=>v_offset+greatest(0,coalesce(nullif(v_step->>'duration_days','')::integer,0))),
      'estimated_minutes',greatest(0,coalesce(nullif(v_step->>'estimated_minutes','')::integer,0)),
      'required_skills',coalesce(v_step->'required_skills','[]'::jsonb),'labels',coalesce(v_step->'labels','[]'::jsonb),
      'owner_user_id',v_owner,'visibility','company','open_unassigned',false,
      'assignee_user_ids',case when v_owner is not null then jsonb_build_array(v_owner) else '[]'::jsonb end,
      'assignee_role_ids','[]'::jsonb,'watcher_user_ids','[]'::jsonb,'checklist',coalesce(v_step->'checklist','[]'::jsonb),
      'source_type','workflow_template','source_id',v_template.id
    )));
    v_ids:=array_append(v_ids,(v_task_result->>'id')::uuid);
    v_idx:=v_idx+1;
  end loop;

  v_idx:=0;
  for v_step in select value from jsonb_array_elements(v_template.definition) loop
    for v_dep in select value from jsonb_array_elements(coalesce(v_step->'depends_on','[]'::jsonb)) loop
      v_dep_idx:=(v_dep #>> '{}')::integer;
      if v_dep_idx<0 or v_dep_idx>=cardinality(v_ids) or v_dep_idx=v_idx then raise exception 'Invalid workflow dependency index'; end if;
      perform public.save_task_dependency(v_ids[v_dep_idx+1],v_ids[v_idx+1]);
    end loop;
    v_idx:=v_idx+1;
  end loop;

  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_template.company_id,auth.uid(),'workflow.instantiated','workflow_template',v_template.id,jsonb_build_object('task_ids',v_ids,'count',cardinality(v_ids)));
  perform app_private.bump_work_runtime(v_template.company_id);
  return jsonb_build_object('template_id',v_template.id,'task_ids',to_jsonb(v_ids),'count',cardinality(v_ids));
end;
$$;

-- ---------------------------------------------------------------------------
-- Richer automation conditions/actions + due-soon scheduled trigger.
-- ---------------------------------------------------------------------------
create or replace function app_private.work_automation_matches(p_task public.tasks,p_conditions jsonb)
returns boolean language sql stable
set search_path='public','app_private','pg_temp'
as $$
  select
    (coalesce(p_conditions->>'status','')='' or p_task.status::text=p_conditions->>'status') and
    (coalesce(p_conditions->>'priority','')='' or p_task.priority::text=p_conditions->>'priority') and
    (coalesce(p_conditions->>'task_type','')='' or p_task.task_type=p_conditions->>'task_type') and
    (coalesce(p_conditions->>'project_id','')='' or p_task.project_id=nullif(p_conditions->>'project_id','')::uuid) and
    (coalesce(p_conditions->>'risk_level','')='' or app_private.task_risk_snapshot(p_task.id)->>'level'=p_conditions->>'risk_level') and
    (coalesce(p_conditions->>'has_blockers','')='' or app_private.task_has_unfinished_blockers(p_task.id)=(p_conditions->>'has_blockers')::boolean);
$$;

create or replace function public.save_work_automation_rule(p_payload jsonb)
returns uuid language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_id uuid:=nullif(p_payload->>'id','')::uuid;v_company uuid:=nullif(p_payload->>'company_id','')::uuid;v_existing_company uuid;v_conditions jsonb:=coalesce(p_payload->'conditions','{}'::jsonb);v_actions jsonb:=coalesce(p_payload->'actions','[]'::jsonb);v_project uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_id is not null then select company_id into v_existing_company from public.work_automation_rules where id=v_id; if v_existing_company is not null and v_existing_company<>v_company then raise exception 'Automation rule belongs to another company'; end if; end if;
  if not (app_private.has_company_permission(v_company,'tasks.manage_automations') or app_private.has_company_permission(v_company,'tasks.manage')) then raise exception 'Permission denied'; end if;
  if coalesce(p_payload->>'trigger_type','') not in ('task.created','task.status_changed','task.overdue','task.due_soon') then raise exception 'Unsupported automation trigger'; end if;
  if jsonb_typeof(v_conditions)<>'object' then raise exception 'Automation conditions must be an object'; end if;
  if exists(select 1 from jsonb_object_keys(v_conditions) k where k not in ('status','priority','task_type','project_id','risk_level','has_blockers')) then raise exception 'Unsupported automation condition'; end if;
  if jsonb_typeof(v_actions)<>'array' or jsonb_array_length(v_actions)=0 then raise exception 'Automation actions must be a non-empty array'; end if;
  if exists(select 1 from jsonb_array_elements(v_actions) a where jsonb_typeof(a)<>'object' or coalesce(a->>'type','') not in ('notify_owner','notify_manager','notify_reviewer','notify_approver','notify_watchers','set_priority')) then raise exception 'Unsupported automation action'; end if;
  if exists(select 1 from jsonb_array_elements(v_actions) a where a->>'type'='set_priority' and coalesce(a->>'priority','') not in ('low','medium','high','urgent')) then raise exception 'Invalid automation priority'; end if;
  if coalesce(v_conditions->>'status','')<>'' then perform (v_conditions->>'status')::public.task_status; end if;
  if coalesce(v_conditions->>'priority','')<>'' then perform (v_conditions->>'priority')::public.task_priority; end if;
  if coalesce(v_conditions->>'task_type','')<>'' and v_conditions->>'task_type' not in ('task','review','approval','inspection','issue','follow_up') then raise exception 'Invalid automation task type'; end if;
  if coalesce(v_conditions->>'risk_level','')<>'' and v_conditions->>'risk_level' not in ('low','medium','high','critical') then raise exception 'Invalid risk level'; end if;
  if coalesce(v_conditions->>'has_blockers','')<>'' then perform (v_conditions->>'has_blockers')::boolean; end if;
  v_project:=nullif(v_conditions->>'project_id','')::uuid;
  if v_project is not null and (not exists(select 1 from public.projects p where p.id=v_project and p.company_id=v_company) or not app_private.resource_permission_for_row(v_company,'tasks.view',v_project,null,null,null)) then raise exception 'Invalid automation project scope'; end if;
  insert into public.work_automation_rules(id,company_id,name,trigger_type,conditions,actions,is_active,created_by,updated_by)
  values(coalesce(v_id,gen_random_uuid()),v_company,trim(p_payload->>'name'),p_payload->>'trigger_type',v_conditions,v_actions,coalesce((p_payload->>'is_active')::boolean,true),auth.uid(),auth.uid())
  on conflict(id) do update set name=excluded.name,trigger_type=excluded.trigger_type,conditions=excluded.conditions,actions=excluded.actions,is_active=excluded.is_active,updated_by=auth.uid(),updated_at=now()
  where public.work_automation_rules.company_id=v_company returning id into v_id;
  if v_id is null then raise exception 'Automation rule could not be saved'; end if;
  perform app_private.bump_work_runtime(v_company);return v_id;
end;
$$;

create or replace function app_private.execute_work_automations(p_task_id uuid,p_trigger_type text,p_actor_id uuid default null)
returns integer language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_task public.tasks%rowtype;r public.work_automation_rules%rowtype;a jsonb;v_key text;v_count integer:=0;v_manager uuid;v_inserted bigint;
  v_original_sub text:=coalesce(current_setting('request.jwt.claim.sub',true),'');v_old_priority public.task_priority;v_target uuid;v_watcher record;
begin
  select * into v_task from public.tasks where id=p_task_id;if not found then return 0;end if;
  for r in select * from public.work_automation_rules where company_id=v_task.company_id and trigger_type=p_trigger_type and is_active order by created_at,id loop
    if not app_private.work_automation_matches(v_task,r.conditions) then continue; end if;
    v_key:=p_task_id::text||':'||p_trigger_type||':'||case when p_trigger_type in ('task.overdue','task.due_soon') then current_date::text else coalesce(v_task.lock_version,1)::text end;
    v_inserted:=null;
    insert into public.work_automation_runs(company_id,rule_id,entity_type,entity_id,trigger_type,dedupe_key,status)
    values(v_task.company_id,r.id,'task',p_task_id,p_trigger_type,v_key,'skipped') on conflict(rule_id,dedupe_key) do nothing returning id into v_inserted;
    if v_inserted is null then continue;end if;
    begin
      for a in select value from jsonb_array_elements(r.actions) loop
        v_target:=null;
        if a->>'type'='notify_owner' then v_target:=v_task.owner_user_id;
        elsif a->>'type'='notify_reviewer' then v_target:=v_task.reviewer_user_id;
        elsif a->>'type'='notify_approver' then v_target:=v_task.approver_user_id;
        elsif a->>'type'='notify_manager' then select manager_user_id into v_target from public.company_memberships where company_id=v_task.company_id and user_id=v_task.owner_user_id and status='active' limit 1;
        end if;
        if v_target is not null and a->>'type' in ('notify_owner','notify_manager','notify_reviewer','notify_approver')
          and app_private.user_has_resource_permission(v_target,v_task.company_id,'tasks.view',v_task.project_id,v_task.site_id,v_task.folder_id,null) then
          insert into public.notifications(company_id,user_id,type,title_ar,title_en,body_ar,body_en,entity_type,entity_id)
          values(v_task.company_id,v_target,case when a->>'type'='notify_manager' then 'work_escalation' else 'work_automation' end,
            coalesce(a->>'title_ar','تنبيه عمل'),coalesce(a->>'title_en','Work alert'),v_task.title,v_task.title,'task',p_task_id);
        elsif a->>'type'='notify_watchers' then
          for v_watcher in select w.user_id from public.task_watchers w where w.task_id=p_task_id loop
            if app_private.user_has_resource_permission(v_watcher.user_id,v_task.company_id,'tasks.view',v_task.project_id,v_task.site_id,v_task.folder_id,null) then
              insert into public.notifications(company_id,user_id,type,title_ar,title_en,body_ar,body_en,entity_type,entity_id)
              values(v_task.company_id,v_watcher.user_id,'work_automation',coalesce(a->>'title_ar','تنبيه عمل'),coalesce(a->>'title_en','Work alert'),v_task.title,v_task.title,'task',p_task_id);
            end if;
          end loop;
        elsif a->>'type'='set_priority' then
          if coalesce(a->>'priority','') not in ('low','medium','high','urgent') then raise exception 'Invalid automation priority'; end if;
          if not (app_private.user_has_resource_permission(r.created_by,v_task.company_id,'tasks.manage',v_task.project_id,v_task.site_id,v_task.folder_id,null) or app_private.user_has_resource_permission(r.created_by,v_task.company_id,'tasks.edit',v_task.project_id,v_task.site_id,v_task.folder_id,null)) then raise exception 'Automation authority no longer has permission for this work scope';end if;
          v_old_priority:=v_task.priority;perform set_config('request.jwt.claim.sub',r.created_by::text,true);
          update public.tasks set priority=(a->>'priority')::public.task_priority,updated_by=r.created_by where id=p_task_id and priority<>(a->>'priority')::public.task_priority;
          perform set_config('request.jwt.claim.sub',v_original_sub,true);
          if v_old_priority<>(a->>'priority')::public.task_priority then
            insert into public.task_events(company_id,task_id,actor_id,event_type,metadata) values(v_task.company_id,p_task_id,r.created_by,'task.updated',jsonb_build_object('automation_rule_id',r.id,'field','priority','from',v_old_priority,'to',a->>'priority'));
            insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(v_task.company_id,r.created_by,'task.updated','task',p_task_id,jsonb_build_object('automation_rule_id',r.id,'field','priority','from',v_old_priority,'to',a->>'priority'));
            v_task.priority:=(a->>'priority')::public.task_priority;
          end if;
        end if;
      end loop;
      update public.work_automation_runs set status='succeeded',result=jsonb_build_object('actions',jsonb_array_length(r.actions)),error_text=null where id=v_inserted;v_count:=v_count+1;
    exception when others then perform set_config('request.jwt.claim.sub',v_original_sub,true);update public.work_automation_runs set status='failed',error_text=left(sqlerrm,2000),result=jsonb_build_object('actions',jsonb_array_length(r.actions)) where id=v_inserted;end;
  end loop;
  perform set_config('request.jwt.claim.sub',v_original_sub,true);if v_count>0 then perform app_private.bump_work_runtime(v_task.company_id);end if;return v_count;
end;
$$;

-- Scheduler extension: keep overdue behavior and add a once-per-day due-soon pass.
create or replace function app_private.work_scheduler_tick_internal(p_until timestamptz default (now()+interval '45 days'))
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare c record;v_recurring integer:=0;v_overdue integer:=0;v_due_soon integer:=0;t record;v_owner uuid;v_original_sub text:=coalesce(current_setting('request.jwt.claim.sub',true),'');v_skipped integer:=0;v_failed integer:=0;
begin
  for c in select id from public.companies where app_private.company_is_operational(id) loop
    begin
      v_owner:=null;
      select m.user_id into v_owner from public.company_memberships m join public.roles r on r.id=m.role_id
      where m.company_id=c.id and m.status='active' and r.slug='owner' and coalesce(m.lifecycle_stage,'active') not in ('offboarding','left','suspended') order by m.created_at limit 1;
      if v_owner is null then v_skipped:=v_skipped+1;continue;end if;
      perform set_config('request.jwt.claim.sub',v_owner::text,true);
      v_recurring:=v_recurring+app_private.materialize_company_recurring_tasks(c.id,p_until);
      for t in select id from public.tasks where company_id=c.id and status not in ('done','cancelled') and due_at<now() loop v_overdue:=v_overdue+app_private.execute_work_automations(t.id,'task.overdue',null);end loop;
      for t in select id from public.tasks where company_id=c.id and status not in ('done','cancelled') and due_at>=now() and due_at<now()+interval '24 hours' loop v_due_soon:=v_due_soon+app_private.execute_work_automations(t.id,'task.due_soon',null);end loop;
    exception when others then v_failed:=v_failed+1;end;
  end loop;
  perform set_config('request.jwt.claim.sub',v_original_sub,true);
  return jsonb_build_object('recurring_created',v_recurring,'overdue_automations',v_overdue,'due_soon_automations',v_due_soon,'companies_skipped',v_skipped,'companies_failed',v_failed,'ran_at',now());
end;
$$;

-- Updated-at and runtime propagation for workflow templates.
drop trigger if exists work_workflow_templates_updated_at on public.work_workflow_templates;
create trigger work_workflow_templates_updated_at before update on public.work_workflow_templates for each row execute function public.set_updated_at();
drop trigger if exists work_runtime_bump_work_workflow_templates on public.work_workflow_templates;
create trigger work_runtime_bump_work_workflow_templates after insert or update or delete on public.work_workflow_templates for each row execute function app_private.work_runtime_trigger();

-- Least privilege Data API surface.
grant select on public.work_workflow_templates to authenticated;
revoke insert,update,delete,truncate,references,trigger on public.work_workflow_templates from anon,authenticated;
revoke all on function public.work_cockpit_snapshot(uuid) from public,anon;
revoke all on function public.work_capacity_plan(uuid,date,integer) from public,anon;
revoke all on function public.work_dependency_graph(uuid,uuid,boolean,integer) from public,anon;
revoke all on function public.save_work_workflow_template(jsonb) from public,anon;
revoke all on function public.instantiate_work_workflow_template(uuid,jsonb) from public,anon;
grant execute on function public.work_cockpit_snapshot(uuid) to authenticated;
grant execute on function public.work_capacity_plan(uuid,date,integer) to authenticated;
grant execute on function public.work_dependency_graph(uuid,uuid,boolean,integer) to authenticated;
grant execute on function public.save_work_workflow_template(jsonb) to authenticated;
grant execute on function public.instantiate_work_workflow_template(uuid,jsonb) to authenticated;

-- Existing automation RPCs remain authenticated-only; internal helpers remain private.
revoke all on function public.save_work_automation_rule(jsonb) from public,anon;
grant execute on function public.save_work_automation_rule(jsonb) to authenticated;
revoke all on function app_private.execute_work_automations(uuid,text,uuid) from public,anon,authenticated;
revoke all on function app_private.work_scheduler_tick_internal(timestamptz) from public,anon,authenticated;
