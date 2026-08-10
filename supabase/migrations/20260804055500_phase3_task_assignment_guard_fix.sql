create or replace function public.update_task(
  p_task_id uuid,p_title text,p_description text,p_priority public.task_priority,p_project_id uuid,p_site_id uuid,p_folder_id uuid,p_document_id uuid,
  p_start_at timestamptz,p_due_at timestamptz,p_visibility public.task_visibility,p_open_unassigned boolean,
  p_assignee_user_ids uuid[] default array[]::uuid[],p_assignee_role_ids uuid[] default array[]::uuid[]
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task public.tasks%rowtype;v_user uuid;v_role uuid;v_can_assign boolean;
begin
  select * into v_task from public.tasks where id=p_task_id for update;
  if not found or not app_private.can_edit_task(p_task_id) then raise exception 'Permission denied'; end if;
  v_can_assign:=app_private.has_company_permission(v_task.company_id,'tasks.assign') or app_private.has_company_permission(v_task.company_id,'tasks.manage');
  if v_can_assign and p_visibility='private' and (p_open_unassigned or cardinality(p_assignee_user_ids)>0 or cardinality(p_assignee_role_ids)>0) then raise exception 'Private tasks cannot be assigned'; end if;
  update public.tasks set title=trim(p_title),description=nullif(trim(p_description),''),priority=p_priority,project_id=p_project_id,site_id=p_site_id,folder_id=p_folder_id,document_id=p_document_id,start_at=p_start_at,due_at=p_due_at,visibility=case when v_can_assign then p_visibility else v_task.visibility end,open_unassigned=case when v_can_assign then p_open_unassigned else v_task.open_unassigned end,updated_by=auth.uid() where id=p_task_id;
  if v_can_assign then
    delete from public.task_assignments where task_id=p_task_id;
    foreach v_user in array coalesce(p_assignee_user_ids,array[]::uuid[]) loop
      if not exists(select 1 from public.company_memberships m where m.company_id=v_task.company_id and m.user_id=v_user and m.status='active') then raise exception 'Assignee is not an active company member'; end if;
      insert into public.task_assignments(company_id,task_id,user_id,assigned_by) values(v_task.company_id,p_task_id,v_user,auth.uid());
    end loop;
    foreach v_role in array coalesce(p_assignee_role_ids,array[]::uuid[]) loop
      if not exists(select 1 from public.roles r where r.company_id=v_task.company_id and r.id=v_role) then raise exception 'Role belongs to another company'; end if;
      insert into public.task_assignments(company_id,task_id,role_id,assigned_by) values(v_task.company_id,p_task_id,v_role,auth.uid());
    end loop;
  end if;
  insert into public.task_events(company_id,task_id,actor_id,event_type,metadata) values(v_task.company_id,p_task_id,auth.uid(),'task.updated','{}');
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(v_task.company_id,auth.uid(),'task.updated','task',p_task_id,'{}');
end; $$;;
