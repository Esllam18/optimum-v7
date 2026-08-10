-- Phase 5.5.3 — Governance policy reliability
create or replace function public.save_access_governance_settings(p_company_id uuid,p_payload jsonb)
returns public.access_governance_settings
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  s public.access_governance_settings;
  v_existing public.access_governance_settings%rowtype;
  v_high_risk text[];
  v_default text[]:=array['company.manage','members.manage','roles.manage','roles.delete','compensation.manage','files.manage','tasks.manage','drawings.publish']::text[];
begin
  if not (app_private.is_company_owner(p_company_id,auth.uid()) or app_private.is_platform_admin()) then raise exception 'Owner permission required'; end if;
  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' then raise exception 'Governance payload must be an object'; end if;
  select * into v_existing from public.access_governance_settings where company_id=p_company_id;
  if p_payload ? 'high_risk_permissions' then
    if jsonb_typeof(p_payload->'high_risk_permissions')<>'array' then raise exception 'High-risk permissions must be an array'; end if;
    select coalesce(array_agg(distinct value order by value),array[]::text[]) into v_high_risk from jsonb_array_elements_text(p_payload->'high_risk_permissions');
    if cardinality(v_high_risk)=0 then raise exception 'At least one high-risk permission is required'; end if;
    if exists(select 1 from unnest(v_high_risk) k left join public.permissions p on p.key=k where p.key is null) then raise exception 'Unknown high-risk permission'; end if;
  else
    v_high_risk:=coalesce(v_existing.high_risk_permissions,v_default);
    if cardinality(v_high_risk)=0 then v_high_risk:=v_default; end if;
  end if;
  insert into public.access_governance_settings(company_id,require_second_approval_high_risk,require_second_approval_offboarding,high_risk_permissions,updated_by)
  values(p_company_id,coalesce((p_payload->>'require_second_approval_high_risk')::boolean,coalesce(v_existing.require_second_approval_high_risk,false)),coalesce((p_payload->>'require_second_approval_offboarding')::boolean,coalesce(v_existing.require_second_approval_offboarding,false)),v_high_risk,auth.uid())
  on conflict(company_id) do update set require_second_approval_high_risk=excluded.require_second_approval_high_risk,require_second_approval_offboarding=excluded.require_second_approval_offboarding,high_risk_permissions=excluded.high_risk_permissions,updated_by=auth.uid(),updated_at=now()
  returning * into s;
  insert into public.audit_events(company_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_company_id,auth.uid(),'access.governance_updated','access_governance_settings',p_company_id,jsonb_build_object('require_second_approval_high_risk',s.require_second_approval_high_risk,'require_second_approval_offboarding',s.require_second_approval_offboarding,'high_risk_permissions',to_jsonb(s.high_risk_permissions)));
  return s;
end $function$;
revoke all on function public.save_access_governance_settings(uuid,jsonb) from public,anon;
grant execute on function public.save_access_governance_settings(uuid,jsonb) to authenticated,service_role;
