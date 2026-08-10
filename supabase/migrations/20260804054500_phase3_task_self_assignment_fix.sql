create or replace function public.create_task(
  p_company_id uuid,p_title text,p_description text default null,p_priority public.task_priority default 'medium',
  p_project_id uuid default null,p_site_id uuid default null,p_folder_id uuid default null,p_document_id uuid default null,
  p_start_at timestamptz default null,p_due_at timestamptz default null,p_visibility public.task_visibility default 'company',
  p_open_unassigned boolean default false,p_assignee_user_ids uuid[] default array[]::uuid[],p_assignee_role_ids uuid[] default array[]::uuid[],
  p_checklist jsonb default '[]'::jsonb,p_recurrence public.task_recurrence_frequency default 'none',p_recurrence_interval integer default 1,p_recurrence_ends_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task uuid;v_series uuid;v_user uuid;v_role uuid;v_occ timestamptz:=coalesce(p_start_at,p_due_at,now());
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app_private.company_is_operational(p_company_id) or not app_private.has_company_permission(p_company_id,'tasks.create') then raise exception 'Permission denied'; end if;
  if char_length(trim(p_title))<2 then raise exception 'Task title is required'; end if;
  if p_due_at is not null and p_start_at is not null and p_due_at<p_start_at then raise exception 'Due date must be after start date'; end if;
  if p_visibility='private' and (p_open_unassigned or cardinality(p_assignee_user_ids)>0 or cardinality(p_assignee_role_ids)>0) then raise exception 'Private tasks cannot be assigned'; end if;
  if (cardinality(p_assignee_role_ids)>0 or exists(select 1 from unnest(coalesce(p_assignee_user_ids,array[]::uuid[])) u where u<>auth.uid())) and not app_private.has_company_permission(p_company_id,'tasks.assign') then raise exception 'Permission denied'; end if;
  if p_open_unassigned and p_visibility<>'company' then raise exception 'Open tasks must be visible to the company'; end if;
  if p_recurrence<>'none' then
    insert into public.task_series(company_id,title,description,priority,visibility,project_id,site_id,folder_id,document_id,frequency,recurrence_interval,next_start_at,next_due_at,ends_at,checklist_template,open_unassigned,created_by)
    values(p_company_id,trim(p_title),nullif(trim(p_description),''),p_priority,p_visibility,p_project_id,p_site_id,p_folder_id,p_document_id,p_recurrence,greatest(p_recurrence_interval,1),
      case when p_start_at is null then null else app_private.task_next_timestamp(p_start_at,p_recurrence,greatest(p_recurrence_interval,1)) end,
      case when p_due_at is null then app_private.task_next_timestamp(v_occ,p_recurrence,greatest(p_recurrence_interval,1)) else app_private.task_next_timestamp(p_due_at,p_recurrence,greatest(p_recurrence_interval,1)) end,
      p_recurrence_ends_at,coalesce(p_checklist,'[]'::jsonb),p_open_unassigned,auth.uid()) returning id into v_series;
    foreach v_user in array coalesce(p_assignee_user_ids,array[]::uuid[]) loop
      if not exists(select 1 from public.company_memberships m where m.company_id=p_company_id and m.user_id=v_user and m.status='active') then raise exception 'Assignee is not an active company member'; end if;
      insert into public.task_series_assignments(company_id,series_id,user_id,assigned_by) values(p_company_id,v_series,v_user,auth.uid());
    end loop;
    foreach v_role in array coalesce(p_assignee_role_ids,array[]::uuid[]) loop
      if not exists(select 1 from public.roles r where r.company_id=p_company_id and r.id=v_role) then raise exception 'Role belongs to another company'; end if;
      insert into public.task_series_assignments(company_id,series_id,role_id,assigned_by) values(p_company_id,v_series,v_role,auth.uid());
    end loop;
  end if;
  insert into public.tasks(company_id,series_id,occurrence_at,project_id,site_id,folder_id,document_id,title,description,priority,visibility,open_unassigned,start_at,due_at,created_by,updated_by)
  values(p_company_id,v_series,case when v_series is null then null else v_occ end,p_project_id,p_site_id,p_folder_id,p_document_id,trim(p_title),nullif(trim(p_description),''),p_priority,p_visibility,p_open_unassigned,p_start_at,p_due_at,auth.uid(),auth.uid()) returning id into v_task;
  if v_series is not null then perform app_private.copy_task_assignments(v_task,v_series,p_company_id,auth.uid());
  else
    foreach v_user in array coalesce(p_assignee_user_ids,array[]::uuid[]) loop
      if not exists(select 1 from public.company_memberships m where m.company_id=p_company_id and m.user_id=v_user and m.status='active') then raise exception 'Assignee is not an active company member'; end if;
      insert into public.task_assignments(company_id,task_id,user_id,assigned_by) values(p_company_id,v_task,v_user,auth.uid());
    end loop;
    foreach v_role in array coalesce(p_assignee_role_ids,array[]::uuid[]) loop
      if not exists(select 1 from public.roles r where r.company_id=p_company_id and r.id=v_role) then raise exception 'Role belongs to another company'; end if;
      insert into public.task_assignments(company_id,task_id,role_id,assigned_by) values(p_company_id,v_task,v_role,auth.uid());
    end loop;
  end if;
  perform app_private.copy_task_checklist(v_task,p_company_id,auth.uid(),p_checklist);
  insert into public.task_events(company_id,task_id,actor_id,event_type,metadata) values(p_company_id,v_task,auth.uid(),'task.created',jsonb_build_object('title',trim(p_title)));
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(p_company_id,auth.uid(),'task.created','task',v_task,jsonb_build_object('title',trim(p_title)));
  insert into public.notifications(company_id,user_id,type,title_ar,title_en,body_ar,body_en,entity_type,entity_id)
    select distinct p_company_id,m.user_id,'task.assigned','مهمة جديدة','New task',trim(p_title),trim(p_title),'task',v_task
    from public.company_memberships m left join public.task_assignments a on a.task_id=v_task and (a.user_id=m.user_id or a.role_id=m.role_id)
    where m.company_id=p_company_id and m.status='active' and m.user_id<>auth.uid() and a.id is not null;
  return v_task;
end; $$;;
