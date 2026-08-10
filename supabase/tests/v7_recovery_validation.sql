-- Optimum V7 restore validation.
-- Run against a restored non-production database after restoring Database + Storage + Auth.
-- This script is read-only. A restore drill passes only when every invariant is zero.

with recovery as (
  select jsonb_build_object(
    'captured_at', now(),
    'auth_users', (select count(*) from auth.users),
    'companies', (select count(*) from public.companies),
    'active_memberships', (select count(*) from public.company_memberships where status = 'active'),
    'memberships_total', (select count(*) from public.company_memberships),
    'projects', (select count(*) from public.projects),
    'active_projects', (select count(*) from public.projects where status = 'active'),
    'sites', (select count(*) from public.sites),
    'tasks', (select count(*) from public.tasks),
    'documents', (select count(*) from public.documents),
    'document_versions', (select count(*) from public.document_versions),
    'storage_objects', (select count(*) from storage.objects),
    'storage_bytes', (select coalesce(sum(case when metadata ? 'size' and (metadata->>'size') ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0) from storage.objects),
    'engineering_drawings', (select count(*) from public.engineering_drawings),
    'engineering_revisions', (select count(*) from public.engineering_revisions),
    'engineering_assets', (select count(*) from public.engineering_assets),
    'engineering_assets_ready', (select count(*) from public.engineering_assets where state::text = 'ready'),
    'engineering_inline_data_images', (select count(*) from public.engineering_revisions where sheet_settings::text like '%data:image/%'),
    'site_claim_packages', (select count(*) from public.site_claim_packages),
    'site_claim_items', (select count(*) from public.site_claim_items),
    'company_invitations_pending', (select count(*) from public.company_invitations where status = 'pending'),
    'client_telemetry_events', (select count(*) from public.client_telemetry_events),
    'migration_count', (select count(*) from supabase_migrations.schema_migrations),
    'latest_migration', (select max(version) from supabase_migrations.schema_migrations),
    'public_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
    'public_rls_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
    'public_rls_policies', (select count(*) from pg_policies where schemaname='public'),
    'public_functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
    'public_security_definers', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef)
  ) counts,
  jsonb_build_object(
    'documents_bad_current_version', (
      select count(*) from public.documents d
      left join public.document_versions v on v.id=d.current_version_id
      where d.current_version_id is not null and (v.id is null or v.document_id<>d.id or v.company_id<>d.company_id)
    ),
    'ready_document_versions_missing_storage', (
      select count(*) from public.document_versions v
      where v.upload_state::text='ready' and not exists (
        select 1 from storage.objects o where o.bucket_id=v.storage_bucket and o.name=v.storage_path
      )
    ),
    'ready_engineering_assets_missing_storage', (
      select count(*) from public.engineering_assets a
      where a.state::text='ready' and not exists (
        select 1 from storage.objects o where o.bucket_id=a.storage_bucket and o.name=a.storage_path
      )
    ),
    'memberships_missing_auth_user', (
      select count(*) from public.company_memberships m left join auth.users u on u.id=m.user_id where u.id is null
    ),
    'projects_company_mismatch', (
      select count(*) from public.projects p left join public.companies c on c.id=p.company_id where c.id is null
    ),
    'sites_project_company_mismatch', (
      select count(*) from public.sites s join public.projects p on p.id=s.project_id where s.company_id<>p.company_id
    ),
    'tasks_project_company_mismatch', (
      select count(*) from public.tasks t join public.projects p on p.id=t.project_id where t.project_id is not null and t.company_id<>p.company_id
    ),
    'tasks_site_company_mismatch', (
      select count(*) from public.tasks t join public.sites s on s.id=t.site_id where t.site_id is not null and t.company_id<>s.company_id
    ),
    'public_tables_without_rls', (
      select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
    )
  ) invariants
), schema_fp as (
  select md5(string_agg(x, E'\n' order by x)) fingerprint
  from (
    select format('%s.%s:%s:%s:%s', n.nspname, c.relname, a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod), a.attnotnull) x
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped
  ) s
), policy_fp as (
  select md5(coalesce(string_agg(format('%s.%s:%s:%s:%s:%s',schemaname,tablename,policyname,roles,cmd,coalesce(qual,'')||':'||coalesce(with_check,'')), E'\n' order by schemaname,tablename,policyname),'')) fingerprint
  from pg_policies where schemaname='public'
), function_fp as (
  select md5(coalesce(string_agg(md5(pg_get_functiondef(p.oid)), E'\n' order by p.oid),'')) fingerprint
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
)
select recovery.counts,
       recovery.invariants,
       jsonb_build_object('public_schema', schema_fp.fingerprint, 'public_policies', policy_fp.fingerprint, 'public_functions', function_fp.fingerprint) fingerprints,
       not exists (select 1 from jsonb_each_text(recovery.invariants) x where x.value::bigint <> 0) as invariants_pass
from recovery, schema_fp, policy_fp, function_fp;
