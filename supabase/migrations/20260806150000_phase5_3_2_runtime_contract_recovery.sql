begin;

-- Phase 5.3.2 package-recovery migration.
-- These functions exist on the connected Optimum database and are used by the
-- current browser bundles, but their original definitions were absent from the
-- exported migration chain. Keeping them here makes a fresh deployment and a
-- disaster-recovery restore reproduce the live runtime contract.

create schema if not exists app_private;

create or replace function app_private.effective_company_limits(p_company_id uuid)
returns table(max_members integer, max_projects integer, max_storage_bytes bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(cs.max_members_override, sp.max_members),
    coalesce(cs.max_projects_override, sp.max_projects),
    coalesce(cs.max_storage_bytes_override, sp.max_storage_bytes)
  from public.company_subscriptions cs
  join public.service_plans sp on sp.id = cs.plan_id
  where cs.company_id = p_company_id;
$$;

create or replace function app_private.notify_company_members(
  p_company_id uuid,
  p_actor_id uuid,
  p_type text,
  p_title_ar text,
  p_title_en text,
  p_body_ar text,
  p_body_en text,
  p_entity_type text,
  p_entity_id uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications(
    company_id,user_id,type,title_ar,title_en,body_ar,body_en,entity_type,entity_id
  )
  select
    p_company_id,m.user_id,p_type,p_title_ar,p_title_en,p_body_ar,p_body_en,p_entity_type,p_entity_id
  from public.company_memberships m
  where m.company_id = p_company_id
    and m.status = 'active'
    and m.user_id <> p_actor_id;
$$;

create or replace function app_private.safe_storage_filename(p_name text)
returns text
language sql
immutable
set search_path = pg_temp
as $$
  select left(
    regexp_replace(coalesce(nullif(trim(p_name),''),'file'),'[^a-zA-Z0-9._-]+','_','g'),
    180
  );
$$;

create or replace function public.company_storage_metrics(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'used_bytes',coalesce((select sum(size_bytes) from public.document_versions where company_id=p_company_id and upload_state='ready'),0),
    'uploading_bytes',coalesce((select sum(size_bytes) from public.document_versions where company_id=p_company_id and upload_state='uploading'),0),
    'document_count',(select count(*) from public.documents where company_id=p_company_id and state='active'),
    'version_count',(select count(*) from public.document_versions where company_id=p_company_id and upload_state='ready'),
    'max_storage_bytes',(select max_storage_bytes from app_private.effective_company_limits(p_company_id))
  )
  where app_private.has_company_permission(p_company_id,'files.view');
$$;

create or replace function public.create_folder(
  p_project_id uuid,
  p_site_id uuid,
  p_parent_id uuid,
  p_name text,
  p_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_id uuid;
begin
  select company_id into v_company
  from public.projects
  where id=p_project_id and archived_at is null;

  if v_company is null then raise exception 'Project not found'; end if;
  if not app_private.has_company_permission(v_company,'files.create_folder') then
    raise exception 'Permission denied';
  end if;

  insert into public.folders(company_id,project_id,site_id,parent_id,name,code,is_system,created_by)
  values(v_company,p_project_id,p_site_id,p_parent_id,trim(p_name),nullif(trim(p_code),''),false,auth.uid())
  returning id into v_id;

  perform app_private.notify_company_members(
    v_company,auth.uid(),'folder.created',
    'تم إنشاء مجلد جديد','A new folder was created',trim(p_name),trim(p_name),'folder',v_id
  );
  return v_id;
end;
$$;

create or replace function public.rename_folder(p_folder_id uuid,p_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_system boolean;
begin
  select company_id,is_system into v_company,v_system
  from public.folders
  where id=p_folder_id and trashed_at is null;

  if v_company is null then raise exception 'Folder not found'; end if;
  if v_system then raise exception 'System folders cannot be renamed'; end if;
  if not app_private.has_company_permission(v_company,'files.rename') then
    raise exception 'Permission denied';
  end if;

  update public.folders set name=trim(p_name) where id=p_folder_id;
  perform app_private.notify_company_members(
    v_company,auth.uid(),'folder.renamed',
    'تم تعديل اسم مجلد','A folder was renamed',trim(p_name),trim(p_name),'folder',p_folder_id
  );
end;
$$;

create or replace function public.move_folder(p_folder_id uuid,p_parent_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_folder public.folders%rowtype;
  v_parent public.folders%rowtype;
begin
  select * into v_folder
  from public.folders
  where id=p_folder_id and trashed_at is null;

  if not found then raise exception 'Folder not found'; end if;
  if v_folder.is_system then raise exception 'System folders cannot be moved'; end if;
  if not app_private.has_company_permission(v_folder.company_id,'files.move') then
    raise exception 'Permission denied';
  end if;

  if p_parent_id is not null then
    select * into v_parent
    from public.folders
    where id=p_parent_id and trashed_at is null;

    if not found
       or v_parent.project_id<>v_folder.project_id
       or v_parent.site_id is distinct from v_folder.site_id then
      raise exception 'Invalid destination';
    end if;

    if exists(
      with recursive d as (
        select id from public.folders where parent_id=p_folder_id
        union all
        select f.id from public.folders f join d on f.parent_id=d.id
      )
      select 1 from d where id=p_parent_id
    ) then
      raise exception 'Cannot move a folder inside itself';
    end if;
  end if;

  update public.folders set parent_id=p_parent_id where id=p_folder_id;
  perform app_private.notify_company_members(
    v_folder.company_id,auth.uid(),'folder.moved',
    'تم نقل مجلد','A folder was moved',v_folder.name,v_folder.name,'folder',p_folder_id
  );
end;
$$;

create or replace function public.begin_document_upload(
  p_folder_id uuid,
  p_display_name text,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_document_type text default 'general',
  p_description text default null,
  p_tags text[] default array[]::text[],
  p_change_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_folder public.folders%rowtype;
  v_doc uuid:=gen_random_uuid();
  v_ver uuid:=gen_random_uuid();
  v_limit bigint;
  v_usage bigint;
  v_path text;
begin
  select * into v_folder from public.folders where id=p_folder_id and trashed_at is null;
  if not found then raise exception 'Folder not found'; end if;
  if not app_private.has_company_permission(v_folder.company_id,'files.upload') then raise exception 'Permission denied'; end if;
  if p_size_bytes<=0 or p_size_bytes>1073741824 then raise exception 'Invalid file size'; end if;

  select max_storage_bytes into v_limit from app_private.effective_company_limits(v_folder.company_id);
  select coalesce(sum(size_bytes),0) into v_usage
  from public.document_versions
  where company_id=v_folder.company_id and upload_state in('uploading','ready');
  if v_limit is not null and v_usage+p_size_bytes>v_limit then raise exception 'Storage limit reached'; end if;

  v_path:=v_folder.company_id::text||'/'||v_folder.project_id::text||'/'||coalesce(v_folder.site_id::text,'project')||'/'||v_doc::text||'/'||v_ver::text||'/'||app_private.safe_storage_filename(p_original_filename);
  insert into public.documents(id,company_id,project_id,site_id,folder_id,display_name,document_type,description,tags,created_by)
  values(v_doc,v_folder.company_id,v_folder.project_id,v_folder.site_id,v_folder.id,trim(p_display_name),coalesce(nullif(trim(p_document_type),''),'general'),nullif(trim(p_description),''),coalesce(p_tags,array[]::text[]),auth.uid());
  insert into public.document_versions(id,company_id,document_id,version_number,version_label,original_filename,storage_path,mime_type,size_bytes,change_note,uploaded_by)
  values(v_ver,v_folder.company_id,v_doc,1,'v1',p_original_filename,v_path,coalesce(nullif(p_mime_type,''),'application/octet-stream'),p_size_bytes,nullif(trim(p_change_note),''),auth.uid());

  return jsonb_build_object('document_id',v_doc,'version_id',v_ver,'version_number',1,'storage_bucket','company-files','storage_path',v_path);
end;
$$;

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
set search_path = public, pg_temp
as $$
declare
  v_doc public.documents%rowtype;
  v_ver uuid:=gen_random_uuid();
  v_number integer;
  v_limit bigint;
  v_usage bigint;
  v_path text;
begin
  select * into v_doc from public.documents where id=p_document_id and state='active' for update;
  if not found then raise exception 'Document not found'; end if;
  if not app_private.has_company_permission(v_doc.company_id,'files.upload') then raise exception 'Permission denied'; end if;
  if p_size_bytes<=0 or p_size_bytes>1073741824 then raise exception 'Invalid file size'; end if;

  select max_storage_bytes into v_limit from app_private.effective_company_limits(v_doc.company_id);
  select coalesce(sum(size_bytes),0) into v_usage
  from public.document_versions
  where company_id=v_doc.company_id and upload_state in('uploading','ready');
  if v_limit is not null and v_usage+p_size_bytes>v_limit then raise exception 'Storage limit reached'; end if;

  select coalesce(max(version_number),0)+1 into v_number
  from public.document_versions where document_id=v_doc.id;
  v_path:=v_doc.company_id::text||'/'||v_doc.project_id::text||'/'||coalesce(v_doc.site_id::text,'project')||'/'||v_doc.id::text||'/'||v_ver::text||'/'||app_private.safe_storage_filename(p_original_filename);
  insert into public.document_versions(id,company_id,document_id,version_number,version_label,original_filename,storage_path,mime_type,size_bytes,change_note,uploaded_by)
  values(v_ver,v_doc.company_id,v_doc.id,v_number,'v'||v_number,p_original_filename,v_path,coalesce(nullif(p_mime_type,''),'application/octet-stream'),p_size_bytes,nullif(trim(p_change_note),''),auth.uid());

  return jsonb_build_object('document_id',v_doc.id,'version_id',v_ver,'version_number',v_number,'storage_bucket','company-files','storage_path',v_path);
end;
$$;

create or replace function public.finalize_document_upload(p_version_id uuid,p_checksum_sha256 text default null)
returns void
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_ver public.document_versions%rowtype;
  v_doc public.documents%rowtype;
begin
  select * into v_ver
  from public.document_versions
  where id=p_version_id and upload_state='uploading'
  for update;
  if not found then raise exception 'Upload reservation not found'; end if;

  select * into v_doc from public.documents where id=v_ver.document_id;
  if v_ver.uploaded_by<>auth.uid() and not app_private.has_company_permission(v_ver.company_id,'files.manage') then
    raise exception 'Permission denied';
  end if;
  if not exists(select 1 from storage.objects where bucket_id=v_ver.storage_bucket and name=v_ver.storage_path) then
    raise exception 'Uploaded object was not found';
  end if;

  update public.document_versions
  set upload_state='ready',checksum_sha256=nullif(p_checksum_sha256,''),finalized_at=now()
  where id=p_version_id;
  update public.documents
  set current_version_id=p_version_id,
      version_count=(select count(*) from public.document_versions where document_id=v_doc.id and upload_state='ready')
  where id=v_doc.id;

  perform app_private.notify_company_members(
    v_ver.company_id,auth.uid(),'document.version_ready',
    'تم رفع إصدار جديد','A new file version was uploaded',v_doc.display_name,v_doc.display_name,'document',v_doc.id
  );
end;
$$;

create or replace function public.rename_document(p_document_id uuid,p_display_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.documents where id=p_document_id and state='active';
  if v_company is null then raise exception 'Document not found'; end if;
  if not app_private.has_company_permission(v_company,'files.rename') then raise exception 'Permission denied'; end if;
  update public.documents set display_name=trim(p_display_name) where id=p_document_id;
end;
$$;

create or replace function public.move_document(p_document_id uuid,p_folder_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc public.documents%rowtype;
  v_folder public.folders%rowtype;
begin
  select * into v_doc from public.documents where id=p_document_id and state='active';
  select * into v_folder from public.folders where id=p_folder_id and trashed_at is null;
  if v_doc.id is null or v_folder.id is null
     or v_doc.company_id<>v_folder.company_id
     or v_doc.project_id<>v_folder.project_id
     or v_doc.site_id is distinct from v_folder.site_id then
    raise exception 'Invalid destination';
  end if;
  if not app_private.has_company_permission(v_doc.company_id,'files.move') then raise exception 'Permission denied'; end if;
  update public.documents set folder_id=p_folder_id where id=p_document_id;
end;
$$;

create or replace function public.mark_all_notifications_read(p_company_id uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.notifications
  set read_at=coalesce(read_at,now())
  where company_id=p_company_id and user_id=auth.uid();
$$;

create or replace function public.platform_company_overview()
returns table(
  company_id uuid,
  company_name text,
  company_slug text,
  status public.company_access_status,
  plan_id uuid,
  plan_code text,
  plan_name_ar text,
  plan_name_en text,
  member_count bigint,
  project_count bigint,
  storage_bytes bigint,
  max_members integer,
  max_projects integer,
  max_storage_bytes bigint,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,c.name,c.slug,cs.status,sp.id,sp.code,sp.name_ar,sp.name_en,
    (select count(*) from public.company_memberships m where m.company_id=c.id and m.status='active'),
    (select count(*) from public.projects p where p.company_id=c.id and p.archived_at is null),
    coalesce((select sum(v.size_bytes) from public.document_versions v where v.company_id=c.id and v.upload_state='ready'),0),
    coalesce(cs.max_members_override,sp.max_members),
    coalesce(cs.max_projects_override,sp.max_projects),
    coalesce(cs.max_storage_bytes_override,sp.max_storage_bytes),
    cs.trial_ends_at,cs.current_period_ends_at,c.created_at
  from public.companies c
  join public.company_subscriptions cs on cs.company_id=c.id
  join public.service_plans sp on sp.id=cs.plan_id
  where app_private.is_platform_admin()
  order by c.created_at desc;
$$;

-- Public runtime functions are callable only by authenticated users. Each
-- SECURITY DEFINER function performs its own company/permission check.
revoke all on function public.company_storage_metrics(uuid) from public,anon;
revoke all on function public.create_folder(uuid,uuid,uuid,text,text) from public,anon;
revoke all on function public.rename_folder(uuid,text) from public,anon;
revoke all on function public.move_folder(uuid,uuid) from public,anon;
revoke all on function public.begin_document_upload(uuid,text,text,text,bigint,text,text,text[],text) from public,anon;
revoke all on function public.begin_new_version_upload(uuid,text,text,bigint,text) from public,anon;
revoke all on function public.finalize_document_upload(uuid,text) from public,anon;
revoke all on function public.rename_document(uuid,text) from public,anon;
revoke all on function public.move_document(uuid,uuid) from public,anon;
revoke all on function public.mark_all_notifications_read(uuid) from public,anon;
revoke all on function public.platform_company_overview() from public,anon;

grant execute on function public.company_storage_metrics(uuid) to authenticated;
grant execute on function public.create_folder(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.rename_folder(uuid,text) to authenticated;
grant execute on function public.move_folder(uuid,uuid) to authenticated;
grant execute on function public.begin_document_upload(uuid,text,text,text,bigint,text,text,text[],text) to authenticated;
grant execute on function public.begin_new_version_upload(uuid,text,text,bigint,text) to authenticated;
grant execute on function public.finalize_document_upload(uuid,text) to authenticated;
grant execute on function public.rename_document(uuid,text) to authenticated;
grant execute on function public.move_document(uuid,uuid) to authenticated;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;
grant execute on function public.platform_company_overview() to authenticated;

-- Private helpers are implementation details and must not be exposed through
-- PostgREST. SECURITY DEFINER owners can still call them internally.
revoke all on function app_private.effective_company_limits(uuid) from public,anon,authenticated;
revoke all on function app_private.notify_company_members(uuid,uuid,text,text,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function app_private.safe_storage_filename(text) from public,anon,authenticated;

commit;
