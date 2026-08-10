begin;

-- Phase 4: CAD & Engineering
create type public.engineering_drawing_status as enum ('draft','in_review','issued','approved','archived');
create type public.engineering_revision_status as enum ('draft','submitted','issued','approved','superseded');
create type public.engineering_asset_state as enum ('uploading','ready','failed');
create type public.engineering_mark_status as enum ('open','resolved');

insert into public.permissions(key,module,description_ar,description_en) values
('drawings.view','engineering','عرض الرسومات الهندسية','View engineering drawings'),
('drawings.create','engineering','إنشاء رسومات هندسية','Create engineering drawings'),
('drawings.edit','engineering','تعديل الرسومات والمسودات','Edit drawings and drafts'),
('drawings.publish','engineering','إصدار واعتماد مراجعات الرسم','Issue and approve drawing revisions'),
('drawings.compare','engineering','مقارنة مراجعات الرسومات','Compare drawing revisions'),
('drawings.export','engineering','تصدير الرسم إلى DXF وSVG وPDF','Export drawings to DXF, SVG, and PDF'),
('drawings.review','engineering','إضافة وإغلاق ملاحظات المراجعة','Add and resolve drawing review marks'),
('boq.view','engineering','عرض شيت الحصر الهندسي','View engineering takeoff sheets'),
('boq.edit','engineering','تعديل بنود الحصر اليدوية','Edit manual takeoff items'),
('catalog.manage','engineering','إدارة مكتبة الرموز والخامات','Manage engineering symbol and material catalog')
on conflict (key) do update set module=excluded.module,description_ar=excluded.description_ar,description_en=excluded.description_en;

create table public.engineering_catalog_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  code text not null check (char_length(trim(code)) between 2 and 80),
  category text not null check (category in ('node','route','accessory','labor')),
  symbol_key text not null,
  name_ar text not null,
  name_en text not null,
  unit text not null default 'ea',
  default_properties jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index engineering_catalog_code_unique on public.engineering_catalog_items(coalesce(company_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(code));
create index engineering_catalog_company_category_idx on public.engineering_catalog_items(company_id,category,sort_order) where is_active;

create table public.engineering_drawings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  site_id uuid references public.sites(id) on delete restrict,
  folder_id uuid references public.folders(id) on delete set null,
  source_document_id uuid references public.documents(id) on delete set null,
  drawing_no text not null check (char_length(trim(drawing_no)) between 2 and 100),
  title text not null check (char_length(trim(title)) between 2 and 240),
  discipline text not null default 'fiber',
  drawing_type text not null default 'secondary_network',
  status public.engineering_drawing_status not null default 'draft',
  current_revision_id uuid,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index engineering_drawings_number_unique on public.engineering_drawings(company_id,lower(drawing_no)) where archived_at is null;
create index engineering_drawings_company_project_idx on public.engineering_drawings(company_id,project_id,status,updated_at desc);
create index engineering_drawings_site_idx on public.engineering_drawings(site_id) where site_id is not null;

create table public.engineering_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  drawing_id uuid not null references public.engineering_drawings(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  revision_code text not null,
  status public.engineering_revision_status not null default 'draft',
  snapshot jsonb not null default '{"version":1,"nodes":[],"routes":[],"annotations":[]}'::jsonb,
  sheet_settings jsonb not null default '{}'::jsonb,
  boq_snapshot jsonb not null default '[]'::jsonb,
  change_note text,
  lock_version integer not null default 1,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  published_at timestamptz,
  unique(drawing_id,revision_number),
  check (octet_length(snapshot::text) <= 20971520),
  check (jsonb_typeof(snapshot)='object'),
  check (jsonb_typeof(sheet_settings)='object'),
  check (jsonb_typeof(boq_snapshot)='array')
);
create index engineering_revisions_drawing_idx on public.engineering_revisions(drawing_id,revision_number desc);
create index engineering_revisions_company_status_idx on public.engineering_revisions(company_id,status,updated_at desc);

alter table public.engineering_drawings add constraint engineering_drawings_current_revision_fkey foreign key(current_revision_id) references public.engineering_revisions(id) on delete set null;

create table public.engineering_revision_boq (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  revision_id uuid not null references public.engineering_revisions(id) on delete cascade,
  item_code text not null,
  category text not null,
  description_ar text not null,
  description_en text not null,
  unit text not null,
  quantity numeric(18,3) not null default 0 check (quantity >= 0),
  source_kind text not null default 'auto' check (source_kind in ('auto','manual','adjustment')),
  metadata jsonb not null default '{}'::jsonb,
  unique(revision_id,item_code,source_kind)
);
create index engineering_boq_company_revision_idx on public.engineering_revision_boq(company_id,revision_id);

create table public.engineering_review_marks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  drawing_id uuid not null references public.engineering_drawings(id) on delete cascade,
  revision_id uuid not null references public.engineering_revisions(id) on delete cascade,
  x numeric(12,3) not null,
  y numeric(12,3) not null,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  status public.engineering_mark_status not null default 'open',
  created_by uuid not null references public.profiles(id),
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index engineering_marks_revision_status_idx on public.engineering_review_marks(revision_id,status,created_at);
create index engineering_marks_company_idx on public.engineering_review_marks(company_id,created_at desc);

create table public.engineering_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  drawing_id uuid not null references public.engineering_drawings(id) on delete cascade,
  revision_id uuid references public.engineering_revisions(id) on delete cascade,
  kind text not null check (kind in ('reference','export','thumbnail')),
  original_filename text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 52428800),
  storage_bucket text not null default 'engineering-assets',
  storage_path text not null unique,
  state public.engineering_asset_state not null default 'uploading',
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);
create index engineering_assets_drawing_idx on public.engineering_assets(drawing_id,kind,created_at desc);
create index engineering_assets_revision_idx on public.engineering_assets(revision_id) where revision_id is not null;

