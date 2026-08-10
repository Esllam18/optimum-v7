begin;

create type public.document_state as enum ('active','archived','trashed');
create type public.upload_state as enum ('uploading','ready','failed');
create type public.favorite_entity_type as enum ('project','site','folder','document');

insert into public.permissions(key,module,description_ar,description_en) values
('files.view','files','عرض مساحة الملفات','View files workspace'),
('files.upload','files','رفع الملفات والإصدارات','Upload files and versions'),
('files.create_folder','files','إنشاء مجلدات','Create folders'),
('files.rename','files','إعادة تسمية الملفات والمجلدات','Rename files and folders'),
('files.move','files','نقل الملفات والمجلدات','Move files and folders'),
('files.archive','files','نقل العناصر إلى السلة','Move items to trash'),
('files.restore','files','استعادة العناصر المحذوفة','Restore trashed items'),
('files.download','files','تنزيل الملفات','Download files'),
('files.manage','files','إدارة متقدمة لمساحة الملفات','Advanced file workspace management'),
('search.use','search','استخدام البحث العام','Use global search'),
('notifications.view','notifications','عرض الإشعارات','View notifications')
on conflict(key) do nothing;

create table public.folder_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.folder_template_nodes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.folder_templates(id) on delete cascade,
  parent_id uuid references public.folder_template_nodes(id) on delete cascade,
  code text,
  name_ar text not null,
  name_en text not null,
  sort_order integer not null default 0,
  is_system boolean not null default true,
  allows_children boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  parent_id uuid references public.folders(id) on delete restrict,
  template_node_id uuid references public.folder_template_nodes(id) on delete set null,
  name text not null check(char_length(trim(name)) between 1 and 160),
  code text,
  depth smallint not null default 0 check(depth between 0 and 20),
  sort_order integer not null default 0,
  is_system boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  trashed_at timestamptz,
  trashed_by uuid references public.profiles(id) on delete set null,
  trash_batch_id uuid
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  folder_id uuid not null references public.folders(id) on delete restrict,
  display_name text not null check(char_length(trim(display_name)) between 1 and 240),
  system_code text,
  document_type text not null default 'general',
  description text,
  tags text[] not null default array[]::text[],
  state public.document_state not null default 'active',
  current_version_id uuid,
  version_count integer not null default 0 check(version_count>=0),
  search_vector tsvector,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  trashed_at timestamptz,
  trashed_by uuid references public.profiles(id) on delete set null,
  trash_batch_id uuid
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null check(version_number>0),
  version_label text,
  original_filename text not null,
  storage_bucket text not null default 'company-files',
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check(size_bytes>=0),
  checksum_sha256 text,
  upload_state public.upload_state not null default 'uploading',
  change_note text,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique(document_id,version_number)
);

alter table public.documents add constraint documents_current_version_fkey
  foreign key(current_version_id) references public.document_versions(id) on delete set null deferrable initially deferred;

create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type public.favorite_entity_type not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(user_id,entity_type,entity_id)
);

