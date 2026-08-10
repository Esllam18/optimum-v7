begin;
drop policy if exists site_cabinets_select on public.site_cabinets;
create policy site_cabinets_select on public.site_cabinets for select to authenticated using(
  app_private.resource_permission_for_row(company_id,'projects.view',project_id,site_id,null,null)
);
drop policy if exists site_claim_packages_select on public.site_claim_packages;
create policy site_claim_packages_select on public.site_claim_packages for select to authenticated using(
  app_private.resource_permission_for_row(company_id,'files.view',project_id,site_id,null,null)
);
drop policy if exists site_claim_requirements_select on public.site_claim_requirements;
create policy site_claim_requirements_select on public.site_claim_requirements for select to authenticated using(
  exists(select 1 from public.site_claim_packages p where p.id=package_id and app_private.resource_permission_for_row(p.company_id,'files.view',p.project_id,p.site_id,null,null))
);
drop policy if exists site_claim_items_select on public.site_claim_items;
create policy site_claim_items_select on public.site_claim_items for select to authenticated using(
  exists(select 1 from public.site_claim_packages p join public.documents d on d.id=document_id where p.id=package_id and d.site_id=p.site_id and app_private.resource_permission_for_row(p.company_id,'files.view',p.project_id,p.site_id,d.folder_id,null))
);
commit;
