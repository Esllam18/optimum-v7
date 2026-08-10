-- Optimum 6.6.0 — Work & Delivery OS release closure.
-- Canonical final-state hardening after Tasks + Calendar + Activity integration.
-- This migration intentionally keeps browser-facing data access least-privilege:
-- read-heavy Work OS lists are RPC-backed; direct table access is granted only where the client reads tables explicitly.

-- ---------------------------------------------------------------------------
-- Leave-aware scheduling helpers and participant validation.
-- ---------------------------------------------------------------------------
create or replace function app_private.task_time_overlaps_approved_leave(
  p_membership_id uuid,
  p_start timestamptz,
  p_due timestamptz
) returns boolean
language sql stable security definer
set search_path='public','pg_temp'
as $$
  select exists(
    select 1
    from public.member_leave_periods l
    where l.membership_id=p_membership_id
      and l.status='approved'
      and tstzrange(l.start_at,l.end_at,'[)') &&
          tstzrange(
            coalesce(p_start,p_due,now()),
            case
              when coalesce(p_due,p_start) is null then coalesce(p_start,p_due,now())+interval '1 second'
              when coalesce(p_due,p_start)<=coalesce(p_start,p_due,now()) then coalesce(p_start,p_due,now())+interval '1 second'
              else coalesce(p_due,p_start)
            end,
            '[)'
          )
  );
$$;

create or replace function app_private.validate_task_participants()
returns trigger language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare u uuid; v_membership uuid;
begin
  foreach u in array array[new.owner_user_id,new.reviewer_user_id,new.approver_user_id] loop
    if u is null then continue; end if;
    v_membership:=null;
    select m.id into v_membership
    from public.company_memberships m
    where m.company_id=new.company_id and m.user_id=u and m.status='active'
      and coalesce(m.lifecycle_stage,'active') not in ('on_leave','offboarding','left','suspended');
    if v_membership is null then raise exception 'Work participant is not available'; end if;
    if app_private.task_time_overlaps_approved_leave(v_membership,new.start_at,new.due_at) then
      raise exception 'Work participant has approved leave during this work window';
    end if;
    if not app_private.user_has_resource_permission(u,new.company_id,'tasks.view',new.project_id,new.site_id,new.folder_id,null) then
      raise exception 'Work participant cannot access this work scope';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function app_private.validate_task_assignment_participant()
returns trigger language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare t public.tasks%rowtype; v_membership uuid;
begin
  select * into t from public.tasks where id=new.task_id;
  if not found or t.company_id<>new.company_id then raise exception 'Invalid task assignment scope'; end if;
  if new.user_id is not null then
    select m.id into v_membership
    from public.company_memberships m
    where m.company_id=t.company_id and m.user_id=new.user_id and m.status='active'
      and coalesce(m.lifecycle_stage,'active') not in ('on_leave','offboarding','left','suspended');
    if v_membership is null then raise exception 'Assignee is not available for work'; end if;
    if app_private.task_time_overlaps_approved_leave(v_membership,t.start_at,t.due_at) then
      raise exception 'Assignee has approved leave during this work window';
    end if;
    if not app_private.user_has_resource_permission(new.user_id,t.company_id,'tasks.view',t.project_id,t.site_id,t.folder_id,null) then
      raise exception 'Assignee cannot access this work scope';
    end if;
  elsif new.role_id is not null then
    if not exists(select 1 from public.roles r where r.id=new.role_id and r.company_id=t.company_id) then
      raise exception 'Assignment role belongs to another company';
    end if;
  else
    raise exception 'Task assignment requires a user or role';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dependency semantics and privacy.
-- Cancelled blockers release downstream work; direct dependency rows are only
-- visible if BOTH tasks are visible to the caller.
-- ---------------------------------------------------------------------------
create or replace function app_private.task_has_unfinished_blockers(p_task_id uuid)
returns boolean language sql stable security definer
set search_path='public','pg_temp'
as $$
  select exists(
    select 1
    from public.task_dependencies d
    join public.tasks b on b.id=d.blocker_task_id
    where d.blocked_task_id=p_task_id and b.status not in ('done','cancelled')
  );
$$;

drop policy if exists task_dependencies_select on public.task_dependencies;
create policy task_dependencies_select on public.task_dependencies
for select to authenticated
using(app_private.can_view_task(blocker_task_id) and app_private.can_view_task(blocked_task_id));

