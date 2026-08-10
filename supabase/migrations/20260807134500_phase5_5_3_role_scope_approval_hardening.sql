-- Phase 5.5.3 — Role scope + offboarding approval hardening.
-- Applied live as phase5_5_3_role_scope_approval_hardening.

create or replace function app_private.validate_role_snapshot(p_company_id uuid,p_role_id uuid,p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_permissions text[];v_slug text;v_color text;v_blocked text[];v_rule jsonb;v_scope_type text;v_effect text;v_permission text;v_target uuid;
begin
  select coalesce(array_agg(distinct value order by value),array[]::text[]) into v_permissions from jsonb_array_elements_text(coalesce(p_snapshot->'permission_keys','[]'::jsonb));
  if cardinality(v_permissions)=0 then raise exception 'Select at least one permission'; end if;
  if exists(select 1 from unnest(v_permissions) k left join public.permissions p on p.key=k where p.key is null) then raise exception 'Unknown permission key'; end if;
  if not app_private.can_delegate_permissions(p_company_id,v_permissions) then raise exception 'You cannot grant permissions that you do not hold'; end if;
  v_slug:=lower(trim(coalesce(p_snapshot->>'slug','')));
  if trim(coalesce(p_snapshot->>'name_ar',''))='' or trim(coalesce(p_snapshot->>'name_en',''))='' or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid role details'; end if;
  if exists(select 1 from public.roles r where r.company_id=p_company_id and r.slug=v_slug and (p_role_id is null or r.id<>p_role_id)) then raise exception 'Role slug already exists'; end if;
  v_color:=coalesce(nullif(p_snapshot->>'color',''),'#4f46e5'); if v_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid role color'; end if;
  if jsonb_typeof(coalesce(p_snapshot->'scope_rules','[]'::jsonb))<>'array' then raise exception 'Role scope rules must be an array'; end if;
  for v_rule in select * from jsonb_array_elements(coalesce(p_snapshot->'scope_rules','[]'::jsonb)) loop
    v_scope_type:=coalesce(nullif(v_rule->>'scope_type',''),'company'); v_effect:=coalesce(nullif(v_rule->>'effect',''),'allow'); v_permission:=nullif(v_rule->>'permission_key',''); v_target:=nullif(v_rule->>'target_id','')::uuid;
    if v_scope_type not in ('company','project','site','folder','drawing') then raise exception 'Invalid role scope type'; end if;
    if v_effect not in ('allow','deny') then raise exception 'Invalid role scope effect'; end if;
    if v_permission is not null then
      if not exists(select 1 from public.permissions where key=v_permission) then raise exception 'Invalid role scope permission'; end if;
      if not (v_permission=any(v_permissions)) then raise exception 'A role scope permission must also exist in the role'; end if;
      if not app_private.can_delegate_permissions(p_company_id,array[v_permission]) then raise exception 'You cannot delegate this role scope permission'; end if;
    end if;
    if v_scope_type='company' then
      if v_target is not null then raise exception 'Company role scope cannot have a target'; end if;
    else
      if v_target is null then raise exception 'Role scope target is required'; end if;
      if v_scope_type='project' and not exists(select 1 from public.projects x where x.id=v_target and x.company_id=p_company_id and x.archived_at is null) then raise exception 'Role project scope target must belong to the same company'; end if;
      if v_scope_type='site' and not exists(select 1 from public.sites x where x.id=v_target and x.company_id=p_company_id and x.archived_at is null) then raise exception 'Role site scope target must belong to the same company'; end if;
      if v_scope_type='folder' and not exists(select 1 from public.folders x where x.id=v_target and x.company_id=p_company_id and x.trashed_at is null) then raise exception 'Role folder scope target must belong to the same company'; end if;
      if v_scope_type='drawing' and not exists(select 1 from public.engineering_drawings x where x.id=v_target and x.company_id=p_company_id and x.archived_at is null) then raise exception 'Role drawing scope target must belong to the same company'; end if;
    end if;
  end loop;
  select coalesce(array_agg(k order by k),array[]::text[]) into v_blocked from unnest(v_permissions) k where not app_private.permission_entitlement_enabled(p_company_id,k);
  return jsonb_build_object('permission_keys',to_jsonb(v_permissions),'blocked_by_plan',to_jsonb(v_blocked));
end $function$;

create or replace function public.prepare_member_offboarding(p_membership_id uuid,p_transfer_to_membership_id uuid,p_options jsonb default '{"tasks":true,"custody":true}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare m public.company_memberships%rowtype;t public.company_memberships%rowtype;impact jsonb;plan public.offboarding_plans%rowtype;needs_approval boolean;
begin
  select * into m from public.company_memberships where id=p_membership_id for update;
  select * into t from public.company_memberships where id=p_transfer_to_membership_id and status='active';
  if m.id is null then raise exception 'Member not found'; end if;
  if m.status='left' or m.lifecycle_stage='left' then raise exception 'Member has already left'; end if;
  if t.id is null or m.company_id<>t.company_id or m.id=t.id then raise exception 'Invalid offboarding transfer target'; end if;
  if not (app_private.has_company_permission(m.company_id,'members.manage') or app_private.is_platform_admin()) then raise exception 'Permission denied'; end if;
  if jsonb_typeof(coalesce(p_options,'{}'::jsonb))<>'object' then raise exception 'Invalid offboarding options'; end if;
  if exists(select 1 from public.roles r where r.id=m.role_id and r.slug='owner') and (select count(*) from public.company_memberships mm join public.roles rr on rr.id=mm.role_id where mm.company_id=m.company_id and mm.status='active' and rr.slug='owner')<=1 then raise exception 'Transfer ownership before offboarding the last owner'; end if;
  if exists(select 1 from public.offboarding_plans p where p.membership_id=m.id and p.status in ('ready','pending_approval')) then raise exception 'An active offboarding plan already exists for this member'; end if;
  impact:=jsonb_build_object(
    'open_task_assignments',(select count(*) from public.task_assignments a join public.tasks task on task.id=a.task_id where a.user_id=m.user_id and task.status not in ('done','cancelled')),
    'claimed_tasks',(select count(*) from public.tasks where claimed_by=m.user_id and status not in ('done','cancelled')),
    'folders',(select count(*) from public.folders where company_id=m.company_id and created_by=m.user_id and trashed_at is null),
    'documents',(select count(*) from public.documents where company_id=m.company_id and created_by=m.user_id and state='active'),
    'drawings',(select count(*) from public.engineering_drawings where company_id=m.company_id and created_by=m.user_id and archived_at is null));
  needs_approval:=coalesce((select require_second_approval_offboarding from public.access_governance_settings where company_id=m.company_id),false);
  insert into public.offboarding_plans(company_id,membership_id,transfer_to_membership_id,options,impact,status,created_by) values(m.company_id,m.id,t.id,coalesce(p_options,'{}'::jsonb),impact,case when needs_approval then 'pending_approval' else 'ready' end,auth.uid()) returning * into plan;
  if needs_approval then insert into public.access_change_requests(company_id,request_type,entity_type,entity_id,payload,requested_by) values(m.company_id,'offboarding','offboarding_plan',plan.id,jsonb_build_object('impact',impact),auth.uid()); end if;
  update public.company_memberships set lifecycle_stage='offboarding',offboarding_started_at=coalesce(offboarding_started_at,now()),updated_at=now() where id=m.id;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(m.company_id,auth.uid(),'member.offboarding_prepared','company_membership',m.id,jsonb_build_object('plan_id',plan.id,'transfer_to',t.id,'requires_approval',needs_approval,'impact',impact));
  return jsonb_build_object('ok',true,'plan',to_jsonb(plan),'impact',impact,'requires_approval',needs_approval);
end $function$;

create or replace function public.execute_member_offboarding(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare plan public.offboarding_plans%rowtype;m public.company_memberships%rowtype;t public.company_memberships%rowtype;tasks_count integer:=0;custody_count integer:=0;
begin
  select * into plan from public.offboarding_plans where id=p_plan_id for update;
  if not found or plan.status not in ('ready','pending_approval') then raise exception 'Offboarding plan is not ready'; end if;
  if plan.status='pending_approval' and not exists(select 1 from public.access_change_requests r where r.entity_id=plan.id and r.request_type='offboarding' and r.status in ('approved','executed')) then raise exception 'Offboarding approval is required'; end if;
  if not (app_private.has_company_permission(plan.company_id,'members.manage') or app_private.is_platform_admin()) then raise exception 'Permission denied'; end if;
  select * into m from public.company_memberships where id=plan.membership_id for update;
  select * into t from public.company_memberships where id=plan.transfer_to_membership_id and status='active';
  if m.id is null or t.id is null or m.company_id<>plan.company_id or t.company_id<>plan.company_id or m.id=t.id then raise exception 'Offboarding members are unavailable'; end if;
  if m.status='left' then raise exception 'Member has already left'; end if;
  if exists(select 1 from public.roles r where r.id=m.role_id and r.slug='owner') and (select count(*) from public.company_memberships mm join public.roles rr on rr.id=mm.role_id where mm.company_id=m.company_id and mm.status='active' and rr.slug='owner')<=1 then raise exception 'Transfer ownership before offboarding the last owner'; end if;
  if coalesce((plan.options->>'tasks')::boolean,true) then
    insert into public.task_assignments(company_id,task_id,user_id,assigned_by) select a.company_id,a.task_id,t.user_id,auth.uid() from public.task_assignments a join public.tasks task on task.id=a.task_id where a.user_id=m.user_id and task.status not in ('done','cancelled') and not exists(select 1 from public.task_assignments x where x.task_id=a.task_id and x.user_id=t.user_id);
    get diagnostics tasks_count=row_count;
    delete from public.task_assignments a using public.tasks task where a.task_id=task.id and a.user_id=m.user_id and task.status not in ('done','cancelled');
    update public.tasks set claimed_by=t.user_id,updated_by=auth.uid(),updated_at=now() where claimed_by=m.user_id and status not in ('done','cancelled');
  end if;
  if coalesce((plan.options->>'custody')::boolean,true) then
    insert into public.resource_custody(company_id,entity_type,entity_id,custodian_user_id,assigned_by) select m.company_id,'folder',f.id,t.user_id,auth.uid() from public.folders f where f.company_id=m.company_id and f.created_by=m.user_id and f.trashed_at is null on conflict(entity_type,entity_id) do update set custodian_user_id=excluded.custodian_user_id,assigned_by=excluded.assigned_by,assigned_at=now();
    insert into public.resource_custody(company_id,entity_type,entity_id,custodian_user_id,assigned_by) select m.company_id,'document',d.id,t.user_id,auth.uid() from public.documents d where d.company_id=m.company_id and d.created_by=m.user_id and d.state='active' on conflict(entity_type,entity_id) do update set custodian_user_id=excluded.custodian_user_id,assigned_by=excluded.assigned_by,assigned_at=now();
    insert into public.resource_custody(company_id,entity_type,entity_id,custodian_user_id,assigned_by) select m.company_id,'drawing',d.id,t.user_id,auth.uid() from public.engineering_drawings d where d.company_id=m.company_id and d.created_by=m.user_id and d.archived_at is null on conflict(entity_type,entity_id) do update set custodian_user_id=excluded.custodian_user_id,assigned_by=excluded.assigned_by,assigned_at=now();
    select count(*) into custody_count from public.resource_custody where company_id=m.company_id and custodian_user_id=t.user_id;
  end if;
  update public.company_memberships set status='left',lifecycle_stage='left',left_at=now(),access_ends_at=coalesce(access_ends_at,now()),updated_at=now() where id=m.id;
  delete from public.member_role_addons where membership_id=m.id;
  delete from public.access_scope_rules where subject_type='membership' and subject_id=m.id;
  update public.offboarding_plans set status='executed',executed_by=auth.uid(),executed_at=now() where id=plan.id;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(m.company_id,auth.uid(),'member.offboarded','company_membership',m.id,jsonb_build_object('transfer_to',t.id,'tasks_transferred',tasks_count,'custody_records',custody_count,'plan_id',plan.id));
  return jsonb_build_object('ok',true,'tasks_transferred',tasks_count,'custody_records',custody_count);
end $function$;
