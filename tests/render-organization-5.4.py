import asyncio, json, os, re, subprocess, time
from pathlib import Path
from urllib.parse import urlparse
import mimetypes
from playwright.async_api import async_playwright

USER='11111111-1111-4111-8111-111111111111'
COMPANY='22222222-2222-4222-8222-222222222222'
MEMBERSHIP='33333333-3333-4333-8333-333333333333'
OWNER_ROLE='44444444-4444-4444-8444-444444444444'
ENGINEER_ROLE='55555555-5555-4555-8555-555555555555'
CUSTOM_ROLE='66666666-6666-4666-8666-666666666666'
TPL='77777777-7777-4777-8777-777777777777'

permissions=[
 ('company.view','company','عرض بيانات الشركة','View company'),('company.manage','company','تعديل إعدادات الشركة','Manage company'),
 ('members.view','members','عرض أعضاء الشركة','View members'),('members.invite','members','إنشاء حسابات أعضاء','Invite members'),('members.manage','members','إدارة الأعضاء','Manage members'),
 ('roles.view','roles','عرض الأدوار','View roles'),('roles.create','roles','إنشاء أدوار','Create roles'),('roles.manage','roles','إدارة الأدوار','Manage roles'),('roles.delete','roles','حذف الأدوار','Delete roles'),('roles.templates.use','roles','استخدام قوالب الأدوار','Use role templates'),
 ('branding.view','branding','عرض هوية الشركة','View branding'),('branding.manage','branding','تعديل هوية الشركة','Manage branding'),
 ('compensation.view','compensation','عرض الرواتب','View compensation'),('compensation.manage','compensation','إدارة الرواتب','Manage compensation'),
 ('audit.view','audit','عرض سجل النشاط','View audit'),
]
perms=[{'key':k,'module':m,'description_ar':ar,'description_en':en} for k,m,ar,en in permissions]
role_perms=[{'role_id':OWNER_ROLE,'permission_key':p['key'],'allowed':True} for p in perms]
role_perms += [{'role_id':ENGINEER_ROLE,'permission_key':k,'allowed':True} for k in ['members.view','roles.view','company.view','branding.view']]
role_perms += [{'role_id':CUSTOM_ROLE,'permission_key':'audit.view','allowed':True}]
roles=[
 {'id':OWNER_ROLE,'company_id':COMPANY,'slug':'owner','name_ar':'صاحب الشركة','name_en':'Owner','description_ar':'الدور الأعلى','description_en':'Top role','color':'#4f46e5','icon':'shield','is_protected':True,'sort_order':1},
 {'id':ENGINEER_ROLE,'company_id':COMPANY,'slug':'engineer','name_ar':'مهندس','name_en':'Engineer','description_ar':'عمل هندسي','description_en':'Engineering work','color':'#0ea5e9','icon':'briefcase','is_protected':True,'sort_order':2},
 {'id':CUSTOM_ROLE,'company_id':COMPANY,'slug':'claims-tracker','name_ar':'متابع مستخلصات','name_en':'Claims Tracker','description_ar':'متابعة مالية','description_en':'Financial tracking','color':'#f59e0b','icon':'shield','is_protected':False,'sort_order':3},
]
company={'id':COMPANY,'name':'Optimum Test','slug':'optimum-test','legal_name':'Optimum Test LLC','short_code':'OPT','official_email':'office@example.com','phone':'01000000000','whatsapp':'01000000000','country_code':'EG','city':'Cairo','address':'Test address','website':'https://example.com','industry':'Construction','registration_number':'REG-1','tax_number':'TAX-1','primary_contact_name':'Owner User','primary_contact_email':'owner@example.com','primary_contact_phone':'01000000000','billing_contact_name':'Finance','billing_contact_email':'finance@example.com','billing_contact_phone':'01000000001','technical_contact_name':'Tech','technical_contact_email':'tech@example.com','technical_contact_phone':'01000000002','timezone':'Africa/Cairo','default_locale':'ar','created_at':'2026-08-01T00:00:00Z'}
profile={'id':USER,'full_name':'Owner User','phone':'01000000000','whatsapp':'01000000000','timezone':'Africa/Cairo','avatar_path':None}
membership={'id':MEMBERSHIP,'company_id':COMPANY,'user_id':USER,'role_id':OWNER_ROLE,'status':'active','joined_at':'2026-08-01T00:00:00Z','employee_code':'OWN-001','job_title':'Owner','department':'Management','invited_email':'owner@example.com'}
subscription={'company_id':COMPANY,'plan_id':'plan1','status':'active','starts_at':'2026-08-01T00:00:00Z','current_period_ends_at':'2026-09-01T00:00:00Z','billing_cycle':'monthly','payment_status':'paid','max_members_override':25,'max_projects_override':10,'max_storage_bytes_override':10737418240}
branding={'company_id':COMPANY,'app_name':'Optimum Test','tagline':'Work better','primary_color':'#4f46e5','accent_color':'#14b8a6','neutral_color':'#64748b','default_theme':'system','sidebar_style':'glass','radius_style':'rounded','density':'comfortable','logo_shape':'rounded','logo_path':None}
activities=[
 {'id':1,'action':'role.updated','entity_type':'role','entity_id':CUSTOM_ROLE,'metadata':{'permissions':3,'slug':'claims-tracker'},'created_at':'2026-08-06T09:00:00Z','actor_id':USER,'actor_name':'Owner User','actor_avatar_path':None},
 {'id':2,'action':'company.settings_updated','entity_type':'company','entity_id':COMPANY,'metadata':{'fields':['name','branding']},'created_at':'2026-08-06T08:00:00Z','actor_id':USER,'actor_name':'Owner User','actor_avatar_path':None},
]
plans=[{'id':'plan1','code':'starter','name_ar':'البداية','name_en':'Starter','max_members':25,'max_projects':10,'max_storage_bytes':10737418240,'sort_order':1,'is_active':True}]
templates=[{'id':TPL,'code':'project-manager','name_ar':'مدير مشروع','name_en':'Project Manager','description_ar':'إدارة المشروع','description_en':'Manage project','color':'#7c3aed','icon':'briefcase','category':'management','is_active':True,'is_recommended':True,'sort_order':1}]
template_perms=[{'template_id':TPL,'permission_key':'members.view','allowed':True},{'template_id':TPL,'permission_key':'audit.view','allowed':True}]


