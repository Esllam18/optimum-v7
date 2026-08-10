begin;

alter table public.folders
  add column if not exists trash_origin text,
  add column if not exists trash_root_folder_id uuid references public.folders(id) on delete set null;

alter table public.documents
  add column if not exists trash_origin text,
  add column if not exists trash_root_folder_id uuid references public.folders(id) on delete set null;

alter table public.folders drop constraint if exists folders_trash_origin_check;
alter table public.folders add constraint folders_trash_origin_check
  check (trash_origin is null or trash_origin in ('direct','ancestor'));

alter table public.documents drop constraint if exists documents_trash_origin_check;
alter table public.documents add constraint documents_trash_origin_check
  check (trash_origin is null or trash_origin in ('direct','ancestor'));

update public.folders
set trash_origin=coalesce(trash_origin,'direct'),
    trash_root_folder_id=coalesce(trash_root_folder_id,id)
where trashed_at is not null;

update public.documents d
set trash_origin=case
      when exists (
        select 1 from public.folders f
        where f.id=d.folder_id and f.trashed_at is not null
          and f.trash_batch_id=d.trash_batch_id
      ) then 'ancestor'
      else coalesce(d.trash_origin,'direct')
    end,
    trash_root_folder_id=case
      when exists (
        select 1 from public.folders f
        where f.id=d.folder_id and f.trashed_at is not null
          and f.trash_batch_id=d.trash_batch_id
      ) then coalesce(d.trash_root_folder_id,d.folder_id)
      else d.trash_root_folder_id
    end
where d.state='trashed';

create index if not exists folders_trash_root_idx
  on public.folders(trash_root_folder_id) where trashed_at is not null;
create index if not exists documents_trash_root_idx
  on public.documents(trash_root_folder_id) where state='trashed';

create or replace function public.invitation_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_inv public.company_invitations%rowtype;
  v_company_name text;
  v_role_ar text;
  v_role_en text;
begin
  if p_token is null or length(trim(p_token))<32 then
    return jsonb_build_object('valid',false);
  end if;

  select * into v_inv
  from public.company_invitations
  where token_hash=encode(digest(trim(p_token),'sha256'),'hex')
  limit 1;

  if not found then return jsonb_build_object('valid',false); end if;

  select c.name,r.name_ar,r.name_en
  into v_company_name,v_role_ar,v_role_en
  from public.companies c
  join public.roles r on r.id=v_inv.role_id
  where c.id=v_inv.company_id;

  return jsonb_build_object(
    'valid',v_inv.status='pending' and v_inv.expires_at>now(),
    'status',v_inv.status,
    'company_name',v_company_name,
    'email',v_inv.email,
    'role_ar',v_role_ar,
    'role_en',v_role_en,
    'expires_at',v_inv.expires_at
  );
end;
$$;

revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon,authenticated;

