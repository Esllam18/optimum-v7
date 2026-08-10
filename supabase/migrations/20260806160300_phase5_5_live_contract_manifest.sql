-- Optimum Phase 5.5 — Organization Core & Access Intelligence
--
-- The canonical Phase 5.5 migrations were applied to the linked Supabase project
-- wzcaquxuvqfbstpxujsj and are recorded in supabase_migrations.schema_migrations.
-- This package is intentionally bound to that live project. This contract migration
-- fails fast if a deployment target does not already contain the Phase 5.5 backend.
--
-- Required RPC contracts (kept as machine-readable declarations for audits):
-- function public.role_draft_impact(p_draft_id uuid)
-- function public.member_access_snapshot(p_membership_id uuid)
-- function public.publish_role_draft(p_draft_id uuid)
-- function public.rollback_role_version(p_role_id uuid, p_version_id uuid, p_change_note text)
-- function public.rollback_workspace_settings(p_company_id uuid, p_version_id uuid, p_change_note text)
-- function public.publish_workspace_settings_draft(p_draft_id uuid)
-- function public.execute_member_offboarding(p_plan_id uuid)
-- function public.review_access_change_request(p_request_id uuid, p_decision text, p_note text)
-- function public.save_role_draft(p_payload jsonb)
-- function public.save_member_access_profile(p_membership_id uuid, p_profile jsonb)
-- function public.save_role_addon(p_payload jsonb)
-- function public.save_organization_unit(p_payload jsonb)
-- function public.prepare_member_offboarding(p_membership_id uuid, p_transfer_to_membership_id uuid, p_options jsonb)
-- function public.save_access_governance_settings(p_company_id uuid, p_settings jsonb)
-- function public.save_workspace_settings_draft(p_company_id uuid, p_company jsonb, p_branding jsonb, p_change_note text)
-- function public.set_company_entitlement_override(p_company_id uuid, p_entitlement_key text, p_enabled boolean, p_limits jsonb, p_reason text)
-- function public.clear_company_entitlement_override(p_company_id uuid, p_entitlement_key text)

do $$
declare
  missing text[] := '{}';
  fn text;
  tbl text;
begin
  foreach tbl in array array[
    'entitlements','service_plan_entitlements','company_entitlement_overrides',
    'role_addons','role_addon_permissions','member_role_addons',
    'organization_units','organization_unit_memberships','access_scope_rules',
    'role_versions','role_drafts','access_governance_settings','access_change_requests',
    'workspace_setting_versions','workspace_setting_drafts','offboarding_plans','resource_custody'
  ] loop
    if to_regclass('public.' || tbl) is null then missing := array_append(missing, 'table:' || tbl); end if;
  end loop;

  foreach fn in array array[
    'role_draft_impact','member_access_snapshot','publish_role_draft','rollback_role_version',
    'rollback_workspace_settings','publish_workspace_settings_draft','execute_member_offboarding',
    'review_access_change_request','save_role_draft','save_member_access_profile','save_role_addon',
    'save_organization_unit','prepare_member_offboarding','save_access_governance_settings',
    'save_workspace_settings_draft','set_company_entitlement_override','clear_company_entitlement_override'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=fn
    ) then missing := array_append(missing, 'function:' || fn); end if;
  end loop;

  if cardinality(missing) > 0 then
    raise exception 'Phase 5.5 live backend contract is missing: %', array_to_string(missing, ', ');
  end if;
end $$;