ROOT=Path(__file__).resolve().parents[1]
async def local_route(route, request):
 url=urlparse(request.url)
 base=ROOT/'platform-console' if url.hostname=='platform.test' else ROOT
 rel=url.path.lstrip('/') or 'index.html'
 target=(base/rel).resolve()
 if not str(target).startswith(str(base.resolve())) or not target.is_file():
  await route.fulfill(status=404,body='not found'); return
 mime=mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
 await route.fulfill(status=200,content_type=mime,body=target.read_bytes())

captured={'client_role':None,'client_member':None,'settings':[],'platform_template':None,'platform_company':None,'storage_uploads':[]}

def session():
 return {'access_token':'mock-access','refresh_token':'mock-refresh','expires_at':4102444800,'user':{'id':USER,'email':'owner@example.com','user_metadata':{'full_name':'Owner User'}}}

def table_payload(table, platform=False):
 data={
  'profiles':[profile], 'account_security':[{'user_id':USER,'must_change_password':False}],
  'company_memberships':[membership], 'platform_admins':[{'user_id':USER,'role':'owner','is_active':True}],
  'service_plans':plans, 'companies':[company], 'company_subscriptions':[subscription], 'roles':roles,
  'permissions':perms, 'company_invitations':[], 'projects':[], 'sites':[], 'company_branding':[branding],
  'role_templates':templates, 'role_template_permissions':template_perms, 'role_permissions':role_perms,
  'member_permission_overrides':[], 'member_compensation':[], 'audit_events':activities,
  'platform_audit_events':[{'id':1,'actor_id':USER,'action':'platform.company_created','metadata':{'company':'Optimum Test'},'created_at':'2026-08-06T08:00:00Z'}],
 }
 return data.get(table,[])