create or replace function public.abort_document_upload(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path=public,storage,pg_temp
as $$
declare
  v_ver public.document_versions%rowtype;
  v_ready_count integer;
  v_current uuid;
begin
  select * into v_ver
  from public.document_versions
  where id=p_version_id and upload_state='uploading'
  for update;

  if not found then return; end if;
  if v_ver.uploaded_by<>auth.uid()
     and not app_private.has_company_permission(v_ver.company_id,'files.manage') then
    raise exception 'Permission denied';
  end if;

  if exists(
    select 1 from storage.objects
    where bucket_id=v_ver.storage_bucket and name=v_ver.storage_path
  ) then
    raise exception 'Uploaded object must be removed through Storage API before aborting';
  end if;

  delete from public.document_versions where id=p_version_id;

  select count(*) into v_ready_count
  from public.document_versions
  where document_id=v_ver.document_id and upload_state='ready';

  if v_ready_count=0 then
    delete from public.documents where id=v_ver.document_id;
  else
    select id into v_current
    from public.document_versions
    where document_id=v_ver.document_id and upload_state='ready'
    order by version_number desc limit 1;

    update public.documents
    set current_version_id=v_current,version_count=v_ready_count
    where id=v_ver.document_id;
  end if;
end;
$$;

create or replace function public.cleanup_stale_uploads(p_older_than_minutes integer default 30)
returns integer
language plpgsql
security definer
set search_path=public,storage,pg_temp
as $$
declare
  v record;
  v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_older_than_minutes<10 or p_older_than_minutes>10080 then
    raise exception 'Invalid cleanup window';
  end if;

  for v in
    select dv.id
    from public.document_versions dv
    where dv.upload_state='uploading'
      and dv.created_at<now()-make_interval(mins=>p_older_than_minutes)
      and (
        dv.uploaded_by=auth.uid()
        or app_private.has_company_permission(dv.company_id,'files.manage')
      )
      and not exists(
        select 1 from storage.objects o
        where o.bucket_id=dv.storage_bucket and o.name=dv.storage_path
      )
  loop
    perform public.abort_document_upload(v.id);
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.cleanup_stale_uploads(integer) from public,anon;
grant execute on function public.cleanup_stale_uploads(integer) to authenticated;

create or replace function public.trash_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_doc public.documents%rowtype;
  v_batch uuid:=gen_random_uuid();
begin
  select * into v_doc
  from public.documents
  where id=p_document_id and state<>'trashed'
  for update;

  if not found then raise exception 'Document not found'; end if;
  if not app_private.has_company_permission(v_doc.company_id,'files.archive') then
    raise exception 'Permission denied';
  end if;

  update public.documents
  set state='trashed',trashed_at=now(),trashed_by=auth.uid(),trash_batch_id=v_batch,
      trash_origin='direct',trash_root_folder_id=null
  where id=p_document_id;

  perform app_private.notify_company_members(
    v_doc.company_id,auth.uid(),'document.trashed',
    'تم نقل ملف إلى السلة','A file was moved to trash',
    v_doc.display_name,v_doc.display_name,'document',v_doc.id
  );
end;
$$;

create or replace function public.trash_folder(p_folder_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_folder public.folders%rowtype;
  v_batch uuid:=gen_random_uuid();
begin
  select * into v_folder
  from public.folders
  where id=p_folder_id and trashed_at is null
  for update;

  if not found then raise exception 'Folder not found'; end if;
  if v_folder.is_system then raise exception 'System folders cannot be deleted'; end if;
  if not app_private.has_company_permission(v_folder.company_id,'files.archive') then
    raise exception 'Permission denied';
  end if;

  with recursive descendants as (
    select id from public.folders where id=p_folder_id
    union all
    select f.id from public.folders f join descendants d on f.parent_id=d.id
  )
  update public.documents
  set state='trashed',trashed_at=now(),trashed_by=auth.uid(),trash_batch_id=v_batch,
      trash_origin='ancestor',trash_root_folder_id=p_folder_id
  where folder_id in(select id from descendants) and state<>'trashed';

  with recursive descendants as (
    select id from public.folders where id=p_folder_id
    union all
    select f.id from public.folders f join descendants d on f.parent_id=d.id
  )
  update public.folders
  set trashed_at=now(),trashed_by=auth.uid(),trash_batch_id=v_batch,
      trash_origin=case when id=p_folder_id then 'direct' else 'ancestor' end,
      trash_root_folder_id=p_folder_id
  where id in(select id from descendants) and trashed_at is null;

  perform app_private.notify_company_members(
    v_folder.company_id,auth.uid(),'folder.trashed',
    'تم نقل مجلد إلى السلة','A folder was moved to trash',
    v_folder.name,v_folder.name,'folder',p_folder_id
  );
end;
$$;

create or replace function public.restore_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_doc public.documents%rowtype;
begin
  select * into v_doc
  from public.documents
  where id=p_document_id and state='trashed'
  for update;

  if not found then raise exception 'Document not found in trash'; end if;
  if v_doc.trash_origin='ancestor' then
    raise exception 'Restore the containing folder instead';
  end if;
  if not app_private.has_company_permission(v_doc.company_id,'files.restore') then
    raise exception 'Permission denied';
  end if;
  if exists(select 1 from public.folders where id=v_doc.folder_id and trashed_at is not null) then
    raise exception 'Restore the containing folder first';
  end if;

  update public.documents
  set state='active',trashed_at=null,trashed_by=null,trash_batch_id=null,
      trash_origin=null,trash_root_folder_id=null
  where id=p_document_id;
end;
$$;

create or replace function public.restore_folder(p_folder_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_folder public.folders%rowtype;
  v_batch uuid;
begin
  select * into v_folder
  from public.folders
  where id=p_folder_id and trashed_at is not null
  for update;

  if not found then raise exception 'Folder not found in trash'; end if;
  if coalesce(v_folder.trash_origin,'direct')<>'direct' then
    raise exception 'Restore the top-level deleted folder instead';
  end if;
  if not app_private.has_company_permission(v_folder.company_id,'files.restore') then
    raise exception 'Permission denied';
  end if;
  if v_folder.parent_id is not null
     and exists(select 1 from public.folders where id=v_folder.parent_id and trashed_at is not null) then
    raise exception 'Restore the parent folder first';
  end if;

  v_batch:=v_folder.trash_batch_id;
  if v_batch is null then raise exception 'Trash operation metadata is missing'; end if;

  update public.documents
  set state='active',trashed_at=null,trashed_by=null,trash_batch_id=null,
      trash_origin=null,trash_root_folder_id=null
  where state='trashed' and trash_batch_id=v_batch and trash_origin='ancestor';

  update public.folders
  set trashed_at=null,trashed_by=null,trash_batch_id=null,
      trash_origin=null,trash_root_folder_id=null
  where trashed_at is not null and trash_batch_id=v_batch;
end;
$$;

-- Clean only abandoned reservations that never produced a storage object.
delete from public.document_versions v
where v.upload_state='uploading'
  and v.created_at<now()-interval '15 minutes'
  and not exists(
    select 1 from storage.objects o
    where o.bucket_id=v.storage_bucket and o.name=v.storage_path
  );

delete from public.documents d
where d.current_version_id is null
  and not exists(select 1 from public.document_versions v where v.document_id=d.id);

update public.documents d
set version_count=(select count(*) from public.document_versions v where v.document_id=d.id and v.upload_state='ready'),
    current_version_id=(select v.id from public.document_versions v where v.document_id=d.id and v.upload_state='ready' order by v.version_number desc limit 1)
where exists(select 1 from public.document_versions v where v.document_id=d.id);

commit;