create or replace function app_private.task_risk_snapshot(p_task_id uuid)
returns jsonb language sql stable security definer
set search_path='public','app_private','pg_temp'
as $$
with t as (select * from public.tasks where id=p_task_id), x as (
  select t.*,
    (status not in ('done','cancelled') and due_at is not null and due_at<now()) overdue,
    (status='blocked') blocked,
    app_private.task_has_unfinished_blockers(id) dependency_blocked,
    (owner_user_id is null) no_owner,
    coalesce((
      select count(*)
      from public.task_dependencies d
      join public.tasks n on n.id=d.blocked_task_id
      where d.blocker_task_id=t.id and n.status not in ('done','cancelled')
        and app_private.can_view_task(n.id)
    ),0) downstream
  from t
), scored as (
  select x.*,least(100,
    (case when overdue then 35 else 0 end)+
    (case when blocked then 25 else 0 end)+
    (case when dependency_blocked then 20 else 0 end)+
    (case when no_owner then 20 else 0 end)+
    least(downstream*5,20)
  )::integer score
  from x
)
select jsonb_build_object(
  'score',score,
  'level',case when score>=85 then 'critical' when score>=60 then 'high' when score>=25 then 'medium' else 'low' end,
  'reasons',jsonb_strip_nulls(jsonb_build_object(
    'overdue',case when overdue then true end,
    'blocked',case when blocked then true end,
    'dependency_blocked',case when dependency_blocked then true end,
    'no_owner',case when no_owner then true end,
    'downstream',case when downstream>0 then downstream end
  ))
) from scored;
$$;

-- ---------------------------------------------------------------------------
-- Recurring work is generated by the backend scheduler, not by browser visits.
-- Unavailable/on-leave users are omitted from generated assignments so one bad
-- participant can never abort the scheduler transaction for the company.
-- ---------------------------------------------------------------------------
create or replace function app_private.copy_task_assignments(p_task_id uuid,p_series_id uuid,p_company_id uuid,p_actor uuid)
returns void language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  insert into public.task_assignments(company_id,task_id,user_id,role_id,assigned_by)
  select p_company_id,p_task_id,a.user_id,a.role_id,p_actor
  from public.task_series_assignments a
  join public.task_series s on s.id=a.series_id
  join public.tasks t on t.id=p_task_id
  where a.series_id=p_series_id
    and (
      a.user_id is null or (
        exists(
          select 1 from public.company_memberships m
          where m.company_id=p_company_id and m.user_id=a.user_id and m.status='active'
            and coalesce(m.lifecycle_stage,'active') not in ('on_leave','offboarding','left','suspended')
            and not app_private.task_time_overlaps_approved_leave(m.id,t.start_at,t.due_at)
        )
        and app_private.user_has_resource_permission(a.user_id,p_company_id,'tasks.view',s.project_id,s.site_id,s.folder_id,null)
      )
    )
  on conflict do nothing;
end;
$$;