create trigger engineering_catalog_updated_at before update on public.engineering_catalog_items for each row execute function public.set_updated_at();
create trigger engineering_drawings_updated_at before update on public.engineering_drawings for each row execute function public.set_updated_at();
create trigger engineering_revisions_updated_at before update on public.engineering_revisions for each row execute function public.set_updated_at();

create or replace function app_private.can_view_engineering_drawing(p_drawing_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.engineering_drawings d where d.id=p_drawing_id and app_private.has_company_permission(d.company_id,'drawings.view'));
$$;

create or replace function app_private.validate_engineering_drawing_scope()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.projects p where p.id=new.project_id and p.company_id=new.company_id and p.archived_at is null) then
    raise exception 'Project scope is invalid';
  end if;
  if new.site_id is not null and not exists(select 1 from public.sites s where s.id=new.site_id and s.project_id=new.project_id and s.company_id=new.company_id and s.archived_at is null) then
    raise exception 'Site scope is invalid';
  end if;
  if new.folder_id is not null and not exists(select 1 from public.folders f where f.id=new.folder_id and f.project_id=new.project_id and f.company_id=new.company_id and f.site_id is not distinct from new.site_id and f.trashed_at is null) then
    raise exception 'Folder scope is invalid';
  end if;
  if new.source_document_id is not null and not exists(select 1 from public.documents d where d.id=new.source_document_id and d.project_id=new.project_id and d.company_id=new.company_id and d.site_id is not distinct from new.site_id and d.state='active') then
    raise exception 'Source document scope is invalid';
  end if;
  return new;
end;$$;
create trigger engineering_drawings_validate_scope before insert or update of company_id,project_id,site_id,folder_id,source_document_id on public.engineering_drawings for each row execute function app_private.validate_engineering_drawing_scope();

