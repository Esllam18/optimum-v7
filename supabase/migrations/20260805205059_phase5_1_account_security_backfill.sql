-- Existing users keep their current password and are marked as legacy-complete.
insert into public.account_security(
  user_id,must_change_password,first_login_completed_at,last_password_change_at,provisioning_source
)
select p.id,false,coalesce(p.created_at,now()),coalesce(p.updated_at,p.created_at,now()),'legacy'
from public.profiles p
on conflict(user_id) do nothing;

-- Remove anonymous execution from review mutations discovered during the security review.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('add_engineering_review_mark','update_engineering_review_mark')
  loop
    execute format('revoke all on function %s from anon',r.signature);
  end loop;
end $$;
