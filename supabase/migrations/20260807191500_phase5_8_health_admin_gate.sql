create or replace function public.organization_health_snapshot(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='public','auth','pg_temp' as $$
declare
  c public.companies%rowtype; b public.company_branding%rowtype; ws public.company_work_settings%rowtype; gov public.access_governance_settings%rowtype;
  issues jsonb:='[]'::jsonb; steps jsonb:='[]'::jsonb; score integer:=100;
  roles_n int:=0; empty_roles int:=0; members_n int:=0; no_manager int:=0; first_login int:=0; expiring int:=0; dead_manager int:=0; expired_invites int:=0; override_heavy int:=0; units_n int:=0; project_n int:=0; storage_used bigint:=0; limits record; active_members int:=0;
  identity_ok boolean; branding_ok boolean; work_ok boolean; roles_ok boolean; org_ok boolean; team_ok boolean; governance_ok boolean; projects_ok boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (app_private.has_company_permission(p_company_id,'company.manage') or app_private.is_platform_admin()) then raise exception 'Company management permission required'; end if;
  select * into c from public.companies where id=p_company_id; if not found then raise exception 'Company not found'; end if;
  select * into b from public.company_branding where company_id=p_company_id;
  select * into ws from public.company_work_settings where company_id=p_company_id;
  select * into gov from public.access_governance_settings where company_id=p_company_id;
  select count(*) into roles_n from public.roles where company_id=p_company_id;
  select count(*) into empty_roles from public.roles r where r.company_id=p_company_id and r.slug<>'owner' and not exists(select 1 from public.role_permissions rp where rp.role_id=r.id and rp.allowed);
  select count(*),count(*) filter(where status='active') into members_n,active_members from public.company_memberships where company_id=p_company_id;
  select count(*) into no_manager from public.company_memberships m join public.roles r on r.id=m.role_id where m.company_id=p_company_id and m.status='active' and r.slug<>'owner' and m.manager_user_id is null;
  select count(*) into first_login from public.company_memberships m left join public.account_security s on s.user_id=m.user_id where m.company_id=p_company_id and m.status in ('active','invited') and coalesce(s.must_change_password,false);
  select count(*) into expiring from public.company_memberships where company_id=p_company_id and status='active' and access_ends_at between now() and now()+interval '14 days';
  select count(*) into dead_manager from public.company_memberships e join public.company_memberships mgr on mgr.company_id=e.company_id and mgr.user_id=e.manager_user_id where e.company_id=p_company_id and e.status='active' and mgr.status<>'active';
  select count(*) into expired_invites from public.company_invitations where company_id=p_company_id and status='pending' and expires_at<now();
  select count(*) into override_heavy from (select membership_id,count(*) n from public.member_permission_overrides mpo join public.company_memberships m on m.id=mpo.membership_id where m.company_id=p_company_id group by membership_id having count(*)>=6) q;
  select count(*) into units_n from public.organization_units where company_id=p_company_id and is_active;
  select count(*) into project_n from public.projects where company_id=p_company_id and archived_at is null;
  select coalesce(sum(size_bytes),0) into storage_used from public.document_versions where company_id=p_company_id and upload_state in ('uploading','ready');
  select * into limits from app_private.effective_company_limits(p_company_id);
  identity_ok:=coalesce(nullif(c.name,''),null) is not null and c.official_email is not null and c.country_code is not null and c.timezone is not null;
  branding_ok:=b.company_id is not null and coalesce(nullif(b.app_name,''),null) is not null;
  work_ok:=ws.company_id is not null;
  roles_ok:=roles_n>0 and empty_roles=0;
  org_ok:=units_n>0;
  team_ok:=active_members>0;
  governance_ok:=gov.company_id is not null;
  projects_ok:=project_n>0;

  steps:=jsonb_build_array(
    jsonb_build_object('key','identity','done',identity_ok,'route','settings','label_ar','هوية وبيانات الشركة','label_en','Company identity'),
    jsonb_build_object('key','branding','done',branding_ok,'route','settings','label_ar','الهوية البصرية','label_en','Branding'),
    jsonb_build_object('key','work','done',work_ok,'route','organization','label_ar','أيام وساعات العمل','label_en','Work schedule'),
    jsonb_build_object('key','roles','done',roles_ok,'route','roles','label_ar','الأدوار والصلاحيات','label_en','Roles & permissions'),
    jsonb_build_object('key','structure','done',org_ok,'route','organization','label_ar','الهيكل التنظيمي','label_en','Organization structure'),
    jsonb_build_object('key','team','done',team_ok,'route','team','label_ar','الفريق','label_en','Team'),
    jsonb_build_object('key','governance','done',governance_ok,'route','roles','label_ar','حوكمة الوصول','label_en','Access governance'),
    jsonb_build_object('key','projects','done',projects_ok,'route','projects','label_ar','المشاريع','label_en','Projects')
  );

  if not identity_ok then score:=score-14; issues:=issues||jsonb_build_array(jsonb_build_object('code','identity_incomplete','severity','warning','route','settings','title_ar','بيانات الشركة غير مكتملة','title_en','Company profile is incomplete','detail_ar','أكمل البريد الرسمي والدولة والمنطقة الزمنية.','detail_en','Complete official email, country, and timezone.')); end if;
  if not work_ok then score:=score-10; issues:=issues||jsonb_build_array(jsonb_build_object('code','work_settings_missing','severity','warning','route','organization','title_ar','أيام وساعات العمل غير محددة','title_en','Work schedule is not configured','detail_ar','حدد أيام وساعات العمل قبل بناء التقويم والتوزيع الذكي.','detail_en','Configure working days and hours before calendar and smart assignment.')); end if;
  if empty_roles>0 then score:=score-least(15,empty_roles*5); issues:=issues||jsonb_build_array(jsonb_build_object('code','empty_roles','severity','danger','route','roles','count',empty_roles,'title_ar','أدوار بدون صلاحيات','title_en','Roles without permissions','detail_ar','يوجد أدوار لا تمنح أي صلاحية فعلية.','detail_en','Some roles grant no effective permissions.')); end if;
  if no_manager>0 then score:=score-least(12,no_manager*2); issues:=issues||jsonb_build_array(jsonb_build_object('code','members_no_manager','severity','warning','route','team','count',no_manager,'title_ar','أعضاء بدون مدير مباشر','title_en','Members without direct manager','detail_ar','ربط المدير الآن يمنع مشاكل التصعيد والموافقات لاحقًا.','detail_en','Assign managers now to avoid escalation and approval gaps later.')); end if;
  if first_login>0 then score:=score-least(8,first_login*2); issues:=issues||jsonb_build_array(jsonb_build_object('code','first_login_pending','severity','info','route','team','count',first_login,'title_ar','حسابات لم تكمل أول دخول','title_en','Accounts pending first login','detail_ar','تابع الحسابات التي ما زالت على كلمة المرور المؤقتة.','detail_en','Follow up on accounts still using temporary credentials.')); end if;
  if expiring>0 then score:=score-least(8,expiring); issues:=issues||jsonb_build_array(jsonb_build_object('code','access_expiring','severity','warning','route','team','count',expiring,'title_ar','صلاحيات وصول تنتهي قريبًا','title_en','Access expiring soon','detail_ar','راجع الأعضاء الذين ينتهي وصولهم خلال 14 يومًا.','detail_en','Review members whose access ends within 14 days.')); end if;
  if dead_manager>0 then score:=score-least(15,dead_manager*5); issues:=issues||jsonb_build_array(jsonb_build_object('code','inactive_manager','severity','danger','route','organization','count',dead_manager,'title_ar','مدير غير نشط مرتبط بموظفين','title_en','Inactive manager still has reports','detail_ar','انقل التقارير إلى مدير نشط.','detail_en','Reassign reports to an active manager.')); end if;
  if expired_invites>0 then score:=score-least(5,expired_invites); issues:=issues||jsonb_build_array(jsonb_build_object('code','expired_invitations','severity','info','route','team','count',expired_invites,'title_ar','دعوات منتهية','title_en','Expired invitations','detail_ar','أعد الإرسال أو ألغِ الدعوات القديمة.','detail_en','Resend or revoke stale invitations.')); end if;
  if override_heavy>0 then score:=score-least(10,override_heavy*3); issues:=issues||jsonb_build_array(jsonb_build_object('code','override_heavy','severity','warning','route','roles','count',override_heavy,'title_ar','استثناءات فردية كثيرة','title_en','Too many member exceptions','detail_ar','الأفضل تحويل الاستثناءات المتكررة إلى Role Add-on.','detail_en','Convert recurring exceptions into role add-ons.')); end if;
  if not org_ok then score:=score-10; issues:=issues||jsonb_build_array(jsonb_build_object('code','organization_missing','severity','warning','route','organization','title_ar','الهيكل التنظيمي لم يبدأ','title_en','Organization structure not started','detail_ar','أنشئ إدارة أو فريقًا واحدًا على الأقل.','detail_en','Create at least one department or team.')); end if;
  if limits.max_members is not null and active_members>=limits.max_members then issues:=issues||jsonb_build_array(jsonb_build_object('code','member_limit','severity','danger','route','settings','title_ar','تم الوصول لحد أعضاء الباقة','title_en','Member plan limit reached','detail_ar','لن يمكن تفعيل أعضاء إضافيين قبل رفع الحد.','detail_en','Additional members cannot be activated until the limit changes.')); end if;
  if limits.max_projects is not null and project_n>=limits.max_projects then issues:=issues||jsonb_build_array(jsonb_build_object('code','project_limit','severity','warning','route','settings','title_ar','تم الوصول لحد المشاريع','title_en','Project plan limit reached','detail_ar','راجع الخطة قبل إنشاء مشروع جديد.','detail_en','Review the plan before creating another project.')); end if;
  if limits.max_storage_bytes is not null and limits.max_storage_bytes>0 and storage_used>=limits.max_storage_bytes*0.85 then issues:=issues||jsonb_build_array(jsonb_build_object('code','storage_near_limit','severity',case when storage_used>=limits.max_storage_bytes then 'danger' else 'warning' end,'route','settings','title_ar','التخزين يقترب من الحد','title_en','Storage is near its limit','detail_ar','راجع الملفات أو حد التخزين قبل توقف الرفع.','detail_en','Review files or storage limits before uploads are blocked.')); end if;
  score:=greatest(0,least(100,score));
  return jsonb_build_object('score',score,'steps',steps,'issues',issues,'metrics',jsonb_build_object('roles',roles_n,'empty_roles',empty_roles,'members',members_n,'active_members',active_members,'units',units_n,'projects',project_n,'pending_first_login',first_login,'expiring_access',expiring,'expired_invitations',expired_invites,'heavy_overrides',override_heavy,'storage_bytes',storage_used),'generated_at',now());
end $$;
grant execute on function public.organization_health_snapshot(uuid) to authenticated;
revoke all on function public.organization_health_snapshot(uuid) from public,anon;