create or replace function app_private.materialize_company_recurring_tasks(p_company_id uuid,p_until timestamptz default (now()+interval '45 days'))
returns integer language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare s public.task_series%rowtype;v_occ timestamptz;v_task uuid;v_count integer:=0;v_guard integer;v_owner uuid;
begin
  for s in
    select * from public.task_series
    where company_id=p_company_id and is_active
      and (ends_at is null or coalesce(next_start_at,next_due_at)<=ends_at)
      and coalesce(next_start_at,next_due_at)<=p_until
    for update skip locked
  loop
    v_guard:=0;
    while coalesce(s.next_start_at,s.next_due_at)<=p_until
      and (s.ends_at is null or coalesce(s.next_start_at,s.next_due_at)<=s.ends_at)
    loop
      v_guard:=v_guard+1; if v_guard>400 then exit; end if;
      v_occ:=coalesce(s.next_start_at,s.next_due_at);
      v_owner:=null;
      select a.user_id into v_owner
      from public.task_series_assignments a
      join public.company_memberships m
        on m.company_id=p_company_id and m.user_id=a.user_id and m.status='active'
       and coalesce(m.lifecycle_stage,'active') not in ('on_leave','offboarding','left','suspended')
      where a.series_id=s.id and a.user_id is not null
        and not app_private.task_time_overlaps_approved_leave(m.id,s.next_start_at,s.next_due_at)
        and app_private.user_has_resource_permission(a.user_id,p_company_id,'tasks.view',s.project_id,s.site_id,s.folder_id,null)
      order by a.created_at limit 1;

      v_task:=null;
      insert into public.tasks(
        company_id,series_id,occurrence_at,project_id,site_id,folder_id,document_id,title,description,
        priority,visibility,open_unassigned,start_at,due_at,created_by,updated_by,owner_user_id
      ) values(
        p_company_id,s.id,v_occ,s.project_id,s.site_id,s.folder_id,s.document_id,s.title,s.description,
        s.priority,s.visibility,s.open_unassigned,s.next_start_at,s.next_due_at,s.created_by,s.created_by,v_owner
      ) on conflict(series_id,occurrence_at) do nothing returning id into v_task;

      if v_task is not null then
        perform app_private.copy_task_assignments(v_task,s.id,p_company_id,s.created_by);
        perform app_private.copy_task_checklist(v_task,p_company_id,s.created_by,s.checklist_template);
        insert into public.task_events(company_id,task_id,actor_id,event_type,metadata)
          values(p_company_id,v_task,null,'task.recurrence_created',jsonb_build_object('series_id',s.id));
        v_count:=v_count+1;
      end if;

      s.next_start_at:=case when s.next_start_at is null then null else app_private.task_next_timestamp(s.next_start_at,s.frequency,s.recurrence_interval) end;
      s.next_due_at:=case when s.next_due_at is null then app_private.task_next_timestamp(v_occ,s.frequency,s.recurrence_interval) else app_private.task_next_timestamp(s.next_due_at,s.frequency,s.recurrence_interval) end;
      update public.task_series set next_start_at=s.next_start_at,next_due_at=s.next_due_at,updated_at=now() where id=s.id;
    end loop;
  end loop;
  if v_count>0 then perform app_private.bump_work_runtime(p_company_id); end if;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic Work Item editor. Omitted participant fields preserve existing values;
