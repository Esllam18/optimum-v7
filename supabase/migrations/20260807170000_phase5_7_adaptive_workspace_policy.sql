-- Phase 5.7 — Adaptive Workspace Policy-Driven UI
-- One server-side runtime policy for entitlements, effective permissions, limits and usage.

create or replace function public.workspace_runtime_policy(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_membership_id uuid;
  v_is_platform boolean := false;
  v_plan_id uuid;
  v_plan_code text;
  v_operational boolean := false;
  v_permissions jsonb := '[]'::jsonb;
  v_entitlements jsonb := '[]'::jsonb;
  v_limits record;
  v_active_members integer := 0;
  v_active_projects integer := 0;
  v_storage_bytes bigint := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  v_is_platform := app_private.is_platform_admin();
  if not v_is_platform and not app_private.is_company_member(p_company_id) then
    raise exception 'Company membership required';
  end if;

  select m.id into v_membership_id
  from public.company_memberships m
  where m.company_id = p_company_id
    and m.user_id = v_uid
    and m.status = 'active'
    and (m.access_starts_at is null or m.access_starts_at <= now())
    and (m.access_ends_at is null or m.access_ends_at > now())
  order by m.created_at
  limit 1;

  select cs.plan_id, sp.code
    into v_plan_id, v_plan_code
  from public.company_subscriptions cs
  join public.service_plans sp on sp.id = cs.plan_id
  where cs.company_id = p_company_id;

  v_operational := app_private.company_is_operational(p_company_id);

  if v_is_platform then
    select coalesce(jsonb_agg(p.key order by p.key), '[]'::jsonb)
      into v_permissions
    from public.permissions p
    where app_private.company_entitlement_enabled(p_company_id, p.entitlement_key);
  elsif v_membership_id is not null then
    select coalesce(jsonb_agg(ep.permission_key order by ep.permission_key), '[]'::jsonb)
      into v_permissions
    from app_private.member_effective_permission_keys(v_membership_id) ep;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'key', e.key,
      'module', e.module,
      'name_ar', e.name_ar,
      'name_en', e.name_en,
      'scope_mode', e.scope_mode,
      'enabled', app_private.company_entitlement_enabled(p_company_id, e.key),
      'source', case
        when o.entitlement_key is not null then 'company_override'
        when spe.entitlement_key is not null then 'plan'
        else 'unconfigured'
      end,
      'limits', coalesce(o.limits, spe.limits, '{}'::jsonb)
    ) order by e.module, e.sort_order, e.key
  ), '[]'::jsonb)
  into v_entitlements
  from public.entitlements e
  left join public.company_entitlement_overrides o
    on o.company_id = p_company_id and o.entitlement_key = e.key
  left join public.service_plan_entitlements spe
    on spe.plan_id = v_plan_id and spe.entitlement_key = e.key
  where e.is_active;

  select * into v_limits from app_private.effective_company_limits(p_company_id);

  select count(*) into v_active_members
  from public.company_memberships m
  where m.company_id = p_company_id and m.status = 'active';

  select count(*) into v_active_projects
  from public.projects p
  where p.company_id = p_company_id and p.archived_at is null;

  select coalesce(sum(v.size_bytes), 0) into v_storage_bytes
  from public.document_versions v
  where v.company_id = p_company_id and v.upload_state in ('uploading','ready');

  return jsonb_build_object(
    'company_id', p_company_id,
    'operational', v_operational,
    'platform_admin', v_is_platform,
    'plan_id', v_plan_id,
    'plan_code', v_plan_code,
    'permissions', v_permissions,
    'entitlements', v_entitlements,
    'limits', jsonb_build_object(
      'max_members', v_limits.max_members,
      'max_projects', v_limits.max_projects,
      'max_storage_bytes', v_limits.max_storage_bytes
    ),
    'usage', jsonb_build_object(
      'active_members', v_active_members,
      'active_projects', v_active_projects,
      'storage_bytes', v_storage_bytes
    )
  );
end;
$$;

revoke all on function public.workspace_runtime_policy(uuid) from public, anon;
grant execute on function public.workspace_runtime_policy(uuid) to authenticated, service_role;

-- Feature-only entitlement: file versioning must be enforced by the server, not only hidden in UI.
create or replace function public.begin_new_version_upload(
  p_document_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_change_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_doc public.documents%rowtype;
  v_ver uuid := gen_random_uuid();
  v_number integer;
  v_limit bigint;
  v_usage bigint;
  v_path text;
begin
  select * into v_doc from public.documents where id=p_document_id and state='active' for update;
  if not found then raise exception 'Document not found'; end if;
  if not app_private.has_company_permission(v_doc.company_id,'files.upload') then raise exception 'Permission denied'; end if;
  if not app_private.company_entitlement_enabled(v_doc.company_id,'feature.file_versioning') then raise exception 'File versioning is not enabled for this company'; end if;
  if p_size_bytes<=0 or p_size_bytes>1073741824 then raise exception 'Invalid file size'; end if;
  select max_storage_bytes into v_limit from app_private.effective_company_limits(v_doc.company_id);
  select coalesce(sum(size_bytes),0) into v_usage from public.document_versions where company_id=v_doc.company_id and upload_state in('uploading','ready');
  if v_limit is not null and v_usage+p_size_bytes>v_limit then raise exception 'Storage limit reached'; end if;
  select coalesce(max(version_number),0)+1 into v_number from public.document_versions where document_id=v_doc.id;
  v_path:=v_doc.company_id::text||'/'||v_doc.project_id::text||'/'||coalesce(v_doc.site_id::text,'project')||'/'||v_doc.id::text||'/'||v_ver::text||'/'||app_private.safe_storage_filename(p_original_filename);
  insert into public.document_versions(id,company_id,document_id,version_number,version_label,original_filename,storage_path,mime_type,size_bytes,change_note,uploaded_by)
  values(v_ver,v_doc.company_id,v_doc.id,v_number,'v'||v_number,p_original_filename,v_path,coalesce(nullif(p_mime_type,''),'application/octet-stream'),p_size_bytes,nullif(trim(p_change_note),''),auth.uid());
  return jsonb_build_object('document_id',v_doc.id,'version_id',v_ver,'version_number',v_number,'storage_bucket','company-files','storage_path',v_path);
end;
$$;

revoke all on function public.begin_new_version_upload(uuid,text,text,bigint,text) from public, anon;
grant execute on function public.begin_new_version_upload(uuid,text,text,bigint,text) to authenticated;
