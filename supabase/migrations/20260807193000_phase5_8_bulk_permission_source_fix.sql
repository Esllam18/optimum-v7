-- Phase 5.8 Organization OS: align legacy bulk RPCs with the current private permission engine.
create or replace function public.bulk_set_member_role(p_membership_ids uuid[], p_role_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  item uuid;
  changed integer:=0;
  company_ids uuid[];
  target_company uuid;
  target_slug text;
begin
  if coalesce(array_length(p_membership_ids,1),0)=0 then raise exception 'Select at least one member'; end if;
  if array_length(p_membership_ids,1)>200 then raise exception 'Bulk action limit is 200 members'; end if;
  select company_id,slug into target_company,target_slug from public.roles where id=p_role_id;
  if target_company is null then raise exception 'Role not found'; end if;
  if target_slug='owner' then raise exception 'Owner role cannot be assigned through bulk action'; end if;
  select array_agg(distinct company_id) into company_ids from public.company_memberships where id=any(p_membership_ids);
  if coalesce(array_length(company_ids,1),0)<>1 or company_ids[1]<>target_company then raise exception 'Members and role must belong to one company'; end if;
  if not app_private.has_company_permission(target_company,'members.manage') then raise exception 'Member management permission required'; end if;
  foreach item in array p_membership_ids loop
    perform public.set_member_role(item,p_role_id);
    changed:=changed+1;
  end loop;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_company,auth.uid(),'members.bulk_role_changed','role',p_role_id,jsonb_build_object('membership_ids',p_membership_ids,'role_id',p_role_id,'count',changed));
  return jsonb_build_object('ok',true,'changed',changed,'role_id',p_role_id);
end $$;

create or replace function public.bulk_set_member_status(p_membership_ids uuid[], p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  item uuid;
  changed integer:=0;
  company_ids uuid[];
  target_status public.membership_status;
begin
  if coalesce(array_length(p_membership_ids,1),0)=0 then raise exception 'Select at least one member'; end if;
  if array_length(p_membership_ids,1)>200 then raise exception 'Bulk action limit is 200 members'; end if;
  begin target_status:=p_status::public.membership_status;
  exception when invalid_text_representation then raise exception 'Invalid membership status'; end;
  select array_agg(distinct company_id) into company_ids from public.company_memberships where id=any(p_membership_ids);
  if coalesce(array_length(company_ids,1),0)<>1 then raise exception 'All members must belong to one company'; end if;
  if not app_private.has_company_permission(company_ids[1],'members.manage') then raise exception 'Member management permission required'; end if;
  foreach item in array p_membership_ids loop
    perform public.set_member_status(item,target_status);
    changed:=changed+1;
  end loop;
  insert into public.audit_events(company_id,actor_id,action,entity_type,metadata)
  values(company_ids[1],auth.uid(),'members.bulk_status_changed','company_membership',jsonb_build_object('membership_ids',p_membership_ids,'status',target_status::text,'count',changed));
  return jsonb_build_object('ok',true,'changed',changed,'status',target_status::text);
end $$;

create or replace function public.bulk_restore_member_access(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  item jsonb;
  membership_id uuid;
  company_ids uuid[];
  changed integer:=0;
  restored_status public.membership_status;
begin
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'Nothing to restore'; end if;
  if jsonb_array_length(p_items)>200 then raise exception 'Bulk action limit is 200 members'; end if;
  select array_agg(distinct m.company_id) into company_ids
  from public.company_memberships m
  join jsonb_array_elements(p_items) x on m.id=(x->>'membership_id')::uuid;
  if coalesce(array_length(company_ids,1),0)<>1 then raise exception 'All members must belong to one company'; end if;
  if not app_private.has_company_permission(company_ids[1],'members.manage') then raise exception 'Member management permission required'; end if;
  for item in select value from jsonb_array_elements(p_items)
  loop
    membership_id := (item->>'membership_id')::uuid;
    if item ? 'role_id' and nullif(item->>'role_id','') is not null then perform public.set_member_role(membership_id,(item->>'role_id')::uuid); end if;
    if item ? 'status' and nullif(item->>'status','') is not null then
      begin restored_status := (item->>'status')::public.membership_status;
      exception when invalid_text_representation then raise exception 'Invalid membership status'; end;
      perform public.set_member_status(membership_id,restored_status);
    end if;
    changed:=changed+1;
  end loop;
  insert into public.audit_events(company_id,actor_id,action,entity_type,metadata)
  values(company_ids[1],auth.uid(),'members.bulk_undo','company_membership',jsonb_build_object('count',changed));
  return jsonb_build_object('ok',true,'changed',changed);
end $$;