-- explicit participant changes require assignment permission. Optimistic lock
-- protects against overwriting another browser session.
-- ---------------------------------------------------------------------------
create or replace function public.save_work_item(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_id uuid:=nullif(p_payload->>'id','')::uuid;
  v_new boolean:=v_id is null;
  v_task public.tasks%rowtype;
  v_company uuid;
  v_project uuid;v_site uuid;v_folder uuid;v_document uuid;v_milestone uuid;
  v_owner uuid;v_reviewer uuid;v_approver uuid;
  v_assignees uuid[]:=array[]::uuid[];v_roles uuid[]:=array[]::uuid[];v_watchers uuid[]:=array[]::uuid[];
  v_title text;v_description text;v_task_type text;v_priority public.task_priority;v_visibility public.task_visibility;v_open boolean;
  v_start timestamptz;v_due timestamptz;v_sla timestamptz;
  v_estimated integer;v_actual integer;v_required_skills text[];v_labels text[];v_source_type text;v_source_id uuid;
  v_expected integer:=nullif(p_payload->>'expected_lock_version','')::integer;
  v_can_assign boolean;v_user uuid;v_role uuid;v_mid uuid;
  v_assignees_supplied boolean:=p_payload?'assignee_user_ids';
  v_roles_supplied boolean:=p_payload?'assignee_role_ids';
  v_watchers_supplied boolean:=p_payload?'watcher_user_ids';
  v_owner_supplied boolean:=p_payload?'owner_user_id';
  v_reviewer_supplied boolean:=p_payload?'reviewer_user_id';
  v_approver_supplied boolean:=p_payload?'approver_user_id';
  v_visibility_supplied boolean:=p_payload?'visibility';
  v_open_supplied boolean:=p_payload?'open_unassigned';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if v_new then
    v_company:=nullif(p_payload->>'company_id','')::uuid;
    v_project:=nullif(p_payload->>'project_id','')::uuid;
    v_site:=nullif(p_payload->>'site_id','')::uuid;
    v_folder:=nullif(p_payload->>'folder_id','')::uuid;
    v_document:=nullif(p_payload->>'document_id','')::uuid;
    v_title:=p_payload->>'title';v_description:=p_payload->>'description';
    v_priority:=coalesce(nullif(p_payload->>'priority','')::public.task_priority,'medium');
    v_visibility:=coalesce(nullif(p_payload->>'visibility','')::public.task_visibility,'company');
    v_open:=coalesce((p_payload->>'open_unassigned')::boolean,false);
    v_start:=nullif(p_payload->>'start_at','')::timestamptz;v_due:=nullif(p_payload->>'due_at','')::timestamptz;
    v_owner:=coalesce(nullif(p_payload->>'owner_user_id','')::uuid,auth.uid());
    v_reviewer:=nullif(p_payload->>'reviewer_user_id','')::uuid;v_approver:=nullif(p_payload->>'approver_user_id','')::uuid;
    v_assignees:=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'assignee_user_ids','[]'::jsonb))::uuid),array[]::uuid[]);
    v_roles:=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'assignee_role_ids','[]'::jsonb))::uuid),array[]::uuid[]);
    v_watchers:=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'watcher_user_ids','[]'::jsonb))::uuid),array[]::uuid[]);
    v_can_assign:=app_private.work_permission_for_row(v_company,'tasks.assign',v_project,v_site,v_folder,v_document)
      or app_private.work_permission_for_row(v_company,'tasks.manage',v_project,v_site,v_folder,v_document);
    if (v_open or v_owner<>auth.uid() or v_reviewer is not null or v_approver is not null or cardinality(v_assignees)>0 or cardinality(v_roles)>0 or cardinality(v_watchers)>0) and not v_can_assign then
      raise exception 'Assignment permission required for delegated participants';
    end if;
    if v_open then v_owner:=null; end if;
    v_id:=public.create_task(
      v_company,v_title,v_description,v_priority,v_project,v_site,v_folder,v_document,v_start,v_due,v_visibility,v_open,
      v_assignees,v_roles,coalesce(p_payload->'checklist','[]'::jsonb),
      coalesce(nullif(p_payload->>'recurrence','')::public.task_recurrence_frequency,'none'),
      coalesce(nullif(p_payload->>'recurrence_interval','')::integer,1),nullif(p_payload->>'recurrence_ends_at','')::timestamptz
    );
    select * into v_task from public.tasks where id=v_id for update;
  else
    select * into v_task from public.tasks where id=v_id for update;
    if not found or not app_private.can_edit_task(v_id) then raise exception 'Permission denied'; end if;
    if nullif(p_payload->>'company_id','')::uuid is not null and nullif(p_payload->>'company_id','')::uuid<>v_task.company_id then raise exception 'Work item belongs to another company'; end if;
    if v_expected is not null and v_task.lock_version<>v_expected then raise exception 'Work item changed in another session. Reload before saving'; end if;
    v_company:=v_task.company_id;
    v_project:=case when p_payload?'project_id' then nullif(p_payload->>'project_id','')::uuid else v_task.project_id end;
    v_site:=case when p_payload?'site_id' then nullif(p_payload->>'site_id','')::uuid else v_task.site_id end;
    v_folder:=case when p_payload?'folder_id' then nullif(p_payload->>'folder_id','')::uuid else v_task.folder_id end;
    v_document:=case when p_payload?'document_id' then nullif(p_payload->>'document_id','')::uuid else v_task.document_id end;
    v_title:=case when p_payload?'title' then p_payload->>'title' else v_task.title end;
    v_description:=case when p_payload?'description' then p_payload->>'description' else v_task.description end;
    v_priority:=case when p_payload?'priority' then (p_payload->>'priority')::public.task_priority else v_task.priority end;
    v_visibility:=case when v_visibility_supplied then (p_payload->>'visibility')::public.task_visibility else v_task.visibility end;
    v_open:=case when v_open_supplied then coalesce((p_payload->>'open_unassigned')::boolean,false) else v_task.open_unassigned end;
    v_start:=case when p_payload?'start_at' then nullif(p_payload->>'start_at','')::timestamptz else v_task.start_at end;
    v_due:=case when p_payload?'due_at' then nullif(p_payload->>'due_at','')::timestamptz else v_task.due_at end;
    v_owner:=case when v_owner_supplied then nullif(p_payload->>'owner_user_id','')::uuid else v_task.owner_user_id end;
    v_reviewer:=case when v_reviewer_supplied then nullif(p_payload->>'reviewer_user_id','')::uuid else v_task.reviewer_user_id end;
    v_approver:=case when v_approver_supplied then nullif(p_payload->>'approver_user_id','')::uuid else v_task.approver_user_id end;
    if v_assignees_supplied then
      v_assignees:=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'assignee_user_ids','[]'::jsonb))::uuid),array[]::uuid[]);
    else
      select coalesce(array_agg(a.user_id order by a.created_at) filter(where a.user_id is not null),array[]::uuid[]) into v_assignees from public.task_assignments a where a.task_id=v_id;
    end if;
    if v_roles_supplied then
      v_roles:=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'assignee_role_ids','[]'::jsonb))::uuid),array[]::uuid[]);
    else
      select coalesce(array_agg(a.role_id order by a.created_at) filter(where a.role_id is not null),array[]::uuid[]) into v_roles from public.task_assignments a where a.task_id=v_id;
    end if;
    if v_watchers_supplied then
      v_watchers:=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'watcher_user_ids','[]'::jsonb))::uuid),array[]::uuid[]);
    else
      select coalesce(array_agg(w.user_id order by w.created_at),array[]::uuid[]) into v_watchers from public.task_watchers w where w.task_id=v_id;
    end if;
    if not app_private.work_permission_for_row(v_company,case when app_private.has_company_permission(v_company,'tasks.manage') then 'tasks.manage' else 'tasks.edit' end,v_project,v_site,v_folder,v_document) then
      raise exception 'Permission denied for target work scope';
    end if;
    v_can_assign:=app_private.work_permission_for_row(v_company,'tasks.assign',v_project,v_site,v_folder,v_document)
      or app_private.work_permission_for_row(v_company,'tasks.manage',v_project,v_site,v_folder,v_document);
    if not v_can_assign and (
      (v_owner_supplied and v_owner is distinct from v_task.owner_user_id) or
      (v_reviewer_supplied and v_reviewer is distinct from v_task.reviewer_user_id) or
      (v_approver_supplied and v_approver is distinct from v_task.approver_user_id) or
      v_assignees_supplied or v_roles_supplied or v_watchers_supplied or
      (v_visibility_supplied and v_visibility<>v_task.visibility) or
      (v_open_supplied and v_open<>v_task.open_unassigned)
    ) then raise exception 'Assignment permission required to change work participants or visibility'; end if;
  end if;

  if char_length(trim(coalesce(v_title,'')))<2 then raise exception 'Task title is required'; end if;
  if v_due is not null and v_start is not null and v_due<v_start then raise exception 'Due date must be after start date'; end if;
  if v_open then
    v_owner:=null;
    if cardinality(v_assignees)>0 or cardinality(v_roles)>0 then raise exception 'Open work cannot have preassigned users or roles'; end if;
  end if;
  if v_visibility='private' then
    if v_open or cardinality(v_assignees)>0 or cardinality(v_roles)>0 or cardinality(v_watchers)>0 or v_reviewer is not null or v_approver is not null then
      raise exception 'Private work cannot delegate participants';
    end if;
    v_owner:=v_task.created_by;
  end if;

  foreach v_user in array array[v_owner,v_reviewer,v_approver] loop
    if v_user is null then continue; end if;
    v_mid:=null;
    select m.id into v_mid from public.company_memberships m
      where m.company_id=v_company and m.user_id=v_user and m.status='active'
        and coalesce(m.lifecycle_stage,'active') not in ('on_leave','offboarding','left','suspended');
    if v_mid is null then raise exception 'Work participant is not available'; end if;
    if app_private.task_time_overlaps_approved_leave(v_mid,v_start,v_due) then raise exception 'Work participant has approved leave during this work window'; end if;
    if not app_private.user_has_resource_permission(v_user,v_company,'tasks.view',v_project,v_site,v_folder,null) then raise exception 'Work participant cannot access this work scope'; end if;
  end loop;
  foreach v_user in array v_assignees loop
    v_mid:=null;
    select m.id into v_mid from public.company_memberships m
      where m.company_id=v_company and m.user_id=v_user and m.status='active'
        and coalesce(m.lifecycle_stage,'active') not in ('on_leave','offboarding','left','suspended');
    if v_mid is null then raise exception 'Assignee is not available for work'; end if;
    if app_private.task_time_overlaps_approved_leave(v_mid,v_start,v_due) then raise exception 'Assignee has approved leave during this work window'; end if;
    if not app_private.user_has_resource_permission(v_user,v_company,'tasks.view',v_project,v_site,v_folder,null) then raise exception 'Assignee cannot access this work scope'; end if;
  end loop;
  foreach v_role in array v_roles loop
    if not exists(select 1 from public.roles r where r.id=v_role and r.company_id=v_company) then raise exception 'Assignment role belongs to another company'; end if;
  end loop;
  foreach v_user in array v_watchers loop
    if not exists(select 1 from public.company_memberships m where m.company_id=v_company and m.user_id=v_user and m.status='active' and coalesce(m.lifecycle_stage,'active') not in ('offboarding','left','suspended')) then raise exception 'Watcher is not an active company member'; end if;
    if not app_private.user_has_resource_permission(v_user,v_company,'tasks.view',v_project,v_site,v_folder,null) then raise exception 'Watcher cannot access this work scope'; end if;
  end loop;

  v_milestone:=case when p_payload?'milestone_id' then nullif(p_payload->>'milestone_id','')::uuid else v_task.milestone_id end;
  if v_milestone is not null and not exists(
    select 1 from public.work_milestones m
    where m.id=v_milestone and m.company_id=v_company and (m.project_id is null or m.project_id=v_project)
  ) then raise exception 'Invalid milestone for work scope'; end if;

  v_task_type:=case when p_payload?'task_type' then p_payload->>'task_type' else v_task.task_type end;
  if v_task_type not in ('task','review','approval','inspection','issue','follow_up') then raise exception 'Invalid work item type'; end if;
  v_estimated:=case when p_payload?'estimated_minutes' then coalesce(nullif(p_payload->>'estimated_minutes','')::integer,0) else v_task.estimated_minutes end;
  v_actual:=case when p_payload?'actual_minutes' then coalesce(nullif(p_payload->>'actual_minutes','')::integer,0) else v_task.actual_minutes end;
  if v_estimated<0 or v_estimated>100000 or v_actual<0 or v_actual>100000 then raise exception 'Invalid work effort'; end if;
  v_required_skills:=case when p_payload?'required_skills' then coalesce(array(select jsonb_array_elements_text(p_payload->'required_skills')),array[]::text[]) else v_task.required_skills end;
  v_labels:=case when p_payload?'labels' then coalesce(array(select jsonb_array_elements_text(p_payload->'labels')),array[]::text[]) else v_task.labels end;
  v_sla:=case when p_payload?'sla_due_at' then nullif(p_payload->>'sla_due_at','')::timestamptz else v_task.sla_due_at end;
  v_source_type:=case when p_payload?'source_type' then nullif(trim(p_payload->>'source_type'),'') else v_task.source_type end;
  v_source_id:=case when p_payload?'source_id' then nullif(p_payload->>'source_id','')::uuid else v_task.source_id end;

  update public.tasks set
    title=trim(v_title),description=nullif(trim(v_description),''),priority=v_priority,task_type=v_task_type,
    project_id=v_project,site_id=v_site,folder_id=v_folder,document_id=v_document,milestone_id=v_milestone,
    start_at=v_start,due_at=v_due,sla_due_at=v_sla,visibility=v_visibility,open_unassigned=v_open,
    owner_user_id=v_owner,reviewer_user_id=v_reviewer,approver_user_id=v_approver,
    estimated_minutes=v_estimated,actual_minutes=v_actual,required_skills=v_required_skills,labels=v_labels,
    source_type=v_source_type,source_id=v_source_id,updated_by=auth.uid()
  where id=v_id;

  if v_new or v_assignees_supplied or v_roles_supplied then
    delete from public.task_assignments where task_id=v_id;
    foreach v_user in array v_assignees loop
      insert into public.task_assignments(company_id,task_id,user_id,assigned_by) values(v_company,v_id,v_user,auth.uid());
    end loop;
    foreach v_role in array v_roles loop
      insert into public.task_assignments(company_id,task_id,role_id,assigned_by) values(v_company,v_id,v_role,auth.uid());
    end loop;
  end if;
  if v_new or v_watchers_supplied then
    delete from public.task_watchers where task_id=v_id;
    foreach v_user in array v_watchers loop
      insert into public.task_watchers(company_id,task_id,user_id,created_by) values(v_company,v_id,v_user,auth.uid()) on conflict do nothing;
    end loop;
  end if;

  if not v_new then
    insert into public.task_events(company_id,task_id,actor_id,event_type,metadata) values(v_company,v_id,auth.uid(),'task.updated','{}'::jsonb);
    insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(v_company,auth.uid(),'task.updated','task',v_id,'{}'::jsonb);
  end if;
  perform app_private.bump_work_runtime(v_company);
  select * into v_task from public.tasks where id=v_id;
  return jsonb_build_object('id',v_id,'lock_version',v_task.lock_version);
