begin;

create schema if not exists app_private;

create or replace function app_private.is_company_member(p_company_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.is_company_member(p_company_id);
$$;

create or replace function app_private.has_company_permission(p_company_id uuid,p_permission text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.has_company_permission(p_company_id,p_permission);
$$;

create or replace function app_private.safe_storage_filename(p_name text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select regexp_replace(coalesce(nullif(trim(p_name),''),'file.bin'),'[^A-Za-z0-9._-]+','_','g');
$$;

create or replace function app_private.update_document_search_vector()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  new.search_vector:=to_tsvector('simple',concat_ws(' ',new.display_name,new.system_code,new.document_type,new.description,array_to_string(new.tags,' ')));
  return new;
end $$;
create trigger documents_search_vector before insert or update of display_name,system_code,document_type,description,tags on public.documents for each row execute function app_private.update_document_search_vector();

create or replace function app_private.validate_folder_scope()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_company uuid;v_parent public.folders%rowtype;begin
  select company_id into v_company from public.projects where id=new.project_id;
  if v_company is null or v_company<>new.company_id then raise exception 'Invalid project scope';end if;
  if new.site_id is not null and not exists(select 1 from public.sites s where s.id=new.site_id and s.project_id=new.project_id and s.company_id=new.company_id) then raise exception 'Invalid site scope';end if;
  if new.parent_id is not null then select * into v_parent from public.folders where id=new.parent_id;if not found or v_parent.company_id<>new.company_id or v_parent.project_id<>new.project_id or v_parent.site_id is distinct from new.site_id then raise exception 'Invalid parent folder';end if;new.depth:=v_parent.depth+1;else new.depth:=0;end if;
  if new.depth>20 then raise exception 'Maximum folder depth reached';end if;new.name:=trim(new.name);return new;
end $$;
create trigger folders_validate_scope before insert or update of project_id,site_id,parent_id,name on public.folders for each row execute function app_private.validate_folder_scope();

create or replace function app_private.validate_document_scope()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare f public.folders%rowtype;begin select * into f from public.folders where id=new.folder_id;if not found or f.trashed_at is not null then raise exception 'Folder not available';end if;if f.company_id<>new.company_id or f.project_id<>new.project_id or f.site_id is distinct from new.site_id then raise exception 'Document scope mismatch';end if;new.display_name:=trim(new.display_name);return new;end $$;
create trigger documents_validate_scope before insert or update of company_id,project_id,site_id,folder_id,display_name on public.documents for each row execute function app_private.validate_document_scope();

create or replace function app_private.notify_company_members(p_company_id uuid,p_actor_id uuid,p_type text,p_title_ar text,p_title_en text,p_body_ar text,p_body_en text,p_entity_type text,p_entity_id uuid)
returns void language sql security definer set search_path=public,pg_temp as $$
  insert into public.notifications(company_id,user_id,type,title_ar,title_en,body_ar,body_en,entity_type,entity_id)
  select p_company_id,m.user_id,p_type,p_title_ar,p_title_en,p_body_ar,p_body_en,p_entity_type,p_entity_id from public.company_memberships m where m.company_id=p_company_id and m.status='active' and m.user_id<>p_actor_id;
$$;

create or replace function app_private.instantiate_default_folders(p_project_id uuid,p_site_id uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_company uuid;v_creator uuid;v_template uuid;v_node record;v_parent uuid;begin
  select company_id,created_by into v_company,v_creator from public.projects where id=p_project_id;if v_company is null then return;end if;
  if p_site_id is not null then select created_by into v_creator from public.sites where id=p_site_id and project_id=p_project_id;end if;
  select id into v_template from public.folder_templates where company_id is null and is_default and is_active order by created_at limit 1;if v_template is null then return;end if;
  for v_node in with recursive tree as(select n.*,0 lvl from public.folder_template_nodes n where n.template_id=v_template and n.parent_id is null union all select n.*,t.lvl+1 from public.folder_template_nodes n join tree t on n.parent_id=t.id) select * from tree order by lvl,sort_order,id loop
    v_parent:=null;if v_node.parent_id is not null then select id into v_parent from public.folders where project_id=p_project_id and site_id is not distinct from p_site_id and template_node_id=v_node.parent_id and trashed_at is null limit 1;end if;
    if not exists(select 1 from public.folders where project_id=p_project_id and site_id is not distinct from p_site_id and template_node_id=v_node.id and trashed_at is null) then insert into public.folders(company_id,project_id,site_id,parent_id,template_node_id,name,code,sort_order,is_system,created_by) values(v_company,p_project_id,p_site_id,v_parent,v_node.id,v_node.name_en,v_node.code,v_node.sort_order,true,v_creator);end if;
  end loop;
end $$;
create or replace function app_private.project_create_folders() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin perform app_private.instantiate_default_folders(new.id,null);return new;end$$;
create or replace function app_private.site_create_folders() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin perform app_private.instantiate_default_folders(new.project_id,new.id);return new;end$$;
create trigger projects_create_default_folders after insert on public.projects for each row execute function app_private.project_create_folders();
create trigger sites_create_default_folders after insert on public.sites for each row execute function app_private.site_create_folders();

create or replace function public.company_storage_metrics(p_company_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$select jsonb_build_object('used_bytes',coalesce((select sum(size_bytes) from public.document_versions where company_id=p_company_id and upload_state='ready'),0),'uploading_bytes',coalesce((select sum(size_bytes) from public.document_versions where company_id=p_company_id and upload_state='uploading'),0),'document_count',(select count(*) from public.documents where company_id=p_company_id and state='active'),'version_count',(select count(*) from public.document_versions where company_id=p_company_id and upload_state='ready'),'max_storage_bytes',null) where app_private.has_company_permission(p_company_id,'files.view');$$;

create or replace function public.create_folder(p_project_id uuid,p_site_id uuid,p_parent_id uuid,p_name text,p_code text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare c uuid;i uuid;begin select company_id into c from public.projects where id=p_project_id and archived_at is null;if c is null or not app_private.has_company_permission(c,'files.create_folder') then raise exception 'Permission denied';end if;insert into public.folders(company_id,project_id,site_id,parent_id,name,code,is_system,created_by) values(c,p_project_id,p_site_id,p_parent_id,trim(p_name),nullif(trim(p_code),''),false,auth.uid()) returning id into i;return i;end$$;

create or replace function public.begin_document_upload(p_folder_id uuid,p_display_name text,p_original_filename text,p_mime_type text,p_size_bytes bigint,p_document_type text default 'general',p_description text default null,p_tags text[] default array[]::text[],p_change_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare f public.folders%rowtype;d uuid:=gen_random_uuid();v uuid:=gen_random_uuid();path text;begin select * into f from public.folders where id=p_folder_id and trashed_at is null;if not found or not app_private.has_company_permission(f.company_id,'files.upload') then raise exception 'Permission denied';end if;if p_size_bytes<=0 or p_size_bytes>1073741824 then raise exception 'Invalid file size';end if;path:=f.company_id||'/'||f.project_id||'/'||coalesce(f.site_id::text,'project')||'/'||d||'/'||v||'/'||app_private.safe_storage_filename(p_original_filename);insert into public.documents(id,company_id,project_id,site_id,folder_id,display_name,document_type,description,tags,created_by) values(d,f.company_id,f.project_id,f.site_id,f.id,trim(p_display_name),coalesce(nullif(trim(p_document_type),''),'general'),nullif(trim(p_description),''),coalesce(p_tags,array[]::text[]),auth.uid());insert into public.document_versions(id,company_id,document_id,version_number,version_label,original_filename,storage_path,mime_type,size_bytes,change_note,uploaded_by) values(v,f.company_id,d,1,'v1',p_original_filename,path,coalesce(nullif(p_mime_type,''),'application/octet-stream'),p_size_bytes,nullif(trim(p_change_note),''),auth.uid());return jsonb_build_object('document_id',d,'version_id',v,'version_number',1,'storage_bucket','company-files','storage_path',path);end$$;

create or replace function public.finalize_document_upload(p_version_id uuid,p_checksum_sha256 text default null)
returns void language plpgsql security definer set search_path=public,storage,pg_temp as $$declare v public.document_versions%rowtype;begin select * into v from public.document_versions where id=p_version_id and upload_state='uploading' for update;if not found or (v.uploaded_by<>auth.uid() and not app_private.has_company_permission(v.company_id,'files.manage')) then raise exception 'Permission denied';end if;if not exists(select 1 from storage.objects where bucket_id=v.storage_bucket and name=v.storage_path) then raise exception 'Uploaded object was not found';end if;update public.document_versions set upload_state='ready',checksum_sha256=nullif(p_checksum_sha256,''),finalized_at=now() where id=v.id;update public.documents set current_version_id=v.id,version_count=(select count(*) from public.document_versions x where x.document_id=v.document_id and x.upload_state='ready') where id=v.document_id;end$$;

create or replace function public.mark_all_notifications_read(p_company_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$declare n int;begin update public.notifications set read_at=now() where company_id=p_company_id and user_id=auth.uid() and read_at is null;get diagnostics n=row_count;return n;end$$;

create policy company_files_insert on storage.objects for insert to authenticated with check(bucket_id='company-files' and app_private.has_company_permission(((storage.foldername(name))[1])::uuid,'files.upload'));
create policy company_files_select on storage.objects for select to authenticated using(bucket_id='company-files' and app_private.has_company_permission(((storage.foldername(name))[1])::uuid,'files.download'));
create policy company_files_delete on storage.objects for delete to authenticated using(bucket_id='company-files' and app_private.has_company_permission(((storage.foldername(name))[1])::uuid,'files.manage'));

revoke all on function public.company_storage_metrics(uuid),public.create_folder(uuid,uuid,uuid,text,text),public.begin_document_upload(uuid,text,text,text,bigint,text,text,text[],text),public.finalize_document_upload(uuid,text),public.mark_all_notifications_read(uuid) from public,anon;
grant execute on function public.company_storage_metrics(uuid),public.create_folder(uuid,uuid,uuid,text,text),public.begin_document_upload(uuid,text,text,text,bigint,text,text,text[],text),public.finalize_document_upload(uuid,text),public.mark_all_notifications_read(uuid) to authenticated;

commit;