create or replace function public.create_engineering_drawing(
  p_company_id uuid,p_project_id uuid,p_site_id uuid,p_folder_id uuid,p_drawing_no text,p_title text,
  p_discipline text default 'fiber',p_drawing_type text default 'secondary_network',p_snapshot jsonb default null,p_sheet_settings jsonb default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_drawing uuid;v_revision uuid;v_snapshot jsonb;v_settings jsonb;
begin
  if auth.uid() is null or not app_private.has_company_permission(p_company_id,'drawings.create') then raise exception 'Permission denied'; end if;
  v_snapshot:=coalesce(p_snapshot,'{"version":1,"nodes":[],"routes":[],"annotations":[]}'::jsonb);
  v_settings:=coalesce(p_sheet_settings,jsonb_build_object('paper','A3','orientation','landscape','width',1600,'height',1000,'grid',20,'scale','NTS','titleBlock',true,'legend',true));
  insert into public.engineering_drawings(company_id,project_id,site_id,folder_id,drawing_no,title,discipline,drawing_type,created_by,updated_by)
  values(p_company_id,p_project_id,p_site_id,p_folder_id,trim(p_drawing_no),trim(p_title),coalesce(nullif(trim(p_discipline),''),'fiber'),coalesce(nullif(trim(p_drawing_type),''),'secondary_network'),auth.uid(),auth.uid()) returning id into v_drawing;
  insert into public.engineering_revisions(company_id,drawing_id,revision_number,revision_code,snapshot,sheet_settings,created_by,change_note)
  values(p_company_id,v_drawing,1,'R0',v_snapshot,v_settings,auth.uid(),'Initial engineering draft') returning id into v_revision;
  update public.engineering_drawings set current_revision_id=v_revision where id=v_drawing;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(p_company_id,auth.uid(),'engineering.drawing_created','engineering_drawing',v_drawing,jsonb_build_object('drawing_no',trim(p_drawing_no),'revision_id',v_revision));
  return jsonb_build_object('drawing_id',v_drawing,'revision_id',v_revision);
end;$$;

create or replace function public.save_engineering_draft(
  p_revision_id uuid,p_snapshot jsonb,p_sheet_settings jsonb,p_boq jsonb default '[]'::jsonb,p_change_note text default null,p_expected_lock_version integer default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.engineering_revisions%rowtype;v_new_lock integer;item jsonb;
begin
  select * into r from public.engineering_revisions where id=p_revision_id for update;
  if not found then raise exception 'Revision not found'; end if;
  if not app_private.has_company_permission(r.company_id,'drawings.edit') then raise exception 'Permission denied'; end if;
  if r.status<>'draft' then raise exception 'Only draft revisions can be edited'; end if;
  if p_expected_lock_version is not null and r.lock_version<>p_expected_lock_version then raise exception 'Revision changed by another user'; end if;
  if jsonb_typeof(p_snapshot)<>'object' or jsonb_typeof(coalesce(p_sheet_settings,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_boq,'[]'::jsonb))<>'array' then raise exception 'Invalid engineering payload'; end if;
  update public.engineering_revisions set snapshot=p_snapshot,sheet_settings=coalesce(p_sheet_settings,'{}'::jsonb),boq_snapshot=coalesce(p_boq,'[]'::jsonb),change_note=coalesce(nullif(trim(p_change_note),''),change_note),lock_version=lock_version+1 where id=p_revision_id returning lock_version into v_new_lock;
  delete from public.engineering_revision_boq where revision_id=p_revision_id;
  for item in select value from jsonb_array_elements(coalesce(p_boq,'[]'::jsonb)) loop
    insert into public.engineering_revision_boq(company_id,revision_id,item_code,category,description_ar,description_en,unit,quantity,source_kind,metadata)
    values(r.company_id,p_revision_id,coalesce(nullif(item->>'code',''),'CUSTOM'),coalesce(nullif(item->>'category',''),'other'),coalesce(nullif(item->>'description_ar',''),item->>'name_ar','بند هندسي'),coalesce(nullif(item->>'description_en',''),item->>'name_en','Engineering item'),coalesce(nullif(item->>'unit',''),'ea'),greatest(coalesce((item->>'quantity')::numeric,0),0),case when item->>'source_kind' in ('auto','manual','adjustment') then item->>'source_kind' else 'auto' end,coalesce(item->'metadata','{}'::jsonb))
    on conflict(revision_id,item_code,source_kind) do update set quantity=excluded.quantity,description_ar=excluded.description_ar,description_en=excluded.description_en,unit=excluded.unit,category=excluded.category,metadata=excluded.metadata;
  end loop;
  update public.engineering_drawings set updated_by=auth.uid(),current_revision_id=p_revision_id,status='draft' where id=r.drawing_id;
  return jsonb_build_object('revision_id',p_revision_id,'lock_version',v_new_lock,'saved_at',now());
end;$$;

create or replace function public.create_engineering_revision(p_drawing_id uuid,p_change_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.engineering_drawings%rowtype;src public.engineering_revisions%rowtype;v_id uuid;v_num integer;
begin
  select * into d from public.engineering_drawings where id=p_drawing_id and archived_at is null for update;
  if not found then raise exception 'Drawing not found'; end if;
  if not app_private.has_company_permission(d.company_id,'drawings.edit') then raise exception 'Permission denied'; end if;
  if exists(select 1 from public.engineering_revisions where drawing_id=p_drawing_id and status='draft') then raise exception 'A draft revision already exists'; end if;
  select * into src from public.engineering_revisions where id=d.current_revision_id;
  select coalesce(max(revision_number),0)+1 into v_num from public.engineering_revisions where drawing_id=p_drawing_id;
  insert into public.engineering_revisions(company_id,drawing_id,revision_number,revision_code,status,snapshot,sheet_settings,boq_snapshot,change_note,created_by)
  values(d.company_id,p_drawing_id,v_num,'R'||(v_num-1),'draft',coalesce(src.snapshot,'{"version":1,"nodes":[],"routes":[],"annotations":[]}'::jsonb),coalesce(src.sheet_settings,'{}'::jsonb),coalesce(src.boq_snapshot,'[]'::jsonb),p_change_note,auth.uid()) returning id into v_id;
  insert into public.engineering_revision_boq(company_id,revision_id,item_code,category,description_ar,description_en,unit,quantity,source_kind,metadata)
  select company_id,v_id,item_code,category,description_ar,description_en,unit,quantity,source_kind,metadata from public.engineering_revision_boq where revision_id=src.id;
  update public.engineering_drawings set current_revision_id=v_id,status='draft',updated_by=auth.uid() where id=p_drawing_id;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(d.company_id,auth.uid(),'engineering.revision_created','engineering_drawing',p_drawing_id,jsonb_build_object('revision_id',v_id,'revision_number',v_num));
  return jsonb_build_object('drawing_id',p_drawing_id,'revision_id',v_id,'revision_number',v_num,'revision_code','R'||(v_num-1));
end;$$;

create or replace function public.publish_engineering_revision(p_revision_id uuid,p_status public.engineering_revision_status,p_note text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.engineering_revisions%rowtype;v_drawing_status public.engineering_drawing_status;
begin
  select * into r from public.engineering_revisions where id=p_revision_id for update;
  if not found then raise exception 'Revision not found'; end if;
  if not app_private.has_company_permission(r.company_id,'drawings.publish') then raise exception 'Permission denied'; end if;
  if p_status not in ('submitted','issued','approved') then raise exception 'Invalid publication status'; end if;
  if r.status='superseded' then raise exception 'Superseded revision cannot be published'; end if;
  if p_status in ('issued','approved') then
    update public.engineering_revisions set status='superseded' where drawing_id=r.drawing_id and id<>p_revision_id and status in ('issued','approved');
  end if;
  update public.engineering_revisions set status=p_status,change_note=coalesce(nullif(trim(p_note),''),change_note),submitted_at=case when p_status='submitted' then now() else submitted_at end,published_at=case when p_status in ('issued','approved') then now() else published_at end where id=p_revision_id;
  v_drawing_status:=case p_status when 'submitted' then 'in_review' when 'issued' then 'issued' else 'approved' end;
  update public.engineering_drawings set current_revision_id=p_revision_id,status=v_drawing_status,updated_by=auth.uid() where id=r.drawing_id;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(r.company_id,auth.uid(),'engineering.revision_published','engineering_drawing',r.drawing_id,jsonb_build_object('revision_id',p_revision_id,'status',p_status));
  perform app_private.notify_company_members(r.company_id,auth.uid(),'engineering_revision',case p_status when 'approved' then 'تم اعتماد رسم هندسي' else 'تم إصدار مراجعة رسم' end,case p_status when 'approved' then 'Engineering drawing approved' else 'Drawing revision issued' end,'تم تحديث حالة الرسم ومراجعته.','The drawing revision status was updated.','engineering_drawing',r.drawing_id);
end;$$;

create or replace function public.archive_engineering_drawing(p_drawing_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.engineering_drawings%rowtype;
begin
  select * into d from public.engineering_drawings where id=p_drawing_id for update;
  if not found then raise exception 'Drawing not found'; end if;
  if not app_private.has_company_permission(d.company_id,'drawings.publish') then raise exception 'Permission denied'; end if;
  update public.engineering_drawings set status='archived',archived_at=now(),updated_by=auth.uid() where id=p_drawing_id;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata) values(d.company_id,auth.uid(),'engineering.drawing_archived','engineering_drawing',p_drawing_id,'{}');
end;$$;

create or replace function public.add_engineering_review_mark(p_revision_id uuid,p_x numeric,p_y numeric,p_body text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.engineering_revisions%rowtype;v_id uuid;
begin
  select * into r from public.engineering_revisions where id=p_revision_id;
  if not found then raise exception 'Revision not found'; end if;
  if not app_private.has_company_permission(r.company_id,'drawings.review') then raise exception 'Permission denied'; end if;
  insert into public.engineering_review_marks(company_id,drawing_id,revision_id,x,y,body,created_by) values(r.company_id,r.drawing_id,p_revision_id,p_x,p_y,trim(p_body),auth.uid()) returning id into v_id;
  return v_id;
end;$$;

create or replace function public.resolve_engineering_review_mark(p_mark_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.engineering_review_marks%rowtype;
begin
  select * into m from public.engineering_review_marks where id=p_mark_id for update;
  if not found then raise exception 'Review mark not found'; end if;
  if not app_private.has_company_permission(m.company_id,'drawings.review') then raise exception 'Permission denied'; end if;
  update public.engineering_review_marks set status='resolved',resolved_by=auth.uid(),resolved_at=now() where id=p_mark_id;
end;$$;

create or replace function public.begin_engineering_asset_upload(p_drawing_id uuid,p_revision_id uuid,p_kind text,p_original_filename text,p_mime_type text,p_size_bytes bigint)
returns jsonb language plpgsql security definer set search_path=public,storage,pg_temp as $$
declare d public.engineering_drawings%rowtype;v_id uuid:=gen_random_uuid();v_path text;v_permission text;
begin
  select * into d from public.engineering_drawings where id=p_drawing_id and archived_at is null;
  if not found then raise exception 'Drawing not found'; end if;
  v_permission:=case when p_kind='export' then 'drawings.export' else 'drawings.edit' end;
  if not app_private.has_company_permission(d.company_id,v_permission) then raise exception 'Permission denied'; end if;
  if p_kind not in ('reference','export','thumbnail') then raise exception 'Invalid asset kind'; end if;
  if p_revision_id is not null and not exists(select 1 from public.engineering_revisions r where r.id=p_revision_id and r.drawing_id=p_drawing_id) then raise exception 'Revision scope is invalid'; end if;
  if p_size_bytes<0 or p_size_bytes>52428800 then raise exception 'Engineering asset exceeds 50 MB'; end if;
  v_path:=d.company_id::text||'/'||p_drawing_id::text||'/'||coalesce(p_revision_id::text,'general')||'/'||v_id::text||'/'||app_private.safe_storage_filename(p_original_filename);
  insert into public.engineering_assets(id,company_id,drawing_id,revision_id,kind,original_filename,mime_type,size_bytes,storage_path,uploaded_by) values(v_id,d.company_id,p_drawing_id,p_revision_id,p_kind,p_original_filename,coalesce(nullif(p_mime_type,''),'application/octet-stream'),p_size_bytes,v_path,auth.uid());
  return jsonb_build_object('asset_id',v_id,'storage_bucket','engineering-assets','storage_path',v_path);
end;$$;

create or replace function public.finalize_engineering_asset_upload(p_asset_id uuid)
returns void language plpgsql security definer set search_path=public,storage,pg_temp as $$
declare a public.engineering_assets%rowtype;
begin
  select * into a from public.engineering_assets where id=p_asset_id for update;
  if not found or a.uploaded_by<>auth.uid() then raise exception 'Asset upload not found'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id=a.storage_bucket and o.name=a.storage_path) then raise exception 'Uploaded object was not found'; end if;
  update public.engineering_assets set state='ready',finalized_at=now() where id=p_asset_id;
end;$$;

create or replace function public.abort_engineering_asset_upload(p_asset_id uuid)
returns void language plpgsql security definer set search_path=public,storage,pg_temp as $$
declare a public.engineering_assets%rowtype;
begin
  select * into a from public.engineering_assets where id=p_asset_id for update;
  if not found or (a.uploaded_by<>auth.uid() and not app_private.has_company_permission(a.company_id,'drawings.edit')) then raise exception 'Permission denied'; end if;
  delete from storage.objects where bucket_id=a.storage_bucket and name=a.storage_path;
  delete from public.engineering_assets where id=p_asset_id;
end;$$;

-- Global search now includes drawings.
create or replace function public.global_search(p_company_id uuid,p_query text,p_limit integer default 40)
returns table(entity_type text,entity_id uuid,title text,subtitle text,project_id uuid,site_id uuid,folder_id uuid,score real)
language sql stable security definer set search_path=public,pg_temp as $$
with q as(select trim(p_query) query,websearch_to_tsquery('simple',trim(p_query)) tsq),r(entity_type,entity_id,title,subtitle,project_id,site_id,folder_id,score) as(
 select 'document'::text,d.id,d.display_name,concat_ws(' · ',d.system_code,d.document_type),d.project_id,d.site_id,d.folder_id,greatest(ts_rank_cd(d.search_vector,q.tsq),case when d.display_name ilike '%'||q.query||'%' then 1 else 0 end)::real from public.documents d,q where d.company_id=p_company_id and d.state='active' and app_private.has_company_permission(p_company_id,'search.use') and(d.search_vector@@q.tsq or d.display_name ilike '%'||q.query||'%' or coalesce(d.system_code,'') ilike '%'||q.query||'%' or array_to_string(d.tags,' ') ilike '%'||q.query||'%')
 union all select 'folder',f.id,f.name,coalesce(f.code,''),f.project_id,f.site_id,f.parent_id,case when f.name ilike '%'||q.query||'%' then 1 else .4 end::real from public.folders f,q where f.company_id=p_company_id and f.trashed_at is null and app_private.has_company_permission(p_company_id,'search.use') and(f.name ilike '%'||q.query||'%' or coalesce(f.code,'') ilike '%'||q.query||'%')
 union all select 'project',p.id,p.name,p.code,p.id,null::uuid,null::uuid,case when p.name ilike '%'||q.query||'%' then 1 else .5 end::real from public.projects p,q where p.company_id=p_company_id and p.archived_at is null and app_private.has_company_permission(p_company_id,'search.use') and(p.name ilike '%'||q.query||'%' or p.code ilike '%'||q.query||'%')
 union all select 'site',s.id,s.name,s.code,s.project_id,s.id,null::uuid,case when s.name ilike '%'||q.query||'%' then 1 else .5 end::real from public.sites s,q where s.company_id=p_company_id and s.archived_at is null and app_private.has_company_permission(p_company_id,'search.use') and(s.name ilike '%'||q.query||'%' or s.code ilike '%'||q.query||'%')
 union all select 'task',t.id,t.title,concat('TSK-',t.task_number,' · ',t.status::text),t.project_id,t.site_id,t.folder_id,greatest(ts_rank_cd(t.search_vector,q.tsq),case when t.title ilike '%'||q.query||'%' then 1 else 0 end)::real from public.tasks t,q where t.company_id=p_company_id and app_private.has_company_permission(p_company_id,'search.use') and app_private.can_view_task(t.id) and(t.search_vector@@q.tsq or t.title ilike '%'||q.query||'%' or coalesce(t.description,'') ilike '%'||q.query||'%')
 union all select 'engineering_drawing',d.id,d.title,concat_ws(' · ',d.drawing_no,d.status::text,d.discipline),d.project_id,d.site_id,d.folder_id,case when d.title ilike '%'||q.query||'%' then 1 when d.drawing_no ilike '%'||q.query||'%' then .9 else .5 end::real from public.engineering_drawings d,q where d.company_id=p_company_id and d.archived_at is null and app_private.has_company_permission(p_company_id,'search.use') and app_private.has_company_permission(p_company_id,'drawings.view') and(d.title ilike '%'||q.query||'%' or d.drawing_no ilike '%'||q.query||'%' or d.discipline ilike '%'||q.query||'%')
) select r.* from r order by score desc,title limit least(greatest(p_limit,1),100);
$$;

-- Catalog inspired by the uploaded hand sketches and issued line diagrams.
insert into public.engineering_catalog_items(company_id,code,category,symbol_key,name_ar,name_en,unit,default_properties,sort_order) values
(null,'SUBCAB-22U','node','sub_cabinet','كابينة فرعية 22U','22U Sub Cabinet','ea','{"capacityU":22}',10),
(null,'TB-4C','node','termination_box','بوكس نهاية 4 كور','4-core Termination Box','ea','{"cores":4}',20),
(null,'TB-8C','node','termination_box','بوكس نهاية 8 كور','8-core Termination Box','ea','{"cores":8}',21),
(null,'TB-24C','node','termination_box','بوكس نهاية 24 كور','24-core Termination Box','ea','{"cores":24}',22),
(null,'TB-32C','node','termination_box','بوكس نهاية 32 كور','32-core Termination Box','ea','{"cores":32}',23),
(null,'TB-36C','node','termination_box','بوكس نهاية 36 كور','36-core Termination Box','ea','{"cores":36}',24),
(null,'TB-48C','node','termination_box','بوكس نهاية 48 كور','48-core Termination Box','ea','{"cores":48}',25),
(null,'TB-60C','node','termination_box','بوكس نهاية 60 كور','60-core Termination Box','ea','{"cores":60}',26),
(null,'TB-72C','node','termination_box','بوكس نهاية 72 كور','72-core Termination Box','ea','{"cores":72}',27),
(null,'TB-96C','node','termination_box','بوكس نهاية 96 كور','96-core Termination Box','ea','{"cores":96}',28),
(null,'MH-TEL','node','manhole','غرفة اتصالات','Telecom Manhole','ea','{}',30),
(null,'HH-TDM','node','handhole','هاند هول مع TDM','Handhole with TDM','ea','{}',31),
(null,'TDM','node','tdm','وحدة TDM','TDM Unit','ea','{}',32),
(null,'JOINT','node','joint','وصلة / Joint','Fiber Joint / Closure','ea','{}',33),
(null,'CONNECTOR','accessory','connector','كونكتور ميكرو دكت','Microduct Connector','ea','{}',40),
(null,'OPEN-BUNDLE','accessory','open_bundle','فتح باندل','Open Bundle','ea','{}',41),
(null,'END-BUNDLE','accessory','end_bundle','نهاية باندل','End Bundle','ea','{}',42),
(null,'SP-1X4','accessory','splitter','سبليتر 1:4','Splitter 1:4','ea','{"ratio":"1:4"}',43),
(null,'SP-1X8','accessory','splitter','سبليتر 1:8','Splitter 1:8','ea','{"ratio":"1:8"}',44),
(null,'SP-1X16','accessory','splitter','سبليتر 1:16','Splitter 1:16','ea','{"ratio":"1:16"}',45),
(null,'SP-1X32','accessory','splitter','سبليتر 1:32','Splitter 1:32','ea','{"ratio":"1:32"}',46),
(null,'ODF-36','accessory','odf','ODF سعة 36','ODF 36','ea','{"ports":36}',47),
(null,'ODF-144','accessory','odf','ODF سعة 144','ODF 144','ea','{"ports":144}',48),
(null,'LGX-4U','accessory','lgx','راك LGX 4U','LGX Rack 4U','ea','{"capacityU":4}',49),
(null,'DUCT-1W-7/3.5','route','microduct','ميكرو دكت 1 مسار 7/3.5','1-way Microduct 7/3.5','m','{"ways":1,"diameter":"7/3.5","color":"#e11d48"}',100),
(null,'DUCT-2W-7/3.5','route','microduct','ميكرو دكت 2 مسار 7/3.5','2-way Microduct 7/3.5','m','{"ways":2,"diameter":"7/3.5","color":"#2563eb"}',101),
(null,'DUCT-4W-7/3.5','route','microduct','ميكرو دكت 4 مسار 7/3.5','4-way Microduct 7/3.5','m','{"ways":4,"diameter":"7/3.5","color":"#22c55e"}',102),
(null,'DUCT-7W-7/3.5','route','microduct','ميكرو دكت 7 مسار 7/3.5','7-way Microduct 7/3.5','m','{"ways":7,"diameter":"7/3.5","color":"#16a34a"}',103),
(null,'DUCT-12W-7/3.5','route','microduct','ميكرو دكت 12 مسار 7/3.5','12-way Microduct 7/3.5','m','{"ways":12,"diameter":"7/3.5","color":"#15803d"}',104),
(null,'DUCT-24W-7/3.5','route','microduct','ميكرو دكت 24 مسار 7/3.5','24-way Microduct 7/3.5','m','{"ways":24,"diameter":"7/3.5","color":"#166534"}',105),
(null,'FO-4C','route','fiber_cable','كابل فايبر 4 كور','4-core Fiber Cable','m','{"cores":4,"color":"#ef4444"}',120),
(null,'FO-8C','route','fiber_cable','كابل فايبر 8 كور','8-core Fiber Cable','m','{"cores":8,"color":"#f97316"}',121),
(null,'FO-12C','route','fiber_cable','كابل فايبر 12 كور','12-core Fiber Cable','m','{"cores":12,"color":"#eab308"}',122),
(null,'FO-24C','route','fiber_cable','كابل فايبر 24 كور','24-core Fiber Cable','m','{"cores":24,"color":"#84cc16"}',123),
(null,'FO-36C','route','fiber_cable','كابل فايبر 36 كور','36-core Fiber Cable','m','{"cores":36,"color":"#22c55e"}',124),
(null,'FO-48C','route','fiber_cable','كابل فايبر 48 كور','48-core Fiber Cable','m','{"cores":48,"color":"#06b6d4"}',125),
(null,'FO-72C','route','fiber_cable','كابل فايبر 72 كور','72-core Fiber Cable','m','{"cores":72,"color":"#3b82f6"}',126),
(null,'FO-96C','route','fiber_cable','كابل فايبر 96 كور','96-core Fiber Cable','m','{"cores":96,"color":"#6366f1"}',127),
(null,'FO-144C','route','fiber_cable','كابل فايبر 144 كور','144-core Fiber Cable','m','{"cores":144,"color":"#8b5cf6"}',128),
(null,'FO-288C','route','fiber_cable','كابل فايبر 288 كور','288-core Fiber Cable','m','{"cores":288,"color":"#ec4899"}',129),
(null,'WIRE-SUSP','route','suspension_wire','واير معلق','Suspension Wire','m','{"color":"#6b7280"}',140)
on conflict do nothing;

-- Backfill role defaults for existing companies.
insert into public.role_permissions(role_id,permission_key,allowed)
select r.id,p.key,true from public.roles r cross join public.permissions p
where p.module='engineering' and (
 r.slug in ('owner','admin','manager') or
 (r.slug='engineer' and p.key in ('drawings.view','drawings.create','drawings.edit','drawings.compare','drawings.export','drawings.review','boq.view','boq.edit')) or
 (r.slug='supervisor' and p.key in ('drawings.view','drawings.compare','drawings.export','drawings.review','boq.view')) or
 (r.slug='viewer' and p.key in ('drawings.view','drawings.export','boq.view'))
) on conflict(role_id,permission_key) do update set allowed=true;

-- Future companies receive engineering permissions too.
create or replace function app_private.seed_company_roles(p_company_id uuid)
returns table(owner_role_id uuid) language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid;v_admin uuid;v_manager uuid;v_engineer uuid;v_supervisor uuid;v_viewer uuid;
begin
 insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values(p_company_id,'صاحب الشركة','Owner','owner',true,true) returning id into v_owner;
 insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values(p_company_id,'مدير النظام','Admin','admin',true,true) returning id into v_admin;
 insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values(p_company_id,'مدير','Manager','manager',true,true) returning id into v_manager;
 insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values(p_company_id,'مهندس','Engineer','engineer',true,true) returning id into v_engineer;
 insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values(p_company_id,'مشرف','Supervisor','supervisor',true,true) returning id into v_supervisor;
 insert into public.roles(company_id,name_ar,name_en,slug,is_default,is_protected) values(p_company_id,'مشاهد','Viewer','viewer',true,true) returning id into v_viewer;
 insert into public.role_permissions select v_owner,key,true from public.permissions;
 insert into public.role_permissions select v_admin,key,true from public.permissions where key<>'company.manage';
 insert into public.role_permissions select v_manager,key,true from public.permissions where key in ('company.view','members.view','roles.view','projects.view','projects.create','projects.edit','projects.archive','audit.view','files.view','files.upload','files.create_folder','files.rename','files.move','files.archive','files.restore','files.download','files.manage','search.use','notifications.view','tasks.view','tasks.view_all','tasks.create','tasks.assign','tasks.manage','tasks.comment','tasks.attach','tasks.complete','tasks.claim','tasks.recurring','drawings.view','drawings.create','drawings.edit','drawings.publish','drawings.compare','drawings.export','drawings.review','boq.view','boq.edit','catalog.manage');
 insert into public.role_permissions select v_engineer,key,true from public.permissions where key in ('company.view','members.view','projects.view','files.view','files.upload','files.create_folder','files.rename','files.move','files.download','search.use','notifications.view','tasks.view','tasks.create','tasks.comment','tasks.attach','tasks.complete','tasks.claim','drawings.view','drawings.create','drawings.edit','drawings.compare','drawings.export','drawings.review','boq.view','boq.edit');
 insert into public.role_permissions select v_supervisor,key,true from public.permissions where key in ('company.view','members.view','projects.view','files.view','files.upload','files.create_folder','files.download','search.use','notifications.view','tasks.view','tasks.create','tasks.comment','tasks.attach','tasks.complete','tasks.claim','drawings.view','drawings.compare','drawings.export','drawings.review','boq.view');
 insert into public.role_permissions select v_viewer,key,true from public.permissions where key in ('company.view','projects.view','files.view','files.download','search.use','notifications.view','tasks.view','drawings.view','drawings.export','boq.view');
 owner_role_id:=v_owner;return next;
end;$$;

alter table public.engineering_catalog_items enable row level security;
alter table public.engineering_drawings enable row level security;
alter table public.engineering_revisions enable row level security;
alter table public.engineering_revision_boq enable row level security;
alter table public.engineering_review_marks enable row level security;
alter table public.engineering_assets enable row level security;

create policy engineering_catalog_select on public.engineering_catalog_items for select to authenticated using (is_active and (company_id is null or app_private.has_company_permission(company_id,'drawings.view')));
create policy engineering_catalog_insert on public.engineering_catalog_items for insert to authenticated with check (company_id is not null and created_by=auth.uid() and app_private.has_company_permission(company_id,'catalog.manage'));
create policy engineering_catalog_update on public.engineering_catalog_items for update to authenticated using (company_id is not null and app_private.has_company_permission(company_id,'catalog.manage')) with check (company_id is not null and app_private.has_company_permission(company_id,'catalog.manage'));
create policy engineering_catalog_delete on public.engineering_catalog_items for delete to authenticated using (company_id is not null and app_private.has_company_permission(company_id,'catalog.manage'));

create policy engineering_drawings_select on public.engineering_drawings for select to authenticated using (app_private.has_company_permission(company_id,'drawings.view'));
create policy engineering_revisions_select on public.engineering_revisions for select to authenticated using (app_private.has_company_permission(company_id,'drawings.view'));
create policy engineering_boq_select on public.engineering_revision_boq for select to authenticated using (app_private.has_company_permission(company_id,'boq.view'));
create policy engineering_marks_select on public.engineering_review_marks for select to authenticated using (app_private.has_company_permission(company_id,'drawings.view'));
create policy engineering_assets_select on public.engineering_assets for select to authenticated using (app_private.has_company_permission(company_id,'drawings.view'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('engineering-assets','engineering-assets',false,52428800,array['image/png','image/jpeg','image/webp','image/svg+xml','application/pdf','application/dxf','application/octet-stream','text/csv','application/vnd.ms-excel']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy engineering_assets_insert on storage.objects for insert to authenticated with check(bucket_id='engineering-assets' and exists(select 1 from public.engineering_assets a where a.storage_path=objects.name and a.uploaded_by=auth.uid() and a.state='uploading'));
create policy engineering_assets_storage_select on storage.objects for select to authenticated using(bucket_id='engineering-assets' and exists(select 1 from public.engineering_assets a where a.storage_path=objects.name and a.state='ready' and app_private.can_view_engineering_drawing(a.drawing_id)));
create policy engineering_assets_storage_delete on storage.objects for delete to authenticated using(bucket_id='engineering-assets' and exists(select 1 from public.engineering_assets a where a.storage_path=objects.name and (a.uploaded_by=auth.uid() or app_private.has_company_permission(a.company_id,'drawings.edit'))));

revoke all on function app_private.can_view_engineering_drawing(uuid) from public,anon,authenticated;
revoke all on function app_private.validate_engineering_drawing_scope() from public,anon,authenticated;

do $$ declare r record;begin
 for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_engineering_drawing','save_engineering_draft','create_engineering_revision','publish_engineering_revision','archive_engineering_drawing','add_engineering_review_mark','resolve_engineering_review_mark','begin_engineering_asset_upload','finalize_engineering_asset_upload','abort_engineering_asset_upload') loop
   execute format('revoke all on function %s from public, anon',r.sig);
   execute format('grant execute on function %s to authenticated',r.sig);
 end loop;
end$$;

commit;
