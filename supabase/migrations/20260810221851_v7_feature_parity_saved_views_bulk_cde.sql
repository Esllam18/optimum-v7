-- V7 feature parity tranche 17: restore saved work views and bounded CDE bulk operations.

create or replace function public.save_workspace_saved_view(
  p_company_id uuid,
  p_view_key text,
  p_name text,
  p_filters jsonb,
  p_is_default boolean default false,
  p_view_id uuid default null
)
returns public.workspace_saved_views
language plpgsql
set search_path='public','pg_temp'
as $$
declare result public.workspace_saved_views;
begin
  if not app_private.is_company_member(p_company_id) then raise exception 'Company membership required'; end if;
  if p_view_key not in ('team','roles','settings','organization','work.tasks','files.workspace') then raise exception 'Unsupported saved view'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 80 then raise exception 'Saved view name must be 2 to 80 characters'; end if;
  if jsonb_typeof(coalesce(p_filters,'{}'::jsonb))<>'object' then raise exception 'Saved view filters must be an object'; end if;
  if p_is_default then
    update public.workspace_saved_views
      set is_default=false,updated_at=now()
      where company_id=p_company_id and user_id=auth.uid() and view_key=p_view_key
        and (p_view_id is null or id<>p_view_id);
  end if;
  if p_view_id is null then
    insert into public.workspace_saved_views(company_id,user_id,view_key,name,filters,is_default)
      values(p_company_id,auth.uid(),p_view_key,trim(p_name),coalesce(p_filters,'{}'::jsonb),p_is_default)
      returning * into result;
  else
    update public.workspace_saved_views
      set name=trim(p_name),filters=coalesce(p_filters,'{}'::jsonb),is_default=p_is_default,updated_at=now()
      where id=p_view_id and company_id=p_company_id and user_id=auth.uid()
      returning * into result;
    if result.id is null then raise exception 'Saved view not found'; end if;
  end if;
  return result;
end $$;

create or replace function public.bulk_set_document_control_status(
  p_document_ids uuid[],
  p_status text,
  p_review_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select coalesce(array_agg(distinct x),array[]::uuid[]) into v_ids
    from unnest(coalesce(p_document_ids,array[]::uuid[])) x;
  if cardinality(v_ids)<1 then raise exception 'Select at least one document'; end if;
  if cardinality(v_ids)>100 then raise exception 'Bulk action limit is 100 documents'; end if;
  if p_status not in ('working','in_review','approved','rejected','superseded') then raise exception 'Invalid document control status'; end if;
  foreach v_id in array v_ids loop
    perform public.set_document_control_status(v_id,p_status,p_review_due_at);
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('ok',true,'count',v_count,'status',p_status);
end $$;

create or replace function public.bulk_trash_documents(p_document_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select coalesce(array_agg(distinct x),array[]::uuid[]) into v_ids
    from unnest(coalesce(p_document_ids,array[]::uuid[])) x;
  if cardinality(v_ids)<1 then raise exception 'Select at least one document'; end if;
  if cardinality(v_ids)>100 then raise exception 'Bulk action limit is 100 documents'; end if;
  foreach v_id in array v_ids loop
    perform public.trash_document(v_id);
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('ok',true,'count',v_count);
end $$;

revoke all on function public.save_workspace_saved_view(uuid,text,text,jsonb,boolean,uuid) from public,anon;
revoke all on function public.bulk_set_document_control_status(uuid[],text,timestamptz) from public,anon;
revoke all on function public.bulk_trash_documents(uuid[]) from public,anon;
grant execute on function public.save_workspace_saved_view(uuid,text,text,jsonb,boolean,uuid) to authenticated;
grant execute on function public.bulk_set_document_control_status(uuid[],text,timestamptz) to authenticated;
grant execute on function public.bulk_trash_documents(uuid[]) to authenticated;
