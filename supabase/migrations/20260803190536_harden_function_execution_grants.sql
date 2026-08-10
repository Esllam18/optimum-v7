begin;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.create_company(text,text) from public, anon;
grant execute on function public.create_company(text,text) to authenticated;
revoke execute on function public.is_company_member(uuid) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated;
revoke execute on function public.has_company_permission(uuid,text) from public, anon;
grant execute on function public.has_company_permission(uuid,text) to authenticated;
commit;
