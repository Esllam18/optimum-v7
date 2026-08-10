create or replace function app_private.work_scheduler_tick_internal(p_until timestamptz default (now()+interval '45 days'))
returns jsonb
language plpgsql
security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  c record;
  t record;
  v_actor uuid;
  v_recurring integer:=0;
  v_overdue integer:=0;
  v_skipped integer:=0;
  v_failed integer:=0;
begin
  for c in
    select id from public.companies where app_private.company_is_operational(id)
  loop
    v_actor:=null;
    select m.user_id into v_actor
    from public.company_memberships m
    join public.roles r on r.id=m.role_id and r.company_id=m.company_id
    where m.company_id=c.id
      and m.status='active'
      and coalesce(m.lifecycle_stage,'active') not in ('offboarding','left','suspended')
      and r.slug='owner'
    order by m.created_at
    limit 1;

    if v_actor is null then
      v_skipped:=v_skipped+1;
      continue;
    end if;

    begin
      perform set_config('request.jwt.claim.sub',v_actor::text,true);
      v_recurring:=v_recurring+app_private.materialize_company_recurring_tasks(c.id,p_until);
      for t in
        select id from public.tasks
        where company_id=c.id and status not in ('done','cancelled') and due_at<now()
      loop
        v_overdue:=v_overdue+app_private.execute_work_automations(t.id,'task.overdue',null);
      end loop;
    exception when others then
      v_failed:=v_failed+1;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub','',true);
  return jsonb_build_object(
    'recurring_created',v_recurring,
    'overdue_automations',v_overdue,
    'companies_skipped',v_skipped,
    'companies_failed',v_failed,
    'ran_at',now()
  );
end;
$$;

revoke all on function app_private.work_scheduler_tick_internal(timestamptz) from public,anon,authenticated;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='optimum-work-scheduler') then
      perform cron.unschedule((select jobid from cron.job where jobname='optimum-work-scheduler' limit 1));
    end if;
    perform cron.schedule('optimum-work-scheduler','*/15 * * * *',$cmd$select app_private.work_scheduler_tick_internal(now()+interval '45 days');$cmd$);
  end if;
end $$;