async def mock_route(route, request):
 url=urlparse(request.url); path=url.path
 try: body=json.loads(request.post_data or '{}')
 except: body={}
 if '/storage/v1/object/' in path:
  if '/sign/' in path:
   await route.fulfill(status=200,content_type='application/json',body=json.dumps({'signedURL':'/storage/v1/object/sign/mock'})); return
  captured['storage_uploads'].append(path)
  await route.fulfill(status=200,content_type='application/json',body='{}'); return
 if '/functions/v1/identity-provisioning' in path:
  if body.get('action')=='create_member':
   captured['client_member']=body
   payload={'ok':True,'company_id':COMPANY,'membership_id':'99999999-9999-4999-8999-999999999999','user_id':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','email':body['member']['email'],'temporary_password':'Tmp!Pass12345','temporary_password_expires_at':'2026-08-08T00:00:00Z','existing_account':False,'email_delivery':'not_configured'}
  elif body.get('action')=='create_company':
   captured['platform_company']=body
   payload={'ok':True,'company_id':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','membership_id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','user_id':'dddddddd-dddd-4ddd-8ddd-dddddddddddd','email':body['owner']['email'],'temporary_password':'Tmp!Owner12345','temporary_password_expires_at':'2026-08-08T00:00:00Z','existing_account':False,'email_delivery':'not_configured'}
  else: payload={'ok':True}
  await route.fulfill(status=200,content_type='application/json',body=json.dumps(payload)); return
 if '/rest/v1/rpc/' in path:
  name=path.rsplit('/',1)[-1]
  if name=='company_activity_feed': payload=activities
  elif name=='platform_company_directory': payload=[{**company,'company_id':COMPANY,'company_name':company['name'],'company_slug':company['slug'],'status':'active','plan_id':'plan1','plan_code':'starter','plan_name_ar':'البداية','plan_name_en':'Starter','member_count':1,'project_count':0,'storage_bytes':0,'max_members':25,'max_projects':10,'max_storage_bytes':10737418240,'created_at':company['created_at'],'billing_cycle':'monthly','agreed_price':1000,'currency':'EGP','payment_status':'paid','onboarding_status':'ready','owner_user_id':USER,'owner_name':'Owner User','owner_email':'owner@example.com','owner_phone':'01000000000','owner_must_change_password':False,'branding_logo_path':None,'branding_app_name':'Optimum Test','salary_amount':None}]
  elif name=='platform_company_overview': payload=[]
  elif name=='save_company_role_definition':
   captured['client_role']=body
   payload={'ok':True,'role_id':CUSTOM_ROLE,'permission_count':len(body.get('p_payload',{}).get('permission_keys',[])),'permission_keys':body.get('p_payload',{}).get('permission_keys',[])}
  elif name=='platform_save_role_template_definition':
   captured['platform_template']=body
   payload={'ok':True,'template_id':TPL,'permission_count':len(body.get('p_payload',{}).get('permission_keys',[])),'permission_keys':body.get('p_payload',{}).get('permission_keys',[])}
  elif name=='save_company_workspace_settings':
   captured['settings'].append(body)
   payload={'company':{**company,**body.get('p_company',{})},'branding':{**branding,**body.get('p_branding',{})}}
  elif name=='save_workspace_settings_draft':
   captured['settings'].append(body)
   payload={'draft':{'id':'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'},'changed_company_fields':list(body.get('p_company',{}).keys()),'changed_branding_fields':list(body.get('p_branding',{}).keys())}
  elif name=='publish_workspace_settings_draft': payload={'ok':True,'version':1}
  elif name in ('save_member_hr_profile','save_member_control_profile'): payload={'ok':True}
  elif name in ('company_storage_metrics','work_dashboard_metrics'): payload={'used_bytes':0,'storage_bytes':0,'document_count':0,'version_count':0}
  else: payload=[] if name.endswith('_feed') else {'ok':True}
  await route.fulfill(status=200,content_type='application/json',body=json.dumps(payload)); return
 if '/rest/v1/' in path:
  table=path.split('/rest/v1/',1)[1].split('?',1)[0]
  await route.fulfill(status=200,content_type='application/json',body=json.dumps(table_payload(table))); return
 if '/auth/v1/user' in path:
  await route.fulfill(status=200,content_type='application/json',body=json.dumps(session()['user'])); return
 if '/auth/v1/logout' in path:
  await route.fulfill(status=204,body=''); return
 if '/auth/v1/' in path:
  await route.fulfill(status=200,content_type='application/json',body=json.dumps(session())); return
 await route.fulfill(status=404,body='not mocked')

async def initialize(page, scope):
 initial={f'optimum.session.v2.{scope}':json.dumps(session()),'optimum.company.v1':COMPANY}
 script=f"""(() => {{
   const values = {json.dumps(initial)};
   const storage = {{
     get length() {{ return Object.keys(values).length; }},
     key(index) {{ return Object.keys(values)[index] ?? null; }},
     getItem(key) {{ return Object.prototype.hasOwnProperty.call(values,key) ? String(values[key]) : null; }},
     setItem(key,value) {{ values[key]=String(value); }},
     removeItem(key) {{ delete values[key]; }},
     clear() {{ for (const key of Object.keys(values)) delete values[key]; }}
   }};
   Object.defineProperty(window,'localStorage',{{configurable:true,value:storage}});
 }})();"""
 await page.evaluate(script)
 await page.route('https://wzcaquxuvqfbstpxujsj.supabase.co/**',mock_route)


# Expanded directory data for Phase 5.4 visual QA.
USER2='12111111-1111-4111-8111-111111111111'
USER3='13111111-1111-4111-8111-111111111111'
USER4='14111111-1111-4111-8111-111111111111'
USER5='15111111-1111-4111-8111-111111111111'
USER6='16111111-1111-4111-8111-111111111111'
profiles_extra=[
 {'id':USER2,'full_name':'سارة أحمد','phone':'01011111111','whatsapp':'01011111111','timezone':'Africa/Cairo','avatar_path':None},
 {'id':USER3,'full_name':'محمود علي','phone':'01022222222','whatsapp':'01022222222','timezone':'Africa/Cairo','avatar_path':None},
 {'id':USER4,'full_name':'يوسف خالد','phone':'01033333333','whatsapp':'01033333333','timezone':'Africa/Cairo','avatar_path':None},
 {'id':USER5,'full_name':'منى إبراهيم','phone':'01044444444','whatsapp':'01044444444','timezone':'Africa/Cairo','avatar_path':None},
 {'id':USER6,'full_name':'أحمد سمير','phone':'01055555555','whatsapp':'01055555555','timezone':'Africa/Cairo','avatar_path':None},
]
members_extra=[
 {'id':'31333333-3333-4333-8333-333333333331','company_id':COMPANY,'user_id':USER2,'role_id':ENGINEER_ROLE,'status':'active','joined_at':'2026-08-02T00:00:00Z','employee_code':'ENG-014','job_title':'مهندسة شبكات','department':'الهندسة','manager_user_id':USER,'invited_email':'sara@example.com'},
 {'id':'31333333-3333-4333-8333-333333333332','company_id':COMPANY,'user_id':USER3,'role_id':CUSTOM_ROLE,'status':'active','joined_at':'2026-08-02T00:00:00Z','employee_code':'FIN-008','job_title':'متابع مستخلصات','department':'المالية','manager_user_id':USER,'invited_email':'mahmoud@example.com'},
 {'id':'31333333-3333-4333-8333-333333333333','company_id':COMPANY,'user_id':USER4,'role_id':ENGINEER_ROLE,'status':'invited','employee_code':'ENG-021','job_title':'مهندس موقع','department':'التنفيذ','manager_user_id':USER2,'invited_email':'youssef@example.com'},
 {'id':'31333333-3333-4333-8333-333333333334','company_id':COMPANY,'user_id':USER5,'role_id':ENGINEER_ROLE,'status':'suspended','joined_at':'2026-07-15T00:00:00Z','employee_code':'QA-006','job_title':'مهندسة جودة','department':'الجودة','manager_user_id':USER,'invited_email':'mona@example.com'},
 {'id':'31333333-3333-4333-8333-333333333335','company_id':COMPANY,'user_id':USER6,'role_id':CUSTOM_ROLE,'status':'active','joined_at':'2026-08-04T00:00:00Z','employee_code':'OPS-017','job_title':'منسق عمليات','department':'العمليات','manager_user_id':USER3,'access_ends_at':'2026-08-20T00:00:00Z','invited_email':'ahmed@example.com'},
]
original_table_payload=table_payload
def table_payload(table, platform=False):
 data=original_table_payload(table,platform)
 if table=='profiles': return data+profiles_extra
 if table=='company_memberships': return data+members_extra
 if table=='member_permission_overrides': return [{'membership_id':members_extra[1]['id'],'permission_key':'audit.view','allowed':True},{'membership_id':members_extra[4]['id'],'permission_key':'company.manage','allowed':False}]
 if table=='member_compensation': return [
  {'membership_id':members_extra[0]['id'],'company_id':COMPANY,'salary_amount':18000,'currency':'EGP','pay_frequency':'monthly'},
  {'membership_id':members_extra[1]['id'],'company_id':COMPANY,'salary_amount':15500,'currency':'EGP','pay_frequency':'monthly'}]
 return data

async def capture(page, name):
 await page.wait_for_timeout(500)
 await page.locator('.toast-stack').evaluate_all("els=>els.forEach(e=>e.remove())")
 await page.screenshot(path=f'/mnt/data/{name}',full_page=True)

async def organization_visual_flow(browser):
 page=await browser.new_page(viewport={'width':1600,'height':1050},device_scale_factor=1)
 await initialize(page,'client')
 await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/team"</script>',1)
 await page.set_content(html,wait_until='networkidle')
 await page.locator('.team-directory').wait_for(state='visible',timeout=8000)
 await capture(page,'optimum54-team.png')
 await page.locator('[data-nav="roles"]').click()
 await page.locator('.role-studio-grid').wait_for(state='visible',timeout=5000)
 await capture(page,'optimum54-roles.png')
 await page.locator('[data-nav="settings"]').click()
 await page.locator('.settings-command-center').wait_for(state='visible',timeout=5000)
 await capture(page,'optimum54-settings-overview.png')
 await page.locator('[data-action="settings-tab"][data-tab="company"]').first.click()
 await page.locator('form[data-form="company-settings"]').wait_for(state='visible',timeout=5000)
 await capture(page,'optimum54-settings-company.png')
 await page.locator('[data-action="settings-tab"][data-tab="branding"]').first.click()
 await page.locator('form[data-form="company-branding"]').wait_for(state='visible',timeout=5000)
 await capture(page,'optimum54-settings-branding.png')
 await page.close()

async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  await organization_visual_flow(browser)
  await browser.close()
 print(json.dumps({'ok':True,'screenshots':['optimum54-team.png','optimum54-roles.png','optimum54-settings-overview.png','optimum54-settings-company.png','optimum54-settings-branding.png']},ensure_ascii=False,indent=2))

asyncio.run(main())