end;
$$;

-- Task detail never reveals dependencies or milestones the caller cannot view.
create or replace function public.work_task_detail(p_task_id uuid)
returns jsonb language plpgsql stable security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_task public.tasks%rowtype;v_result jsonb;
begin
  select * into v_task from public.tasks where id=p_task_id;
  if not found or not app_private.can_view_task(p_task_id) then raise exception 'Permission denied'; end if;
  select jsonb_build_object(
    'task',to_jsonb(v_task),
    'risk',app_private.task_risk_snapshot(p_task_id),
    'capabilities',jsonb_build_object(
      'edit',app_private.can_edit_task(p_task_id),
      'complete',app_private.can_complete_task(p_task_id),
      'claim',v_task.open_unassigned and app_private.work_permission_for_row(v_task.company_id,'tasks.claim',v_task.project_id,v_task.site_id,v_task.folder_id,v_task.document_id),
      'comment',app_private.work_permission_for_row(v_task.company_id,'tasks.comment',v_task.project_id,v_task.site_id,v_task.folder_id,v_task.document_id),
      'attach',app_private.work_permission_for_row(v_task.company_id,'tasks.attach',v_task.project_id,v_task.site_id,v_task.folder_id,v_task.document_id),
      'assign',app_private.work_permission_for_row(v_task.company_id,'tasks.assign',v_task.project_id,v_task.site_id,v_task.folder_id,v_task.document_id)
        or app_private.work_permission_for_row(v_task.company_id,'tasks.manage',v_task.project_id,v_task.site_id,v_task.folder_id,v_task.document_id)
    ),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'user_id',a.user_id,'role_id',a.role_id,'assigned_by',a.assigned_by,'name',p.full_name,'role_name_ar',r.name_ar,'role_name_en',r.name_en)) from public.task_assignments a left join public.profiles p on p.id=a.user_id left join public.roles r on r.id=a.role_id where a.task_id=p_task_id),'[]'::jsonb),
    'watchers',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'user_id',w.user_id,'name',p.full_name)) from public.task_watchers w join public.profiles p on p.id=w.user_id where w.task_id=p_task_id),'[]'::jsonb),
    'checklist',coalesce((select jsonb_agg(to_jsonb(c) order by c.position,c.created_at) from public.task_checklist_items c where c.task_id=p_task_id),'[]'::jsonb),
    'comments',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('author_name',p.full_name) order by c.created_at) from public.task_comments c left join public.profiles p on p.id=c.author_id where c.task_id=p_task_id and c.deleted_at is null),'[]'::jsonb),
    'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.task_attachments a where a.task_id=p_task_id and a.upload_state='ready'),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from (select ev.*,p.full_name actor_name from public.task_events ev left join public.profiles p on p.id=ev.actor_id where ev.task_id=p_task_id order by ev.created_at desc limit 200) q),'[]'::jsonb),
    'blockers',coalesce((select jsonb_agg(jsonb_build_object('dependency_id',d.id,'id',b.id,'task_number',b.task_number,'title',b.title,'status',b.status,'due_at',b.due_at)) from public.task_dependencies d join public.tasks b on b.id=d.blocker_task_id where d.blocked_task_id=p_task_id and app_private.can_view_task(b.id)),'[]'::jsonb),
    'downstream',coalesce((select jsonb_agg(jsonb_build_object('dependency_id',d.id,'id',b.id,'task_number',b.task_number,'title',b.title,'status',b.status,'due_at',b.due_at)) from public.task_dependencies d join public.tasks b on b.id=d.blocked_task_id where d.blocker_task_id=p_task_id and app_private.can_view_task(b.id)),'[]'::jsonb),
    'milestone',(select to_jsonb(m) from public.work_milestones m where m.id=v_task.milestone_id and (m.project_id is null or app_private.resource_permission_for_row(m.company_id,'tasks.view',m.project_id,null,null,null)))
  ) into v_result;
  return v_result;