create table public.notifications (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title_ar text not null,
  title_en text not null,
  body_ar text,
  body_en text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index folder_templates_company_idx on public.folder_templates(company_id) where company_id is not null;
create index folder_nodes_template_idx on public.folder_template_nodes(template_id,sort_order);
create index folder_nodes_parent_idx on public.folder_template_nodes(parent_id) where parent_id is not null;
create index folders_company_idx on public.folders(company_id,project_id,site_id);
create index folders_parent_idx on public.folders(parent_id) where trashed_at is null;
create index folders_project_scope_idx on public.folders(project_id,site_id,parent_id,sort_order) where trashed_at is null;
create index folders_template_node_idx on public.folders(template_node_id) where template_node_id is not null;
create unique index folders_scope_name_unique on public.folders(project_id,coalesce(site_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name)) where trashed_at is null;
create index documents_scope_idx on public.documents(company_id,project_id,site_id,folder_id) where state<>'trashed';
create index documents_project_idx on public.documents(project_id);
create index documents_site_idx on public.documents(site_id) where site_id is not null;
create index documents_current_version_idx on public.documents(current_version_id) where current_version_id is not null;
create index documents_search_idx on public.documents using gin(search_vector);
create index documents_tags_idx on public.documents using gin(tags);
create unique index documents_folder_code_unique on public.documents(folder_id,lower(system_code)) where system_code is not null and state<>'trashed';
create index versions_company_idx on public.document_versions(company_id,created_at desc);
create index versions_document_idx on public.document_versions(document_id,version_number desc);
create index notifications_user_unread_idx on public.notifications(user_id,created_at desc) where read_at is null;

create trigger folder_templates_set_updated_at before update on public.folder_templates for each row execute function public.set_updated_at();
create trigger folders_set_updated_at before update on public.folders for each row execute function public.set_updated_at();
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();

alter table public.folder_templates enable row level security;
alter table public.folder_template_nodes enable row level security;
alter table public.folders enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.favorites enable row level security;
alter table public.notifications enable row level security;

create policy folder_templates_select on public.folder_templates for select to authenticated using(company_id is null or public.is_company_member(company_id));
create policy folder_template_nodes_select on public.folder_template_nodes for select to authenticated using(exists(select 1 from public.folder_templates t where t.id=template_id and (t.company_id is null or public.is_company_member(t.company_id))));
create policy folders_select on public.folders for select to authenticated using(public.has_company_permission(company_id,'files.view'));
create policy documents_select on public.documents for select to authenticated using(public.has_company_permission(company_id,'files.view'));
create policy versions_select on public.document_versions for select to authenticated using(public.has_company_permission(company_id,'files.view'));
create policy favorites_select on public.favorites for select to authenticated using(user_id=(select auth.uid()) and public.is_company_member(company_id));
create policy favorites_insert on public.favorites for insert to authenticated with check(user_id=(select auth.uid()) and public.is_company_member(company_id));
create policy favorites_delete on public.favorites for delete to authenticated using(user_id=(select auth.uid()));
create policy notifications_select on public.notifications for select to authenticated using(user_id=(select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

grant select on public.folder_templates,public.folder_template_nodes,public.folders,public.documents,public.document_versions to authenticated;
grant select,insert,delete on public.favorites to authenticated;
grant select,update on public.notifications to authenticated;

with template as (
  insert into public.folder_templates(name_ar,name_en,description_ar,description_en,is_default,is_active)
  values('الهيكل الهندسي القياسي','Standard Engineering Structure','هيكل افتراضي للمشروعات الهندسية','Default engineering project structure',true,true)
  returning id
), roots as (
  insert into public.folder_template_nodes(template_id,code,name_ar,name_en,sort_order,is_system,allows_children)
  select template.id,x.code,x.ar,x.en,x.ord,true,true from template cross join (values
    ('00','إدارة المشروع','00 — Project Management',0),('01','الرسومات','01 — Drawings',10),('02','المستندات الفنية','02 — Technical Documents',20),('03','الكميات والتكاليف','03 — BOQ & Cost',30),('04','العقود','04 — Contracts',40),('05','طلبات المعلومات','05 — RFIs',50),('06','الاعتمادات','06 — Submittals',60),('07','التقارير','07 — Reports',70),('08','الصور','08 — Photos',80),('09','المراسلات','09 — Correspondence',90),('99','الأرشيف','99 — Archive',990)
  ) x(code,ar,en,ord) returning id,template_id,code
)
insert into public.folder_template_nodes(template_id,parent_id,code,name_ar,name_en,sort_order,is_system,allows_children)
select r.template_id,r.id,x.code,x.ar,x.en,x.ord,true,true from roots r cross join (values
  ('ARC','معماري','Architectural',10),('STR','إنشائي','Structural',20),('ELE','كهرباء','Electrical',30),('MEC','ميكانيكا','Mechanical',40),('PLB','صحي','Plumbing',50),('COO','تنسيق','Coordination',60)
) x(code,ar,en,ord) where r.code='01';

insert into storage.buckets(id,name,public,file_size_limit) values('company-files','company-files',false,1073741824)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

commit;