end;
$$;

-- Blocked work must explain why it is blocked.
create or replace function public.set_task_status(
  p_task_id uuid,p_status public.task_status,p_completion_note text default null,p_blocked_reason text default null,p_progress integer default null
) returns void language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_task public.tasks%rowtype;v_old public.task_status;
begin
  select * into v_task from public.tasks where id=p_task_id for update;
  if not found or not app_private.can_complete_task(p_task_id) then raise exception 'Permission denied'; end if;
  if p_status='blocked' and nullif(trim(coalesce(p_blocked_reason,'')),'') is null then raise exception 'Blocked status requires a reason'; end if;
  if p_status in ('in_progress','done') and app_private.task_has_unfinished_blockers(p_task_id) then raise exception 'Task is blocked by an unfinished dependency'; end if;
  if p_status='done' and v_task.task_type='approval' and not (app_private.has_company_permission(v_task.company_id,'tasks.approve') or app_private.has_company_permission(v_task.company_id,'tasks.manage')) then raise exception 'Approval permission required'; end if;
  v_old:=v_task.status;
  update public.tasks set
    status=p_status,
    progress=case when p_status='done' then 100 when p_progress is not null then least(greatest(p_progress,0),100) when p_status='todo' then 0 else progress end,
    blocked_reason=case when p_status='blocked' then nullif(trim(p_blocked_reason),'') else null end,
    completion_note=case when p_status='done' then nullif(trim(p_completion_note),'') else completion_note end,
    completed_at=case when p_status='done' then now() else null end,
    completed_by=case when p_status='done' then auth.uid() else null end,
    cancelled_at=case when p_status='cancelled' then now() else null end,
    updated_by=auth.uid()
  where id=p_task_id;
  insert into public.task_events(company_id,task_id,actor_id,event_type,from_status,to_status,metadata)
    values(v_task.company_id,p_task_id,auth.uid(),'task.status_changed',v_old,p_status,jsonb_build_object('completion_note',p_completion_note,'blocked_reason',p_blocked_reason));
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
    values(v_task.company_id,auth.uid(),'task.status_changed','task',p_task_id,jsonb_build_object('from',v_old,'to',p_status));
  perform app_private.notify_task_stakeholders(p_task_id,auth.uid(),'task_status_changed','تم تحديث حالة مهمة','Work status updated',v_task.title,v_task.title);
  perform app_private.bump_work_runtime(v_task.company_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Data API + execution privilege closure.
-- ---------------------------------------------------------------------------
revoke all privileges on table public.member_leave_periods,public.work_runtime_versions from anon,authenticated;
revoke all privileges on table public.task_dependencies,public.task_watchers,public.work_milestones,public.task_templates,public.work_automation_rules,public.work_automation_runs from anon;
revoke insert,update,delete on table public.task_dependencies,public.task_watchers,public.work_milestones,public.task_templates,public.work_automation_rules,public.work_automation_runs from authenticated;
grant select on table public.work_milestones,public.task_templates,public.work_automation_rules,public.work_automation_runs to authenticated;
-- Dependencies/watchers are returned by scoped RPCs; keep their raw tables out of the Data API surface.
revoke select on table public.task_dependencies,public.task_watchers from authenticated;

revoke all on function public.save_work_item(jsonb) from public,anon;
grant execute on function public.save_work_item(jsonb) to authenticated;
revoke all on function public.work_task_detail(uuid) from public,anon;
grant execute on function public.work_task_detail(uuid) to authenticated;
revoke all on function public.set_task_status(uuid,public.task_status,text,text,integer) from public,anon;
grant execute on function public.set_task_status(uuid,public.task_status,text,text,integer) to authenticated;

-- Internal executors are never browser APIs.
revoke all on function app_private.materialize_company_recurring_tasks(uuid,timestamptz) from public,anon,authenticated;
revoke all on function app_private.copy_task_assignments(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function app_private.task_time_overlaps_approved_leave(uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function app_private.task_risk_snapshot(uuid) from public,anon,authenticated;
revoke all on function app_private.execute_work_automations(uuid,text,uuid) from public,anon,authenticated;
revoke all on function app_private.work_scheduler_tick_internal(timestamptz) from public,anon,authenticated;

-- Re-create deterministic scheduler job. The browser never materializes recurrence.
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='optimum-work-scheduler') then
      perform cron.unschedule((select jobid from cron.job where jobname='optimum-work-scheduler' limit 1));
    end if;
    perform cron.schedule('optimum-work-scheduler','*/15 * * * *',$cmd$select app_private.work_scheduler_tick_internal(now()+interval '45 days');$cmd$);
  end if;
end $$;
