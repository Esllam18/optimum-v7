import asyncio, json, os, re, subprocess, time, sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import mimetypes
from playwright.async_api import async_playwright

USER='11111111-1111-4111-8111-111111111111'
USER2='12111111-1111-4111-8111-111111111112'
COMPANY='22222222-2222-4222-8222-222222222222'
MEMBERSHIP='33333333-3333-4333-8333-333333333333'
MEMBERSHIP2='34333333-3333-4333-8333-333333333334'
UNIT='35333333-3333-4333-8333-333333333335'
OWNER_ROLE='44444444-4444-4444-8444-444444444444'
ENGINEER_ROLE='55555555-5555-4555-8555-555555555555'
CUSTOM_ROLE='66666666-6666-4666-8666-666666666666'
TPL='77777777-7777-4777-8777-777777777777'
TASK='90909090-9090-4090-8090-909090909090'
SITE='a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1'
FOLDER='b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'
FOLDER2='b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2'
DOC='c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1'
VERSION='d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'
BLUEPRINT='e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1'
CABINET='e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2'
CLAIM='f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2'
CLAIM_REQ='a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3'
CAB_ROOT='b4b4b4b4-b4b4-44b4-84b4-b4b4b4b4b4b4'
SITE_FOLDER='b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3'
SITE_DOC='c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3'
SITE_VERSION='d3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3'

permissions=[
 ('company.view','company','عرض بيانات الشركة','View company'),('company.manage','company','تعديل إعدادات الشركة','Manage company'),
 ('members.view','members','عرض أعضاء الشركة','View members'),('members.invite','members','إنشاء حسابات أعضاء','Invite members'),('members.manage','members','إدارة الأعضاء','Manage members'),
 ('roles.view','roles','عرض الأدوار','View roles'),('roles.create','roles','إنشاء أدوار','Create roles'),('roles.manage','roles','إدارة الأدوار','Manage roles'),('roles.delete','roles','حذف الأدوار','Delete roles'),('roles.templates.use','roles','استخدام قوالب الأدوار','Use role templates'),
 ('branding.view','branding','عرض هوية الشركة','View branding'),('branding.manage','branding','تعديل هوية الشركة','Manage branding'),
 ('compensation.view','compensation','عرض الرواتب','View compensation'),('compensation.manage','compensation','إدارة الرواتب','Manage compensation'),
 ('audit.view','audit','عرض سجل النشاط','View audit'),
 ('search.use','search','استخدام البحث الشامل','Use global search'),
 ('projects.view','projects','عرض المشاريع','View projects'),('projects.create','projects','إنشاء المشاريع','Create projects'),('projects.edit','projects','تعديل المشاريع','Edit projects'),('projects.archive','projects','أرشفة المشاريع','Archive projects'),
 ('tasks.view','tasks','عرض العمل','View work'),('tasks.create','tasks','إنشاء العمل','Create work'),('tasks.claim','tasks','استلام عمل مفتوح','Claim open work'),('tasks.edit','tasks','تعديل العمل','Edit work'),('tasks.complete','tasks','إكمال العمل','Complete work'),('tasks.assign','tasks','إسناد العمل','Assign work'),('tasks.comment','tasks','التعليق','Comment'),('tasks.attach','tasks','المرفقات','Attach'),('tasks.manage','tasks','إدارة العمل','Manage work'),('tasks.view_all','tasks','عرض كل العمل','View all work'),('tasks.approve','tasks','اعتماد العمل','Approve work'),('tasks.manage_templates','tasks','إدارة القوالب','Manage templates'),('tasks.manage_milestones','tasks','إدارة المراحل','Manage milestones'),('tasks.manage_automations','tasks','إدارة الأتمتة','Manage automations'),('tasks.view_workload','tasks','عرض الأحمال','View workload'),
]
entitlement_by_module={'company':'module.company','members':'module.members','roles':'module.roles','branding':'module.branding','compensation':'module.hr','audit':'module.audit','search':'module.search','projects':'module.projects','tasks':'module.tasks'}
perms=[{'key':k,'module':m,'description_ar':ar,'description_en':en,'entitlement_key':entitlement_by_module[m],'scope_mode':'resource' if m=='projects' else 'company'} for k,m,ar,en in permissions]
entitlement_defs={
 'module.company':('company','إدارة الشركة','Company management'),'module.members':('members','الفريق','Team'),'module.roles':('roles','الأدوار والصلاحيات','Roles & permissions'),'module.branding':('branding','هوية الشركة','Company branding'),'module.hr':('hr','بيانات الموارد البشرية','HR data'),'module.audit':('audit','سجل النشاط','Activity audit'),'feature.advanced_audit':('audit','السجل المتقدم','Advanced audit'),'module.search':('search','البحث الشامل','Global search'),'module.projects':('projects','المشاريع والمواقع','Projects & sites'),'module.tasks':('tasks','العمل والتسليم','Work & delivery')
}
entitlements=[{'key':key,'module':module,'name_ar':ar,'name_en':en,'description_ar':'','description_en':'','scope_mode':'resource' if module=='projects' else 'company','is_active':True,'sort_order':i+1} for i,(key,(module,ar,en)) in enumerate(entitlement_defs.items())]
plan_entitlements=[{'plan_id':'plan1','entitlement_key':ent['key'],'enabled':True,'limits':{}} for ent in entitlements]
role_perms=[{'role_id':OWNER_ROLE,'permission_key':p['key'],'allowed':True} for p in perms]
role_perms += [{'role_id':ENGINEER_ROLE,'permission_key':k,'allowed':True} for k in ['members.view','roles.view','company.view','branding.view','tasks.view','tasks.claim','tasks.edit','tasks.complete','tasks.comment','tasks.attach']]
role_perms += [{'role_id':CUSTOM_ROLE,'permission_key':'audit.view','allowed':True}]
roles=[
 {'id':OWNER_ROLE,'company_id':COMPANY,'slug':'owner','name_ar':'صاحب الشركة','name_en':'Owner','description_ar':'الدور الأعلى','description_en':'Top role','color':'#4f46e5','icon':'shield','is_protected':True,'sort_order':1},
 {'id':ENGINEER_ROLE,'company_id':COMPANY,'slug':'engineer','name_ar':'مهندس','name_en':'Engineer','description_ar':'عمل هندسي','description_en':'Engineering work','color':'#0ea5e9','icon':'briefcase','is_protected':True,'sort_order':2},
 {'id':CUSTOM_ROLE,'company_id':COMPANY,'slug':'claims-tracker','name_ar':'متابع مستخلصات','name_en':'Claims Tracker','description_ar':'متابعة مالية','description_en':'Financial tracking','color':'#f59e0b','icon':'shield','is_protected':False,'sort_order':3},
]
projects=[
 {'id':'abababab-abab-4bab-8bab-ababababab01','company_id':COMPANY,'code':'ALPHA','name':'Alpha Project','description':'First test project','status':'active','created_by':USER,'created_at':'2026-08-01T00:00:00Z','updated_at':'2026-08-06T00:00:00Z','archived_at':None},
 {'id':'abababab-abab-4bab-8bab-ababababab02','company_id':COMPANY,'code':'BETA','name':'Beta Project','description':'Second test project','status':'planned','created_by':USER,'created_at':'2026-08-01T00:00:00Z','updated_at':'2026-08-05T00:00:00Z','archived_at':None},
]
sites_pdc=[{'id':SITE,'company_id':COMPANY,'project_id':projects[0]['id'],'code':'SITE-01','name':'Alpha Main Site','description':'Primary delivery site','status':'active','manager_user_id':USER2,'address':'New Cairo','latitude':30.020000,'longitude':31.490000,'timezone':'Africa/Cairo','start_date':'2026-08-01','target_end_date':'2026-12-31','created_by':USER,'created_at':'2026-08-01T00:00:00Z','updated_at':'2026-08-07T00:00:00Z','archived_at':None}]
project_blueprints_pdc=[{'id':BLUEPRINT,'company_id':None,'code':'standard-engineering','name_ar':'هندسي قياسي','name_en':'Standard Engineering','description_ar':'هيكل هندسي عام','description_en':'General engineering workspace','project_type':'engineering','folder_template_id':'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0','is_active':True,'is_default':True,'created_at':'2026-08-01T00:00:00Z'}]
folders_pdc=[{'id':FOLDER,'company_id':COMPANY,'project_id':projects[0]['id'],'site_id':None,'parent_id':None,'name':'01 — Drawings','code':'01','depth':0,'sort_order':10,'is_system':True,'child_count':1,'document_count':1,'created_by':USER,'created_at':'2026-08-01T00:00:00Z','updated_at':'2026-08-07T00:00:00Z','archived_at':None,'trashed_at':None},{'id':FOLDER2,'company_id':COMPANY,'project_id':projects[0]['id'],'site_id':None,'parent_id':FOLDER,'name':'Electrical','code':'ELE','depth':1,'sort_order':20,'is_system':True,'child_count':0,'document_count':0,'created_by':USER,'created_at':'2026-08-01T00:00:00Z','updated_at':'2026-08-07T00:00:00Z','archived_at':None,'trashed_at':None}]
document_pdc={'id':DOC,'company_id':COMPANY,'project_id':projects[0]['id'],'site_id':None,'folder_id':FOLDER,'display_name':'Electrical Shop Drawing A-102','system_code':'ALPHA-ELE-001','document_type':'drawing','description':'Issued electrical shop drawing','tags':['electrical','shop-drawing'],'state':'active','current_version_id':VERSION,'version_count':2,'control_status':'in_review','discipline':'Electrical','owner_user_id':USER2,'review_due_at':'2026-08-10T10:00:00Z','approved_at':None,'approved_by':None,'created_by':USER2,'created_at':'2026-08-05T00:00:00Z','updated_at':'2026-08-08T08:00:00Z'}
version_pdc={'id':VERSION,'company_id':COMPANY,'document_id':DOC,'version_number':2,'version_label':'v2','original_filename':'A-102-R2.pdf','storage_bucket':'company-files','storage_path':f'{COMPANY}/{projects[0]["id"]}/project/{DOC}/{VERSION}/A-102-R2.pdf','mime_type':'application/pdf','size_bytes':2457600,'checksum_sha256':'abc123','upload_state':'ready','change_note':'Review revision','uploaded_by':USER2,'uploader_name':'Engineer User','created_at':'2026-08-08T08:00:00Z','finalized_at':'2026-08-08T08:01:00Z'}

site_folders_delivery=[
 {'id':CAB_ROOT,'company_id':COMPANY,'project_id':projects[0]['id'],'site_id':SITE,'parent_id':None,'name':'CAB-01 — Cabinet One','code':'CAB-01','depth':0,'sort_order':30,'is_system':True,'child_count':6,'document_count':1,'created_by':USER,'created_at':'2026-08-08T00:00:00Z','updated_at':'2026-08-08T00:00:00Z','trashed_at':None},
 {'id':SITE_FOLDER,'company_id':COMPANY,'project_id':projects[0]['id'],'site_id':SITE,'parent_id':CAB_ROOT,'name':'Drawings & As-Built','code':'C01','depth':1,'sort_order':10,'is_system':True,'child_count':0,'document_count':1,'created_by':USER,'created_at':'2026-08-08T00:00:00Z','updated_at':'2026-08-08T00:00:00Z','trashed_at':None}
]
site_document_pdc={'id':SITE_DOC,'company_id':COMPANY,'project_id':projects[0]['id'],'site_id':SITE,'folder_id':SITE_FOLDER,'display_name':'CAB-01 As-Built Drawing','system_code':'ALPHA-CAB01-AB-001','document_type':'drawing','description':'Cabinet as-built','tags':['as-built','cabinet'],'state':'active','current_version_id':SITE_VERSION,'version_count':1,'control_status':'approved','discipline':'Fiber','owner_user_id':USER2,'review_due_at':None,'approved_at':'2026-08-08T12:00:00Z','approved_by':USER,'created_by':USER2,'created_at':'2026-08-08T09:00:00Z','updated_at':'2026-08-08T12:00:00Z'}
site_version_pdc={'id':SITE_VERSION,'company_id':COMPANY,'document_id':SITE_DOC,'version_number':1,'version_label':'v1','original_filename':'CAB-01-AsBuilt.pdf','storage_bucket':'company-files','storage_path':f'{COMPANY}/{projects[0]["id"]}/{SITE}/{SITE_DOC}/{SITE_VERSION}/CAB-01-AsBuilt.pdf','mime_type':'application/pdf','size_bytes':1250000,'checksum_sha256':'cab123','upload_state':'ready','change_note':'As-built','uploaded_by':USER2,'uploader_name':'Engineer User','created_at':'2026-08-08T09:00:00Z','finalized_at':'2026-08-08T09:01:00Z'}
claim_requirements_fixture=[
 {'id':CLAIM_REQ,'requirement_key':'as_built_drawings','label_ar':'رسومات As-Built','label_en':'As-Built Drawings','category':'technical','is_required':True,'min_items':1,'sort_order':60,'item_count':1,'satisfied':True,'items':[{'id':'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a4a4','document_id':SITE_DOC,'display_name':site_document_pdc['display_name'],'document_type':'drawing','control_status':'approved','current_version_id':SITE_VERSION,'selected_version_id':None,'cabinet_id':CABINET,'cabinet_code':'CAB-01','cabinet_name':'Cabinet One','inclusion_mode':'auto','status':'included','folder_id':SITE_FOLDER}]},
 {'id':'a5a5a5a5-a5a5-45a5-85a5-a5a5a5a5a5a5','requirement_key':'quantity_survey','label_ar':'الحصر والكميات','label_en':'Quantity Survey / Takeoff','category':'quantity','is_required':True,'min_items':1,'sort_order':30,'item_count':0,'satisfied':False,'items':[]}
]
claim_payload={'package':{'id':CLAIM,'company_id':COMPANY,'project_id':projects[0]['id'],'site_id':SITE,'package_no':'SITE-01-FINAL','title':'Final Site Claim / Delivery Package','claim_type':'final','status':'collecting','locked_at':None,'created_by':USER,'created_at':'2026-08-08T00:00:00Z','updated_at':'2026-08-08T00:00:00Z'},'site':{'id':SITE,'code':'SITE-01','name':'Alpha Main Site'},'project':{'id':projects[0]['id'],'code':'ALPHA','name':'Alpha Project'},'progress':{'required_percent':17,'cabinet_coverage_percent':100,'overall_percent':42,'required_total':6,'required_satisfied':1,'cabinet_total':1,'cabinet_covered':1},'requirements':claim_requirements_fixture,'can_manage':True}

company={'id':COMPANY,'name':'Optimum Test','slug':'optimum-test','legal_name':'Optimum Test LLC','short_code':'OPT','official_email':'office@example.com','phone':'01000000000','whatsapp':'01000000000','country_code':'EG','city':'Cairo','address':'Test address','website':'https://example.com','industry':'Construction','registration_number':'REG-1','tax_number':'TAX-1','primary_contact_name':'Owner User','primary_contact_email':'owner@example.com','primary_contact_phone':'01000000000','billing_contact_name':'Finance','billing_contact_email':'finance@example.com','billing_contact_phone':'01000000001','technical_contact_name':'Tech','technical_contact_email':'tech@example.com','technical_contact_phone':'01000000002','timezone':'Africa/Cairo','default_locale':'ar','created_at':'2026-08-01T00:00:00Z'}
profile2={'id':USER2,'full_name':'Engineer User','phone':'01000000003','whatsapp':'01000000003','timezone':'Africa/Cairo','avatar_path':None}
membership2={'id':MEMBERSHIP2,'company_id':COMPANY,'user_id':USER2,'role_id':ENGINEER_ROLE,'status':'active','joined_at':'2026-08-02T00:00:00Z','employee_code':'ENG-001','job_title':'Electrical Engineer','department':'Engineering','invited_email':'engineer@example.com','manager_user_id':USER,'lifecycle_stage':'active','employment_type':'full_time','work_mode':'hybrid','weekly_capacity_hours':40,'experience_level':'senior','skills':['CAD','QA'],'alternate_manager_user_id':None,'primary_site_id':None,'work_schedule':{},'access_ends_at':None}
profile={'id':USER,'full_name':'Owner User','phone':'01000000000','whatsapp':'01000000000','timezone':'Africa/Cairo','avatar_path':None}
membership={'id':MEMBERSHIP,'company_id':COMPANY,'user_id':USER,'role_id':OWNER_ROLE,'status':'active','joined_at':'2026-08-01T00:00:00Z','employee_code':'OWN-001','job_title':'Owner','department':'Management','invited_email':'owner@example.com','manager_user_id':None,'lifecycle_stage':'active','employment_type':'full_time','work_mode':'onsite','weekly_capacity_hours':40,'experience_level':'lead','skills':['Management'],'alternate_manager_user_id':None,'primary_site_id':None,'work_schedule':{},'access_ends_at':None}
subscription={'company_id':COMPANY,'plan_id':'plan1','status':'active','starts_at':'2026-08-01T00:00:00Z','current_period_ends_at':'2026-09-01T00:00:00Z','billing_cycle':'monthly','payment_status':'paid','max_members_override':25,'max_projects_override':10,'max_storage_bytes_override':10737418240}
branding={'company_id':COMPANY,'app_name':'Optimum Test','tagline':'Work better','primary_color':'#4f46e5','accent_color':'#14b8a6','neutral_color':'#64748b','default_theme':'system','sidebar_style':'glass','radius_style':'rounded','density':'comfortable','logo_shape':'rounded','logo_path':None}
activities=[
 {'id':1,'action':'role.updated','entity_type':'role','entity_id':CUSTOM_ROLE,'metadata':{'permissions':3,'slug':'claims-tracker'},'created_at':'2026-08-06T09:00:00Z','actor_id':USER,'actor_name':'Owner User','actor_avatar_path':None},
 {'id':2,'action':'company.settings_updated','entity_type':'company','entity_id':COMPANY,'metadata':{'fields':['name','branding']},'created_at':'2026-08-06T08:00:00Z','actor_id':USER,'actor_name':'Owner User','actor_avatar_path':None},
]

work_task={'id':TASK,'task_number':42,'company_id':COMPANY,'project_id':projects[0]['id'],'site_id':None,'folder_id':None,'document_id':None,'title':'Review shop drawing','description':'Review and approve revision','status':'in_progress','priority':'high','visibility':'company','open_unassigned':False,'claimed_by':None,'start_at':'2026-08-08T08:00:00Z','due_at':'2026-08-09T12:00:00Z','progress':40,'created_by':USER,'updated_by':USER,'created_at':'2026-08-07T20:00:00Z','updated_at':'2026-08-07T21:00:00Z','task_type':'review','owner_user_id':USER2,'reviewer_user_id':USER,'approver_user_id':None,'estimated_minutes':240,'actual_minutes':60,'required_skills':['CAD'],'labels':['drawing'],'sla_due_at':'2026-08-09T10:00:00Z','source_type':'drawing','source_id':None,'lock_version':3,'milestone_id':None,'owner_name':'Engineer User','project_name':'Alpha Project','risk':{'score':35,'level':'medium','reasons':{'downstream':1}},'comment_count':1,'attachment_count':0,'blocker_count':0,'downstream_count':1,'can_edit':True,'can_complete':True,'can_claim':False}
work_activity={'id':99,'action':'task.status_changed','entity_type':'task','entity_id':TASK,'metadata':{'from':'todo','to':'in_progress'},'created_at':'2026-08-07T21:00:00Z','actor_id':USER2,'actor_name':'Engineer User','actor_avatar_path':None,'entity_title':'Review shop drawing','human_key':'task_status_changed'}
workflow_template={'id':'91919191-9191-4191-8191-919191919191','company_id':COMPANY,'name':'Drawing Review Workflow','description':'Execution → Review → Approval','definition':[{'title':'Prepare drawing','task_type':'task','priority':'medium','offset_days':0,'duration_days':1,'estimated_minutes':120,'depends_on':[]},{'title':'Review drawing','task_type':'review','priority':'high','offset_days':1,'duration_days':1,'estimated_minutes':60,'depends_on':[0]},{'title':'Approve drawing','task_type':'approval','priority':'high','offset_days':2,'duration_days':0,'estimated_minutes':30,'depends_on':[1]}],'is_active':True,'created_by':USER,'updated_by':USER,'created_at':'2026-08-08T00:00:00Z','updated_at':'2026-08-08T00:00:00Z'}
work_cockpit={'timezone':'Africa/Cairo','today':'2026-08-08','personal':{'open':1,'due_today':1,'overdue':0,'blocked':0,'reviews':1,'approvals':0,'upcoming':1},'focus':[work_task],'manager':{'enabled':True,'unassigned':0,'high_risk':1,'attention':[work_task],'overloaded':[{'user_id':USER2,'name':'Engineer User','capacity_hours':40,'planned_minutes':2640,'utilization':110}]}}
capacity_plan={'timezone':'Africa/Cairo','from':'2026-08-08','days':[{'date':'2026-08-08','dow':6},{'date':'2026-08-09','dow':0},{'date':'2026-08-10','dow':1}], 'members':[{'membership_id':MEMBERSHIP,'user_id':USER,'name':'Owner User','job_title':'Owner','department':'Management','weekly_capacity_hours':40,'skills':['Management']},{'membership_id':MEMBERSHIP2,'user_id':USER2,'name':'Engineer User','job_title':'Electrical Engineer','department':'Engineering','weekly_capacity_hours':40,'skills':['CAD','QA']}], 'cells':[{'membership_id':MEMBERSHIP,'user_id':USER,'date':'2026-08-08','is_work_day':False,'holiday':False,'on_leave':False,'capacity_minutes':0,'planned_minutes':0,'work_items':0,'utilization':0},{'membership_id':MEMBERSHIP2,'user_id':USER2,'date':'2026-08-08','is_work_day':False,'holiday':False,'on_leave':False,'capacity_minutes':0,'planned_minutes':120,'work_items':1,'utilization':999},{'membership_id':MEMBERSHIP,'user_id':USER,'date':'2026-08-09','is_work_day':True,'holiday':False,'on_leave':False,'capacity_minutes':480,'planned_minutes':0,'work_items':0,'utilization':0},{'membership_id':MEMBERSHIP2,'user_id':USER2,'date':'2026-08-09','is_work_day':True,'holiday':False,'on_leave':False,'capacity_minutes':480,'planned_minutes':240,'work_items':1,'utilization':50},{'membership_id':MEMBERSHIP,'user_id':USER,'date':'2026-08-10','is_work_day':True,'holiday':False,'on_leave':False,'capacity_minutes':480,'planned_minutes':0,'work_items':0,'utilization':0},{'membership_id':MEMBERSHIP2,'user_id':USER2,'date':'2026-08-10','is_work_day':True,'holiday':False,'on_leave':True,'capacity_minutes':0,'planned_minutes':0,'work_items':0,'utilization':0}]}
dependency_graph={'nodes':[dict(work_task,impact_score=61,downstream_count=1,blocker_count=0),{**work_task,'id':'92929292-9292-4292-8292-929292929292','task_number':43,'title':'Approve shop drawing','status':'todo','owner_user_id':USER,'owner_name':'Owner User','risk':{'score':20,'level':'low','reasons':{}},'impact_score':20,'downstream_count':0,'blocker_count':1}], 'edges':[{'id':'93939393-9393-4393-8393-939393939393','blocker_task_id':TASK,'blocked_task_id':'92929292-9292-4292-8292-929292929292','dependency_type':'finish_to_start'}]}
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

captured={'actor':'owner','disabled_entitlements':set(),'client_role':None,'client_member':None,'settings':[],'platform_template':None,'platform_company':None,'storage_uploads':[],'saved_views':[],'bulk_calls':[],'work_settings':[],'work_calls':[],'workflow_calls':[],'pdc_calls':[]}

def enable_pdc_contracts():
 if captured.get('pdc_enabled'): return
 captured['pdc_enabled']=True
 if 'module.files' not in entitlement_defs:
  entitlement_defs['module.files']=('files','مساحة المستندات','Document workspace')
  entitlements.append({'key':'module.files','module':'files','name_ar':'مساحة المستندات','name_en':'Document workspace','description_ar':'','description_en':'','scope_mode':'resource','is_active':True,'sort_order':len(entitlements)+1})
  plan_entitlements.append({'plan_id':'plan1','entitlement_key':'module.files','enabled':True,'limits':{}})
 file_defs=[('files.view','عرض الملفات','View files'),('files.upload','رفع الملفات','Upload files'),('files.create_folder','إنشاء المجلدات','Create folders'),('files.rename','إعادة التسمية','Rename files'),('files.move','نقل الملفات','Move files'),('files.archive','نقل للسلة','Move to trash'),('files.restore','استعادة','Restore'),('files.download','تنزيل','Download'),('files.manage','إدارة متقدمة','Manage files')]
 existing={x['key'] for x in perms}
 for k,ar,en in file_defs:
  if k not in existing: perms.append({'key':k,'module':'files','description_ar':ar,'description_en':en,'entitlement_key':'module.files','scope_mode':'resource'})
 owner_existing={(x['role_id'],x['permission_key']) for x in role_perms}
 for k,_,_ in file_defs:
  if (OWNER_ROLE,k) not in owner_existing: role_perms.append({'role_id':OWNER_ROLE,'permission_key':k,'allowed':True})
 for k in ['projects.view','files.view','files.rename','files.move','files.download']:
  if (ENGINEER_ROLE,k) not in owner_existing: role_perms.append({'role_id':ENGINEER_ROLE,'permission_key':k,'allowed':True})
 # enrich project fixture for Project 360 and cards
 projects[0].update({'project_type':'engineering','client_name':'Alpha Client','manager_user_id':USER,'planned_start_date':'2026-08-01','target_end_date':'2026-12-31','progress_percent':58,'blueprint_id':BLUEPRINT})
 projects[1].update({'project_type':'construction','client_name':'Beta Client','manager_user_id':USER2,'planned_start_date':'2026-09-01','target_end_date':'2027-03-31','progress_percent':12,'blueprint_id':BLUEPRINT})

def session():
 limited=captured.get('actor')=='engineer'
 return {'access_token':'mock-access','refresh_token':'mock-refresh','expires_at':4102444800,'user':{'id':USER2 if limited else USER,'email':'engineer@example.com' if limited else 'owner@example.com','user_metadata':{'full_name':'Engineer User' if limited else 'Owner User'}}}

def table_payload(table, platform=False):
 data={
  'profiles':[profile,profile2], 'account_security':[{'user_id':USER,'must_change_password':False},{'user_id':USER2,'must_change_password':False}],
  'company_memberships':[membership,membership2], 'platform_admins':([] if captured.get('actor')=='engineer' else [{'user_id':USER,'role':'owner','is_active':True}]),
  'service_plans':plans, 'companies':[company], 'company_subscriptions':[subscription], 'roles':roles,
  'permissions':perms, 'entitlements':entitlements, 'service_plan_entitlements':plan_entitlements, 'company_entitlement_overrides':[], 'company_invitations':[], 'projects':projects, 'sites':sites_pdc if captured.get('pdc_enabled') else [], 'project_blueprints':project_blueprints_pdc if captured.get('pdc_enabled') else [], 'folder_templates':[], 'folder_template_nodes':[], 'favorites':[], 'company_branding':[branding],
  'role_templates':templates, 'role_template_permissions':template_perms, 'role_permissions':role_perms,
  'member_permission_overrides':[], 'member_compensation':[], 'audit_events':activities,
  'organization_units':[{'id':UNIT,'company_id':COMPANY,'parent_id':None,'unit_type':'department','code':'ENG','name_ar':'الهندسة','name_en':'Engineering','description':'Engineering department','color':'#4f46e5','icon':'users','manager_user_id':USER,'sort_order':1,'is_active':True}],
  'organization_unit_memberships':[{'unit_id':UNIT,'membership_id':MEMBERSHIP2,'is_primary':True,'title':'Engineer','joined_at':'2026-08-02'}],
  'role_addons':[], 'role_addon_permissions':[], 'member_role_addons':[], 'access_scope_rules':[], 'access_governance_settings':[{'company_id':COMPANY,'require_second_approval':False,'require_second_approval_for_owner':True,'high_risk_permissions':['members.manage']}],
  'company_work_settings':[{'company_id':COMPANY,'timezone':'Africa/Cairo','work_days':[0,1,2,3,4],'workday_start':'09:00:00','workday_end':'17:00:00','default_weekly_hours':40,'holidays':[],'notification_defaults':{'approval':True,'security':True,'task_due':True,'task_assigned':True}}],
  'member_work_preferences':[{'membership_id':MEMBERSHIP2,'company_id':COMPANY,'default_project_ids':[projects[0]['id']],'notification_preferences':{'task_assigned':True},'calendar_preferences':{'show_team':True}}],
  'workspace_saved_views':captured['saved_views'],
  'work_milestones':[], 'task_templates':[], 'work_workflow_templates':[workflow_template], 'work_automation_rules':[], 'work_automation_runs':[],
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
  if name=='workspace_runtime_policy':
   disabled=set(captured.get('disabled_entitlements') or set())
   effective_entitlements=[{**ent,'enabled':ent['key'] not in disabled,'source':'plan','limits':{}} for ent in entitlements]
   actor_role=ENGINEER_ROLE if captured.get('actor')=='engineer' else OWNER_ROLE
   actor_keys={rp['permission_key'] for rp in role_perms if rp['role_id']==actor_role and rp['allowed']}
   effective_permissions=[perm['key'] for perm in perms if perm['key'] in actor_keys and perm['entitlement_key'] not in disabled]
   payload={'company_id':COMPANY,'operational':True,'platform_admin':False,'plan_id':'plan1','plan_code':'starter','permissions':effective_permissions,'entitlements':effective_entitlements,'limits':{'max_members':25,'max_projects':10,'max_storage_bytes':10737418240},'usage':{'active_members':2,'active_projects':len(projects),'storage_bytes':0}}
  elif name=='organization_health_snapshot': payload={'score':88,'steps':[{'key':'identity','done':True,'route':'settings','label_ar':'هوية وبيانات الشركة','label_en':'Company identity'},{'key':'branding','done':True,'route':'settings','label_ar':'الهوية البصرية','label_en':'Branding'},{'key':'work','done':True,'route':'organization','label_ar':'أيام وساعات العمل','label_en':'Work schedule'},{'key':'roles','done':True,'route':'roles','label_ar':'الأدوار والصلاحيات','label_en':'Roles & permissions'},{'key':'structure','done':True,'route':'organization','label_ar':'الهيكل التنظيمي','label_en':'Organization structure'},{'key':'team','done':True,'route':'team','label_ar':'الفريق','label_en':'Team'},{'key':'governance','done':True,'route':'roles','label_ar':'حوكمة الوصول','label_en':'Access governance'},{'key':'projects','done':True,'route':'projects','label_ar':'المشاريع','label_en':'Projects'}],'issues':[{'code':'members_no_manager','severity':'warning','route':'team','count':1,'title_ar':'أعضاء بدون مدير مباشر','title_en':'Members without direct manager','detail_ar':'راجع المدير المباشر.','detail_en':'Review the direct manager.'}],'metrics':{'roles':3,'empty_roles':0,'members':2,'active_members':2,'units':1,'projects':2,'pending_first_login':0,'expiring_access':0,'expired_invitations':0,'heavy_overrides':0,'storage_bytes':0},'generated_at':'2026-08-07T16:00:00Z'}
  elif name=='organization_runtime_revision': payload=[{'revision':1,'last_kind':'bootstrap','updated_at':'2026-08-07T16:00:00Z'}]
  elif name=='member_access_snapshot':
   mid=body.get('p_membership_id'); mm=membership2 if mid==MEMBERSHIP2 else membership; pp=profile2 if mid==MEMBERSHIP2 else profile; rr=next(r for r in roles if r['id']==mm['role_id'])
   payload={'membership':mm,'profile':pp,'role':rr,'effective_permissions':[x['permission_key'] for x in role_perms if x['role_id']==rr['id']],'blocked_by_entitlement':[],'scope_rules':[],'addons':[],'organization_units':[{'id':UNIT,'type':'department','name_ar':'الهندسة','name_en':'Engineering','primary':True}] if mid==MEMBERSHIP2 else [],'pages':{'dashboard':True,'team':True,'roles':True,'settings':True}}
  elif name=='member_security_snapshot': payload={'last_sign_in_at':'2026-08-07T12:00:00Z','created_at':'2026-08-01T00:00:00Z','email_confirmed_at':'2026-08-01T00:10:00Z','must_change_password':False,'temporary_password_expires_at':None}
  elif name=='save_workspace_saved_view':
   view={'id':'88888888-8888-4888-8888-888888888888','company_id':COMPANY,'user_id':USER2 if captured.get('actor')=='engineer' else USER,'view_key':body.get('p_view_key'),'name':body.get('p_name'),'filters':body.get('p_filters') or {},'is_default':bool(body.get('p_is_default')),'created_at':'2026-08-07T16:00:00Z','updated_at':'2026-08-07T16:00:00Z'}; captured['saved_views'][:]=[x for x in captured['saved_views'] if x['id']!=view['id']]+[view]; payload=view
  elif name=='delete_workspace_saved_view': captured['saved_views'][:]=[x for x in captured['saved_views'] if x['id']!=body.get('p_view_id')]; payload=True
  elif name in ('bulk_set_member_role','bulk_set_member_status','bulk_restore_member_access'): captured['bulk_calls'].append((name,body)); payload={'ok':True,'changed':len(body.get('p_membership_ids') or body.get('p_items') or [])}
  elif name=='save_company_work_settings': captured['work_settings'].append(body); payload={'company_id':COMPANY,**(body.get('p_payload') or {})}
  elif name=='save_member_work_preferences': payload={'membership_id':body.get('p_membership_id'),'company_id':COMPANY,**(body.get('p_payload') or {})}
  elif name=='work_cockpit_snapshot':
   payload={**work_cockpit,'manager':({**work_cockpit['manager'],'enabled':captured.get('actor')!='engineer'} if captured.get('actor')!='engineer' else {'enabled':False,'unassigned':0,'high_risk':0,'attention':[],'overloaded':[]})}
  elif name=='work_capacity_plan': payload=capacity_plan
  elif name=='work_dependency_graph': payload=dependency_graph
  elif name=='save_work_workflow_template': captured['workflow_calls'].append((name,body)); payload=workflow_template['id']
  elif name=='instantiate_work_workflow_template': captured['workflow_calls'].append((name,body)); payload={'template_id':body.get('p_template_id'),'task_ids':[TASK,'92929292-9292-4292-8292-929292929292'],'count':2}
  elif name=='work_task_query': payload={'items':[work_task],'total':1,'offset':0,'limit':60,'has_more':False}
  elif name=='work_delivery_snapshot': payload={'open':1,'due_today':0,'overdue':0,'blocked':0,'high_risk':0,'completed_week':2,'attention':[work_task],'workload':[{'user_id':USER2,'membership_id':MEMBERSHIP2,'name':'Engineer User','capacity_hours':40,'planned_minutes':240,'utilization':10}],'milestones':[]}
  elif name=='work_calendar_feed': payload=[{'kind':'task','id':TASK,'title':'Review shop drawing','task_type':'review','status':'in_progress','priority':'high','start_at':'2026-08-08T08:00:00Z','end_at':'2026-08-09T12:00:00Z','all_day':False,'project_id':projects[0]['id'],'owner_user_id':USER2,'risk':{'score':35,'level':'medium'}},{'kind':'holiday','id':None,'title':'Test Holiday','status':'holiday','start_at':'2026-08-10T00:00:00Z','end_at':'2026-08-11T00:00:00Z','all_day':True}]
  elif name=='work_activity_feed': payload={'items':[work_activity],'total':1,'offset':0,'limit':60,'has_more':False}
  elif name=='work_runtime_revision': payload=[{'revision':7,'updated_at':'2026-08-07T21:00:00Z'}]
  elif name=='work_leave_requests': payload={'items':[],'total':0,'offset':0,'limit':100,'has_more':False,'can_manage':captured.get('actor')!='engineer'}
  elif name=='work_task_detail': payload={'task':work_task,'risk':work_task['risk'],'capabilities':{'edit':True,'complete':True,'claim':False,'comment':True,'attach':True,'assign':captured.get('actor')!='engineer'},'assignments':[{'id':'a1','user_id':USER2,'role_id':None,'assigned_by':USER,'name':'Engineer User'}],'watchers':[],'checklist':[{'id':'c1','task_id':TASK,'body':'Check dimensions','position':0,'is_completed':False,'created_at':'2026-08-07T20:00:00Z'}],'comments':[{'id':'cm1','task_id':TASK,'author_id':USER2,'author_name':'Engineer User','body':'Started review','created_at':'2026-08-07T20:30:00Z'}],'attachments':[],'events':[{'id':1,'task_id':TASK,'actor_id':USER2,'actor_name':'Engineer User','event_type':'task.status_changed','created_at':'2026-08-07T21:00:00Z'}],'blockers':[],'downstream':[],'milestone':None}
  elif name=='work_assignment_candidates': payload=[{'membership_id':MEMBERSHIP2,'user_id':USER2,'full_name':'Engineer User','job_title':'Electrical Engineer','experience_level':'senior','skills':['CAD','QA'],'weekly_capacity':40,'planned_minutes':240,'utilization_percent':10,'on_leave':False,'permission_ok':True,'site_match':True,'skill_match_count':1,'score':95,'reasons':[{'key':'permission','ok':True},{'key':'capacity','ok':True,'utilization':10}]}]
  elif name in ('save_work_item','save_task_dependency','delete_task_dependency','save_work_milestone','save_member_leave_period','cancel_member_leave_period','save_task_template','save_work_automation_rule','test_work_automation_rule','set_task_status','add_task_comment','add_task_checklist_item'):
   captured['work_calls'].append((name,body)); payload={'id':TASK,'lock_version':4,'ok':True,'matches':True,'trigger':'task.created','actions':[]}
  elif name=='file_workspace_snapshot':
   folder_id=body.get('p_folder_id'); docs=[]
   if folder_id==FOLDER: docs=[{**document_pdc,'version_number':version_pdc['version_number'],'version_label':version_pdc['version_label'],'original_filename':version_pdc['original_filename'],'mime_type':version_pdc['mime_type'],'size_bytes':version_pdc['size_bytes'],'upload_state':'ready','change_note':version_pdc['change_note'],'uploaded_by':USER2,'finalized_at':version_pdc['finalized_at']}]
   if body.get('p_site_id')==SITE:
    if folder_id==SITE_FOLDER: docs=[{**site_document_pdc,'version_number':1,'version_label':'v1','original_filename':site_version_pdc['original_filename'],'mime_type':'application/pdf','size_bytes':site_version_pdc['size_bytes'],'upload_state':'ready','change_note':'As-built','uploaded_by':USER2,'finalized_at':site_version_pdc['finalized_at']}]
    payload={'project':{'id':projects[0]['id'],'code':'ALPHA','name':'Alpha Project','status':'active','archived_at':None},'site':sites_pdc[0],'folders':site_folders_delivery,'documents':docs}
   else: payload={'project':{'id':projects[0]['id'],'code':'ALPHA','name':'Alpha Project','status':'active','archived_at':None},'site':None,'folders':folders_pdc,'documents':docs}
  elif name=='company_storage_metrics': payload={'used_bytes':7340032,'uploading_bytes':0,'document_count':4,'version_count':7,'max_storage_bytes':10737418240}
  elif name=='company_storage_intelligence': payload={'used_bytes':7340032,'trash_bytes':1048576,'old_version_bytes':2097152,'max_storage_bytes':10737418240,'by_project':[{'id':projects[0]['id'],'code':'ALPHA','name':'Alpha Project','bytes':7340032}],'by_type':[{'document_type':'drawing','documents':3,'bytes':6291456}],'largest_files':[{'id':DOC,'display_name':document_pdc['display_name'],'project_id':projects[0]['id'],'site_id':None,'folder_id':FOLDER,'size_bytes':2457600}]}
  elif name=='trash_query': payload={'folders':[{'id':'f9f9f9f9-f9f9-49f9-89f9-f9f9f9f9f9f9','name':'Old Correspondence','code':'09','project_id':projects[0]['id'],'site_id':None,'parent_id':None,'trashed_at':'2026-08-07T10:00:00Z','trashed_by':USER,'trash_batch_id':'ba1ba1ba-1111-4111-8111-ba1ba1ba1ba1','trash_origin':'direct','project_name':'Alpha Project','site_name':None,'trashed_by_name':'Owner User'}],'documents':[{'id':'c9c9c9c9-c9c9-49c9-89c9-c9c9c9c9c9c9','display_name':'Old Report.pdf','document_type':'report','project_id':projects[0]['id'],'site_id':None,'folder_id':FOLDER,'trashed_at':'2026-08-07T11:00:00Z','trashed_by':USER,'trash_origin':'direct','project_name':'Alpha Project','site_name':None,'trashed_by_name':'Owner User','size_bytes':524288}],'hidden_descendants':3}
  elif name in ('document_search_v2','document_picker_query'): payload=[document_pdc if name=='document_search_v2' else {'id':DOC,'display_name':document_pdc['display_name'],'document_type':'drawing','control_status':'in_review','folder_id':FOLDER,'site_id':None,'system_code':'ALPHA-ELE-001','version_count':2}]
  elif name=='project_360': payload={'project':projects[0],'blueprint':{'id':BLUEPRINT,'code':'standard-engineering','name_ar':'هندسي قياسي','name_en':'Standard Engineering'},'manager_name':'Owner User','stats':{'sites':1,'cabinets':1,'claim_packages':1,'folders':2,'documents':4,'storage_bytes':7340032,'open_tasks':8,'overdue_tasks':2,'blocked_tasks':1,'drawings':5,'milestones':3},'sites':[{**sites_pdc[0],'manager_name':'Engineer User','cabinets':1,'claim_status':'collecting'}],'health':{'score':82,'archived':False},'recent_activity':[],'can_manage':captured.get('actor')!='engineer'}
  elif name=='site_360':
   manager=captured.get('actor')!='engineer'; payload={'site':sites_pdc[0],'project':{'id':projects[0]['id'],'code':'ALPHA','name':'Alpha Project'},'manager_name':'Engineer User','stats':{'folders':8,'documents':2,'storage_bytes':3145728,'open_tasks':4,'overdue_tasks':1,'drawings':3,'cabinets':1},'cabinets':[{'id':CABINET,'code':'CAB-01','name':'Cabinet One','cabinet_type':'fiber_cabinet','status':'active','description':'Main cabinet','location_label':'Zone A','root_folder_id':CAB_ROOT,'archived_at':None,'claim_items':1}],'claim_package':{**claim_payload,'can_manage':manager},'can_create_cabinet':manager,'can_manage_cabinets':manager,'can_manage_claim':manager,'can_edit_site':manager,'can_archive_site':manager}
  elif name=='cabinet_360':
   manager=captured.get('actor')!='engineer'; payload={'cabinet':{'id':CABINET,'company_id':COMPANY,'project_id':projects[0]['id'],'site_id':SITE,'code':'CAB-01','name':'Cabinet One','cabinet_type':'fiber_cabinet','status':'active','description':'Main cabinet','location_label':'Zone A','root_folder_id':CAB_ROOT,'archived_at':None},'project':{'id':projects[0]['id'],'code':'ALPHA','name':'Alpha Project'},'site':{'id':SITE,'code':'SITE-01','name':'Alpha Main Site'},'root_folder':{'id':CAB_ROOT,'name':'CAB-01 — Cabinet One','code':'CAB-01'},'folders':[{'id':SITE_FOLDER,'code':'C01','name':'Drawings & As-Built','sort_order':10},{'id':'b5b5b5b5-b5b5-45b5-85b5-b5b5b5b5b5b5','code':'C02','name':'Quantity Survey','sort_order':20},{'id':'b6b6b6b6-b6b6-46b6-86b6-b6b6b6b6b6b6','code':'C03','name':'Sketches','sort_order':30},{'id':'b7b7b7b7-b7b7-47b7-87b7-b7b7b7b7b7b7','code':'C04','name':'Handover & Inspection','sort_order':40},{'id':'b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8','code':'C05','name':'Photos','sort_order':50},{'id':'b9b9b9b9-b9b9-49b9-89b9-b9b9b9b9b9b9','code':'C06','name':'Supporting Documents','sort_order':60}],'stats':{'documents':1,'drawings':1,'open_tasks':2,'claim_items':1,'readiness_percent':75},'can_manage':manager,'can_archive':manager}
  elif name=='site_claim_package_360': payload={**claim_payload,'can_manage':captured.get('actor')!='engineer'}
  elif name=='document_360':
   if body.get('p_document_id')==SITE_DOC:
    manager=captured.get('actor')!='engineer'; payload={'document':site_document_pdc,'project':{'id':projects[0]['id'],'code':'ALPHA','name':'Alpha Project'},'site':{'id':SITE,'code':'SITE-01','name':'Alpha Main Site'},'folder':{'id':SITE_FOLDER,'name':'Drawings & As-Built','code':'C01'},'cabinet':{'id':CABINET,'code':'CAB-01','name':'Cabinet One','status':'active'},'owner_name':'Engineer User','versions':[site_version_pdc],'linked_tasks':[],'linked_drawings':[],'claim_links':[{'item_id':'a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a4a4','package_id':CLAIM,'package_no':'SITE-01-FINAL','package_status':'collecting','requirement_id':CLAIM_REQ,'requirement_key':'as_built_drawings','label_ar':'رسومات As-Built','label_en':'As-Built Drawings','selected_version_id':None,'cabinet_id':CABINET}],'claim_options':([{'package_id':CLAIM,'package_no':'SITE-01-FINAL','package_status':'collecting','requirement_id':'a5a5a5a5-a5a5-45a5-85a5-a5a5a5a5a5a5','requirement_key':'quantity_survey','label_ar':'الحصر والكميات','label_en':'Quantity Survey / Takeoff','sort_order':30}] if manager else []),'recent_activity':[]}
   else: payload={'document':document_pdc,'project':{'id':projects[0]['id'],'code':'ALPHA','name':'Alpha Project'},'site':None,'folder':{'id':FOLDER,'name':'01 — Drawings','code':'01'},'cabinet':None,'owner_name':'Engineer User','versions':[version_pdc,{**version_pdc,'id':'d2d2d2d2-d2d2-42d2-82d2-d2d2d2d2d2d2','version_number':1,'version_label':'v1','original_filename':'A-102-R1.pdf','size_bytes':2200000,'created_at':'2026-08-05T08:00:00Z','finalized_at':'2026-08-05T08:01:00Z'}],'linked_tasks':[{'id':TASK,'task_number':42,'title':'Review shop drawing','status':'in_progress','priority':'high','due_at':'2026-08-09T12:00:00Z'}],'linked_drawings':[],'claim_links':[],'claim_options':[],'recent_activity':[]}
  elif name=='resolve_entity_context':
   typ=body.get('p_entity_type'); eid=body.get('p_entity_id')
   if typ in ('project','projects'): payload={'type':'project','project_id':eid,'page':'projects'}
   elif typ in ('site','sites'): payload={'type':'site','project_id':projects[0]['id'],'site_id':eid,'page':'projects'}
   elif typ in ('folder','folders'): payload={'type':'folder','project_id':projects[0]['id'],'site_id':None,'folder_id':eid,'page':'files'}
   elif typ in ('document','documents'): payload={'type':'document','project_id':projects[0]['id'],'site_id':SITE if eid==SITE_DOC else None,'folder_id':SITE_FOLDER if eid==SITE_DOC else FOLDER,'document_id':eid,'page':'files'}
   elif typ in ('site_cabinet','cabinet','site_cabinets'): payload={'type':'site_cabinet','project_id':projects[0]['id'],'site_id':SITE,'cabinet_id':eid,'folder_id':CAB_ROOT,'page':'projects'}
   elif typ in ('site_claim_package','claim_package','site_claim_packages'): payload={'type':'site_claim_package','project_id':projects[0]['id'],'site_id':SITE,'claim_package_id':eid,'page':'projects'}
   elif typ in ('task','tasks'): payload={'type':'task','project_id':projects[0]['id'],'task_id':eid,'page':'tasks'}
   else: payload={'type':typ,'project_id':projects[0]['id'],'page':'engineering','drawing_id':eid}
  elif name in ('save_project','save_site','set_document_control_status','archive_project','reactivate_project','archive_site','reactivate_site','rename_document','move_document','rename_folder','move_folder','restore_document','restore_folder','trash_document','trash_folder','save_site_cabinet','archive_site_cabinet','reactivate_site_cabinet','add_document_to_site_claim','remove_site_claim_item','freeze_site_claim_package','reopen_site_claim_package','submit_site_claim_package','save_site_claim_requirement'):
   captured['pdc_calls'].append((name,body)); payload={'id':CABINET if name=='save_site_cabinet' else (body.get('p_document_id') or body.get('p_project_id') or body.get('p_site_id') or projects[0]['id']),'ok':True}
  elif name=='auto_collect_site_claim': captured['pdc_calls'].append((name,body)); payload={'added':3,'suggested':3}
  elif name=='site_claim_suggestions': payload=[]
  elif name=='project_archive_impact': payload={'project_id':projects[0]['id'],'name':'Alpha Project','active_sites':1,'open_tasks':8,'blocked_tasks':1,'active_drawings':5,'documents':4,'storage_bytes':7340032,'milestones':3}
  elif name=='site_archive_impact': payload={'site_id':SITE,'name':'Alpha Main Site','open_tasks':4,'active_drawings':3,'documents':2,'storage_bytes':3145728}
  elif name=='cleanup_stale_uploads': payload=0
  elif name=='company_activity_feed': payload=activities
  elif name=='platform_company_directory': payload=[{**company,'company_id':COMPANY,'company_name':company['name'],'company_slug':company['slug'],'status':'active','plan_id':'plan1','plan_code':'starter','plan_name_ar':'البداية','plan_name_en':'Starter','member_count':2,'project_count':len(projects),'storage_bytes':0,'max_members':25,'max_projects':10,'max_storage_bytes':10737418240,'created_at':company['created_at'],'billing_cycle':'monthly','agreed_price':1000,'currency':'EGP','payment_status':'paid','onboarding_status':'ready','owner_user_id':USER,'owner_name':'Owner User','owner_email':'owner@example.com','owner_phone':'01000000000','owner_must_change_password':False,'branding_logo_path':None,'branding_app_name':'Optimum Test','salary_amount':None}]
  elif name=='platform_company_overview': payload=[]
  elif name=='save_role_draft':
   captured['client_role']=body
   payload={'draft':{'id':'12121212-1212-4212-8212-121212121212','company_id':COMPANY,'role_id':body.get('p_payload',{}).get('role_id'),'snapshot':body.get('p_payload',{}),'change_note':body.get('p_payload',{}).get('change_note'),'status':'draft'},'validation':{'blocked_by_plan':[]}}
  elif name=='role_draft_impact':
   payload={'draft_id':body.get('p_draft_id'),'affected_members':0,'gained_permissions':captured.get('client_role',{}).get('p_payload',{}).get('permission_keys',[]),'lost_permissions':[],'blocked_by_plan':[],'requires_approval':False}
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
  rows=table_payload(table)
  qs=parse_qs(url.query)
  # Honor the identity-scoped filters used during bootstrap so limited-role tests
  # do not accidentally inherit another user's profile/membership/admin row.
  if table=='profiles' and qs.get('id'):
   raw=qs['id'][0]
   if raw.startswith('eq.'):
    wanted=raw[3:]
    rows=[x for x in rows if str(x.get('id'))==wanted]
   elif raw.startswith('in.(') and raw.endswith(')'):
    wanted={x.strip() for x in raw[4:-1].split(',') if x.strip()}
    rows=[x for x in rows if str(x.get('id')) in wanted]
  elif table in ('account_security','company_memberships','platform_admins') and qs.get('user_id'):
   wanted=qs['user_id'][0].removeprefix('eq.')
   rows=[x for x in rows if str(x.get('user_id'))==wanted]
  await route.fulfill(status=200,content_type='application/json',body=json.dumps(rows)); return
 if '/auth/v1/user' in path:
  await route.fulfill(status=200,content_type='application/json',body=json.dumps(session()['user'])); return
 if '/auth/v1/logout' in path:
  await route.fulfill(status=204,body=''); return
 if '/auth/v1/' in path:
  await route.fulfill(status=200,content_type='application/json',body=json.dumps(session())); return
 await route.fulfill(status=404,body='not mocked')

async def initialize(page, scope, actor='owner'):
 captured['actor']=actor
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


async def wait_until(predicate, timeout=5.0, label='condition'):
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  if predicate(): return
  await asyncio.sleep(0.05)
 raise AssertionError(f'Timed out waiting for {label}')

async def client_flow(browser):
 page=await browser.new_page(viewport={'width':1500,'height':1000})
 await initialize(page,'client')
 await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/roles"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded')
 await page.locator('[data-action="new-role"]').click()
 form=page.locator('form[data-form="access55-role-draft"]')
 await form.locator('[name="name_ar"]').fill('اختبار تشغيل')
 await form.locator('[name="name_en"]').fill('Operational Test')
 await form.locator('[name="slug"]').fill('operational-test')
 await form.locator('[name="change_note"]').fill('Browser regression check')
 checks=form.locator('input[name="permission"]')
 for i in range(3): await checks.nth(i).evaluate("el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));}")
 await form.locator('button[type="submit"]').click()
 await page.locator('.impact-summary-grid').wait_for(state='visible',timeout=5000)
 assert captured['client_role'], 'client role draft RPC was not called'
 assert len(captured['client_role']['p_payload']['permission_keys'])==3
 assert await page.locator('.impact-summary-grid').count()==1
 await page.locator('[data-action="close-overlay"]').first.click()

 # Phase 5.7.0: role members stay in Role Studio and open an in-context dialog.
 before_hash=await page.evaluate('location.hash')
 owner_button=page.locator(f'[data-action="show-role-members"][data-id="{OWNER_ROLE}"]')
 await owner_button.click()
 assert await page.locator('.role-members-dialog').count()==1
 assert await page.evaluate('location.hash')==before_hash
 assert await page.locator('.role-member-row').count()==1
 assert await page.locator('[data-action="invite-member-for-role"]').count()==0, 'Owner must not be assignable from member provisioning'
 await page.locator('[data-action="close-overlay"]').first.click()
 # A normal assignable role opens the same dialog and can seed the create-member form.
 role_button=page.locator(f'[data-action="show-role-members"][data-id="{ENGINEER_ROLE}"]')
 await role_button.click()
 assert await page.locator('.role-members-dialog').count()==1
 assert await page.locator('.role-member-row').count()==1
 assert 'Engineer User' in await page.locator('.role-member-row').first.inner_text()
 await page.locator('[data-action="invite-member-for-role"]').click()
 member_from_role=page.locator('form[data-form="provision-member"]')
 checked=await member_from_role.locator('input[name="role_id"]:checked').get_attribute('value')
 assert checked==ENGINEER_ROLE
 await page.locator('[data-action="close-overlay"]').first.click()
 # Team navigation remains available as an explicit secondary action and keeps the role filter.
 await role_button.click()
 await page.locator('[data-action="open-role-members-team"]').click()
 assert await page.evaluate('location.hash')=='#/team'
 assert await page.locator('#team-role-filter').input_value()==ENGINEER_ROLE

 await page.locator('[data-action="invite-member"]').first.click()
 member_form=page.locator('form[data-form="provision-member"]')
 assert await member_form.locator('.member-role-option').count()>=2
 # The employee summary is now after the form sections, not a sticky side panel.
 order=await member_form.evaluate("f => [...f.children].map(x=>x.className)")
 assert order[-1].find('provision-side')>=0
 await member_form.locator('[name="full_name"]').fill('New Member')
 await member_form.locator('[name="email"]').fill('new.member@example.com')
 await member_form.locator('input[name="role_id"]').nth(0).evaluate("el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));}")
 await member_form.locator('button[type="submit"]').click()
 await page.locator('.credentials-dialog').wait_for(state='visible',timeout=7000)
 await wait_until(lambda: bool(captured['client_member']),label='member provisioning capture')
 assert captured['client_member']['action']=='create_member'
 assert captured['client_member']['role_id']
 assert await page.locator('.credentials-dialog').count()==1
 await page.locator('[data-action="close-overlay"]').first.click()

 await page.locator('[data-nav="settings"]').click()
 await page.locator('[data-action="settings-tab"][data-tab="company"]').first.click()
 company_form=page.locator('form[data-form="company-settings"]')
 await company_form.locator('[name="name"]').fill('Optimum Updated')
 before_settings=len(captured['settings'])
 await company_form.locator('button[type="submit"]').click()
 await wait_until(lambda: len(captured['settings'])>before_settings,label='workspace settings save')
 assert captured['settings'][-1]['p_company']['name']=='Optimum Updated'

 await page.locator('[data-nav="activity"]').click()
 await page.locator('[data-workos-activity-search]').wait_for(state='attached',timeout=5000)
 assert await page.locator('[data-workos-activity-search]').count()==1
 assert await page.locator('.workos-activity-filters').count()==1
 assert await page.locator('.workos-activity-list').count()==1
 await page.screenshot(path='/mnt/data/optimum53-client-proof.png',full_page=True)
 await page.close()

async def platform_flow(browser):
 page=await browser.new_page(viewport={'width':1500,'height':1000})
 await initialize(page,'platform')
 await page.route('https://platform.test/**',local_route)
 html=(ROOT/'platform-console/index.html').read_text().replace('<head>','<head><base href="https://platform.test/"><script>location.hash="#/role-templates"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded')
 await page.locator('[data-action="new-role-template"]').click()
 form=page.locator('form[data-form="role-template"]')
 await form.locator('[name="code"]').fill('ops-test')
 await form.locator('[name="name_ar"]').fill('قالب تشغيل')
 await form.locator('[name="name_en"]').fill('Operational template')
 checks=form.locator('input[name="permission"]')
 await checks.nth(0).evaluate("el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));}"); await checks.nth(1).evaluate("el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));}")
 await form.locator('button[type="submit"]').click(); await wait_until(lambda: bool(captured['platform_template']),label='platform role template save')
 assert captured['platform_template'] and len(captured['platform_template']['p_payload']['permission_keys'])==2

 await page.locator('[data-nav="companies"]').click()
 await page.locator('[data-action="create-company"]').click()
 create=page.locator('form[data-form="create-company"]')
 # Fill every required control using its semantic type, then dispatch the real submit handler.
 await create.evaluate("""f => {
   for (const el of f.querySelectorAll('input[required]')) {
     if (el.type === 'email') el.value = el.name === 'owner_email' ? 'owner2@example.com' : 'office2@example.com';
     else if (el.type === 'checkbox') el.checked = true;
     else el.value = el.name === 'slug' ? 'company-two' : el.name === 'company_name' ? 'Company Two' : el.name === 'owner_name' ? 'Owner Two' : 'Test';
     el.dispatchEvent(new Event('input',{bubbles:true}));
   }
   for (const el of f.querySelectorAll('select[required]')) if (!el.value && el.options.length) el.value = el.options[0].value;
   f.querySelector('[name="company_name"]').value='Company Two';
   f.querySelector('[name="slug"]').value='company-two';
   f.querySelector('[name="owner_name"]').value='Owner Two';
   f.querySelector('[name="owner_email"]').value='owner2@example.com';
   f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 }""")
 await wait_until(lambda: bool(captured['platform_company']),timeout=7,label='platform company provisioning')
 assert captured['platform_company'] and captured['platform_company']['action']=='create_company'
 assert captured['platform_company']['company']['slug']=='company-two'
 await page.screenshot(path='/mnt/data/optimum53-platform-proof.png',full_page=True)
 await page.close()

async def organization_os_flow(browser):
 captured['disabled_entitlements']=set()
 page=await browser.new_page(viewport={'width':1500,'height':1000})
 await initialize(page,'client')
 await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/organization"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded')
 await page.locator('.orgos-readiness').wait_for(state='visible',timeout=7000)
 assert '88%' in await page.locator('.orgos-readiness').inner_text()
 assert await page.locator('.orgos-journey-step').count()==8
 assert await page.locator('.orgos-unit-card').count()==1
 await page.locator('[data-action="orgos-tab"][data-tab="health"]').click()
 assert await page.locator('.orgos-health-issue').count()==1
 await page.locator('[data-action="orgos-tab"][data-tab="work"]').click()
 assert await page.locator('form[data-form="orgos-work-settings"]').count()==1
 work=page.locator('form[data-form="orgos-work-settings"]')
 await work.locator('[name="default_weekly_hours"]').fill('42')
 before_work=len(captured['work_settings']); await work.locator('button[type="submit"]').click(); await wait_until(lambda: len(captured['work_settings'])>before_work,label='work settings save')
 assert captured['work_settings'] and captured['work_settings'][-1]['p_payload']['default_weekly_hours']==42

 await page.locator('[data-nav="team"]').click(); await page.locator('[data-orgos-saved-view="team"]').wait_for(state='attached',timeout=5000)
 assert await page.locator('[data-orgos-saved-view="team"]').count()==1
 assert await page.locator(f'[data-team-member] [data-orgos-member-select][value="{MEMBERSHIP2}"]').count()==1
 await page.locator(f'[data-action="orgos-member360"][data-id="{MEMBERSHIP2}"]').click()
 await page.locator('.orgos-member360').wait_for(state='visible',timeout=5000)
 text=await page.locator('.orgos-member360').inner_text()
 assert 'Engineer User' in text and ('Senior' in text or 'خبير' in text)
 await page.locator('[data-action="close-overlay"]').first.click()

 cb=page.locator(f'[data-orgos-member-select][value="{MEMBERSHIP2}"]')
 await cb.check(); await page.locator('.orgos-bulk-bar.active').wait_for(state='visible',timeout=3000)
 assert await page.locator('.orgos-bulk-bar.active').count()==1
 await page.locator('[data-action="orgos-bulk-suspend"]').click(); await wait_until(lambda: bool(captured['bulk_calls']) and captured['bulk_calls'][-1][0]=='bulk_set_member_status',label='bulk suspend')
 assert captured['bulk_calls'][-1][0]=='bulk_set_member_status'
 await page.locator('.orgos-undo-bar').wait_for(state='visible',timeout=5000)
 assert await page.locator('.orgos-undo-bar').count()==1
 await page.locator('[data-action="orgos-undo-bulk"]').click(); await wait_until(lambda: bool(captured['bulk_calls']) and captured['bulk_calls'][-1][0]=='bulk_restore_member_access',label='bulk undo')
 assert captured['bulk_calls'][-1][0]=='bulk_restore_member_access'

 assert await page.locator('.quick-create-trigger').count()==1
 await page.locator('.quick-create-trigger').click(); await page.locator('.quick-create-panel').wait_for(state='visible',timeout=3000)
 assert await page.locator('.quick-create-panel [data-action="invite-member"]').count()==1
 assert await page.locator('.quick-create-panel [data-action="access55-new-role"]').count()==1
 assert await page.locator('.quick-create-panel [data-action="access55-new-unit"]').count()==1
 assert await page.locator('.quick-create-panel [data-action="new-project"]').count()==1
 await page.locator('[data-action="close-overlay"]').first.click()

 await page.locator('[data-action="orgos-save-view"][data-view="team"]').click()
 sv=page.locator('form[data-form="orgos-save-view"]')
 await sv.locator('[name="name"]').fill('My team')
 await sv.locator('button[type="submit"]').click(); await wait_until(lambda: bool(captured['saved_views']),label='saved view save')
 assert captured['saved_views'] and captured['saved_views'][0]['name']=='My team'

 await page.locator('.command-trigger').click(); await page.locator('#command-search').fill('Engineer'); await page.locator('.orgos-command-members').wait_for(state='visible',timeout=5000)
 assert await page.locator(f'[data-action="orgos-member360"][data-id="{MEMBERSHIP2}"]').count()>=1
 await page.locator('[data-action="close-overlay"]').first.click()
 await page.locator('[data-nav="roles"]').click(); await page.locator('.orgos-insights').wait_for(state='attached',timeout=5000)
 assert await page.locator('.orgos-insights').count()==1
 assert await page.locator('[data-orgos-saved-view="roles"]').count()==1
 await page.screenshot(path='/mnt/data/optimum58-organization-os-proof.png',full_page=True)
 await page.close()

async def limited_permission_flow(browser):
 captured['disabled_entitlements']=set()
 page=await browser.new_page(viewport={'width':1500,'height':1000})
 await initialize(page,'client',actor='engineer')
 await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/team"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded')
 await page.locator('[data-nav="team"]').wait_for(state='attached',timeout=5000)
 assert await page.locator('[data-nav="organization"]').count()==0, 'Organization OS must be hidden without company.manage'
 assert await page.locator('.quick-create-trigger').count()==0, 'Quick Create must be hidden when no create permission is effective'
 assert await page.locator('[data-action="invite-member"]').count()==0, 'Invite member must be hidden without members.invite'
 # The limited member can inspect their own access, but not another member's access.
 own=page.locator(f'[data-team-member]:has([data-action="orgos-member360"][data-id="{MEMBERSHIP2}"])')
 other=page.locator(f'[data-team-member]:has([data-action="orgos-member360"][data-id="{MEMBERSHIP}"])')
 assert await own.locator('[data-action="access55-view-user"]').count()==1
 assert await other.locator('[data-action="access55-view-user"]').count()==0
 assert await other.locator('[data-action="access55-member"]').count()==0
 await own.locator('[data-action="orgos-member360"]').click()
 await page.locator('.orgos-member360').wait_for(state='visible',timeout=5000)
 assert await page.locator('.orgos-member360 [data-action="access55-member"]').count()==0
 assert await page.locator('.orgos-member360 [data-action="edit-member"]').count()==0
 assert await page.locator('.orgos-member360 [data-action="access55-view-user"]').count()==1
 await page.locator('[data-action="close-overlay"]').first.click()
 await page.locator('[data-nav="roles"]').click()
 await page.locator('[data-nav="roles"]').wait_for(state='attached',timeout=3000)
 assert await page.locator('[data-action="new-role"]').count()==0
 assert await page.locator('[data-action="access55-new-role"]').count()==0
 await page.screenshot(path='/mnt/data/optimum58-limited-permission-proof.png',full_page=True)
 await page.close()

async def mobile_responsive_flow(browser):
 captured['disabled_entitlements']=set()
 page=await browser.new_page(viewport={'width':390,'height':844})
 await initialize(page,'client')
 await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/team"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded')
 await page.locator('.mobile-nav').wait_for(state='visible',timeout=5000)
 assert await page.locator('.sidebar.open').count()==0
 await page.locator('.mobile-nav').click(); await page.locator('.sidebar.open').wait_for(state='visible',timeout=2500)
 await page.locator('[data-nav="organization"]').click(); await page.locator('.orgos-readiness').wait_for(state='visible',timeout=5000)
 assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2')
 # Open a wide Member 360 drawer on a phone-sized viewport and ensure it stays inside the viewport.
 await page.locator('.mobile-nav').click(); await page.locator('.sidebar.open').wait_for(state='visible',timeout=2500)
 await page.locator('[data-nav="team"]').click(); await page.locator(f'[data-action="orgos-member360"][data-id="{MEMBERSHIP2}"]').click()
 drawer=page.locator('.drawer').last
 await drawer.wait_for(state='visible',timeout=5000)
 await page.wait_for_timeout(240)  # drawer animation is 180ms; verify the settled geometry.
 box=await drawer.bounding_box(); assert box and box['width']<=392 and box['x']>=-2 and box['x']+box['width']<=392
 assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2')
 await page.screenshot(path='/mnt/data/optimum58-mobile-proof.png',full_page=True)
 await page.close()

async def adaptive_policy_flow(browser):
 captured['disabled_entitlements']=set()
 page=await browser.new_page(viewport={'width':1500,'height':1000})
 await initialize(page,'client')
 await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/team"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded')
 await page.locator('[data-nav="team"]').wait_for(state='attached',timeout=5000)
 assert await page.locator('[data-nav="team"]').count()==1
 assert await page.locator('.command-trigger').count()==1
 # Real DOM filtering: authored card display rules must not defeat the hidden attribute.
 await page.locator('#team-search').fill('not-a-real-member')
 await page.locator('#team-filter-empty').wait_for(state='visible',timeout=3000)
 assert await page.locator('.team-member-card:visible').count()==0
 assert await page.locator('#team-filter-empty:visible').count()==1
 await page.locator('#team-search').fill('')
 await page.locator('[data-nav="roles"]').click()
 await page.locator('#role-search').fill('claims')
 await page.wait_for_function("()=>document.querySelectorAll('.role-studio-card:not([hidden])').length===1",timeout=3000)
 assert await page.locator('.role-studio-card:visible').count()==1
 await page.locator('[data-nav="projects"]').click()
 await page.locator('#project-search').fill('alpha')
 await page.wait_for_function("()=>document.querySelectorAll('.project-card:not([hidden])').length===1",timeout=3000)
 assert await page.locator('.project-card:visible').count()==1
 # A Platform Console feature change must reshape an already-open workspace when focus returns.
 await page.locator('[data-nav="team"]').click()
 captured['disabled_entitlements']={'module.members','module.search'}
 await page.evaluate("window.dispatchEvent(new Event('focus'))")
 await page.wait_for_function("()=>!document.querySelector('[data-nav=\"team\"]') && location.hash==='#/dashboard'",timeout=6000)
 assert await page.locator('[data-nav="team"]').count()==0, 'disabled Team feature must disappear from navigation'
 assert await page.locator('.command-trigger').count()==0, 'disabled Search feature must remove the command UI'
 assert await page.evaluate('location.hash')=='#/dashboard', 'current route must fall back when its feature is disabled'
 captured['disabled_entitlements']=set()
 await page.close()


async def work_os_flow(browser):
 page=await browser.new_page(viewport={'width':1500,'height':1000})
 await initialize(page,'client','owner')
 await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/tasks"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded')
 await page.locator('.workos-cockpit').wait_for(state='visible',timeout=7000)
 assert await page.locator('.workos-signal-grid').count()==1
 await page.locator('.workos-workspace-tabs [data-action="workos-workspace-view"][data-view="tasks"]').first.click()
 await page.locator('.workos-kpis').wait_for(state='visible',timeout=5000)
 assert await page.locator('.workos-task-card').count()==1
 assert await page.locator('[data-action="workos-admin"]').count()==1
 # Deep task drawer + atomic optimistic edit.
 await page.locator('.workos-task-card [data-action="open-task"]').first.click()
 await page.locator('.workos-detail').wait_for(state='visible',timeout=5000)
 assert await page.locator('[data-action="workos-detail-tab"]').count()==5
 await page.locator('[data-action="workos-detail-tab"][data-tab="activity"]').click()
 assert await page.locator('.workos-detail .workos-timeline').count()==1
 await page.locator('[data-action="workos-detail-tab"][data-tab="overview"]').click()
 await page.locator('.workos-detail [data-action="edit-task"]').click()
 form=page.locator('form[data-form="workos-task"]')
 await form.wait_for(state='visible',timeout=3000)
 assert await form.get_attribute('data-lock-version')=='3'
 await form.locator('[name="title"]').fill('Review shop drawing safely')
 before=len(captured['work_calls'])
 await form.locator('button[type="submit"]').click()
 await wait_until(lambda: len(captured['work_calls'])>before,label='atomic work save')
 save=[x for x in captured['work_calls'][before:] if x[0]=='save_work_item'][-1][1]['p_payload']
 assert save['expected_lock_version']==3 and save['title']=='Review shop drawing safely'
 # Smart assignment explains and ranks candidates.
 await page.locator('[data-action="new-task"]').first.click()
 newform=page.locator('form[data-form="workos-task"]')
 await newform.locator('[name="title"]').fill('Inspect site cabinet')
 await newform.locator('[name="required_skills"]').fill('CAD')
 await newform.locator('[data-action="workos-smart-assign"]').click()
 await page.locator('.workos-candidates').wait_for(state='visible',timeout=4000)
 assert '95' in (await page.locator('.candidate-score').first.inner_text())
 await page.locator('[data-action="workos-use-candidate"]').first.click()
 await page.locator('form[data-form="workos-task"]').wait_for(state='visible',timeout=3000)
 await page.locator('[data-action="close-overlay"]').first.click()
 # Operational calendar views.
 await page.locator('[data-nav="calendar"]').click()
 await page.locator('.workos-calendar-shell').wait_for(state='visible',timeout=5000)
 for view in ['week','day','agenda','capacity','month']:
  btn=page.locator(f'[data-action="workos-calendar-view"][data-view="{view}"]')
  assert await btn.count()==1
  await btn.click()
  await page.wait_for_timeout(80)
 # Activity feed uses server-backed filter UI and task deep link.
 await page.locator('[data-nav="activity"]').click()
 await page.locator('.workos-activity-list').wait_for(state='visible',timeout=5000)
 assert await page.locator('[data-workos-activity-search]').count()==1
 await page.locator('.workos-activity-open').first.click()
 await page.locator('.workos-detail').wait_for(state='visible',timeout=4000)
 await page.locator('[data-action="close-overlay"]').first.click()
 await page.screenshot(path='/mnt/data/optimum66-work-os-proof.png',full_page=True)
 await page.close()

async def work_os_limited_flow(browser):
 page=await browser.new_page(viewport={'width':1360,'height':900})
 await initialize(page,'client','engineer')
 await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/tasks"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded')
 await page.locator('.workos-cockpit').wait_for(state='visible',timeout=7000)
 assert await page.locator('.workos-workspace-tabs [data-action="workos-workspace-view"][data-view="capacity"]').count()==0
 assert await page.locator('[data-action="workos-admin"]').count()==0
 await page.locator('.workos-workspace-tabs [data-action="workos-workspace-view"][data-view="tasks"]').first.click()
 await page.locator('.workos-kpis').wait_for(state='visible',timeout=5000)
 await page.locator('.workos-task-card [data-action="open-task"]').first.click()
 await page.locator('.workos-detail').wait_for(state='visible',timeout=4000)
 await page.locator('.workos-detail [data-action="edit-task"]').click()
 form=page.locator('form[data-form="workos-task"]')
 await form.wait_for(state='visible',timeout=3000)
 assert await form.locator('[name="owner_user_id"]').is_disabled()
 await page.locator('[data-action="close-overlay"]').first.click()
 await page.locator('[data-nav="calendar"]').click()
 await page.locator('.workos-calendar-shell').wait_for(state='visible',timeout=4000)
 assert await page.locator('[data-action="workos-calendar-view"][data-view="capacity"]').count()==0
 await page.close()

async def work_excellence_flow(browser):
 page=await browser.new_page(viewport={'width':1536,'height':1024})
 await initialize(page,'client','owner')
 await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/tasks"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded')
 # Work Cockpit is the default daily operating surface.
 await page.locator('.workos-cockpit').wait_for(state='visible',timeout=7000)
 assert await page.locator('.workos-signal').count()>=6
 assert await page.locator('.workos-focus-card').count()==1
 assert await page.locator('.workos-manager-pulse').count()==1
 # Risk Center is actionable, not a KPI-only page.
 await page.locator('.workos-workspace-tabs [data-action="workos-workspace-view"][data-view="risks"]').click()
 await page.locator('.workos-risk-center').wait_for(state='visible',timeout=4000)
 assert await page.locator('.workos-risk-card').count()>=1
 # Dependency graph is directly navigable to work items.
 await page.locator('.workos-workspace-tabs [data-action="workos-workspace-view"][data-view="dependencies"]').click()
 await page.locator('.workos-dependency-map').wait_for(state='visible',timeout=4000)
 assert await page.locator('.workos-graph-node').count()==2
 # Capacity planner combines people, work days and availability.
 await page.locator('.workos-workspace-tabs [data-action="workos-workspace-view"][data-view="capacity"]').click()
 await page.locator('.workos-capacity-matrix').wait_for(state='visible',timeout=4000)
 assert await page.locator('.workos-cap-member').count()==2
 assert await page.locator('.workos-cap-cell.leave').count()>=1
 # Work Item 360 has real tabs.
 await page.locator('.workos-workspace-tabs [data-action="workos-workspace-view"][data-view="tasks"]').click()
 await page.locator('.workos-task-card [data-action="open-task"]').first.click()
 await page.locator('.workos-detail').wait_for(state='visible',timeout=4000)
 assert await page.locator('[data-action="workos-detail-tab"]').count()>=5
 for tab in ['people','dependencies','files','activity','overview']:
  b=page.locator(f'[data-action="workos-detail-tab"][data-tab="{tab}"]')
  assert await b.count()==1
  await b.click()
 await page.locator('.workos-detail [data-action="edit-task"]').click()
 form=page.locator('form[data-form="workos-task"]'); await form.wait_for(state='visible',timeout=3000)
 await form.locator('[data-action="workos-smart-assign"]').click()
 await page.locator('.workos-candidates.smart-v2').wait_for(state='visible',timeout=4000)
 assert await page.locator('[data-action="workos-smart-strategy"]').count()==3
 await page.locator('[data-action="workos-smart-strategy"][data-strategy="capacity"]').click()
 assert '95' in (await page.locator('.candidate-score').first.inner_text())
 await page.locator('[data-action="close-overlay"]').first.click()
 # Work OS setup: workflow templates + visual automation builder.
 await page.locator('[data-action="workos-admin"]').click()
 await page.locator('[data-action="workos-admin-tab"][data-tab="workflows"]').click()
 await page.locator('.workos-workflow-gallery').wait_for(state='visible',timeout=3000)
 assert await page.locator('[data-action="workos-new-workflow-template"]').count()==1
 await page.locator('[data-action="workos-new-workflow-template"]').click()
 await page.locator('form[data-form="workos-workflow-template"]').wait_for(state='visible',timeout=3000)
 assert await page.locator('.workflow-step-card').count()==3
 before=await page.locator('.workflow-step-card').count(); await page.locator('[data-action="workos-add-workflow-step"]').click(); assert await page.locator('.workflow-step-card').count()==before+1
 await page.locator('[data-action="close-overlay"]').first.click()
 # reopen setup for automation because workflow dialog replaced the admin overlay.
 await page.locator('[data-action="workos-admin"]').click()
 await page.locator('[data-action="workos-admin-tab"][data-tab="automation"]').click()
 await page.locator('[data-action="workos-new-automation"]').click()
 await page.locator('form[data-form="workos-automation"]').wait_for(state='visible',timeout=3000)
 assert await page.locator('.automation-builder-block').count()==3
 assert await page.locator('form[data-form="workos-automation"] [name="actions_json"]').count()==0
 # Calendar events are draggable and rescheduling calls atomic save with lock version.
 await page.locator('[data-action="close-overlay"]').first.click()
 await page.locator('[data-nav="calendar"]').click(); await page.locator('.workos-calendar-shell').wait_for(state='visible',timeout=4000)
 draggable=page.locator('[data-workos-drag-task]').first; assert await draggable.count()==1
 target=page.locator('[data-workos-drop-date]').last
 before_calls=len(captured['work_calls'])
 js="() => { const src=document.querySelector('[data-workos-drag-task]'); const zones=[...document.querySelectorAll('[data-workos-drop-date]')]; const dst=zones[zones.length-1]; const dt=new DataTransfer(); src.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt})); dst.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt})); dst.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt})); setTimeout(()=>src.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt})),50); }"
 await page.evaluate(js)
 await wait_until(lambda: len(captured['work_calls'])>before_calls,timeout=5,label='calendar atomic reschedule')
 saves=[x for x in captured['work_calls'][before_calls:] if x[0]=='save_work_item']
 assert saves and saves[-1][1]['p_payload']['expected_lock_version']==3
 await page.screenshot(path='/mnt/data/optimum67-work-excellence-proof.png',full_page=True)
 await page.close()

async def work_mobile_excellence_flow(browser):
 page=await browser.new_page(viewport={'width':390,'height':844})
 await initialize(page,'client','owner')
 await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/tasks"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded')
 await page.locator('.workos-cockpit').wait_for(state='visible',timeout=7000)
 assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 3')
 await page.locator('.workos-focus-card [data-action="open-task"]').first.click()
 drawer=page.locator('.drawer').last; await drawer.wait_for(state='visible',timeout=4000); await page.wait_for_timeout(240)
 box=await drawer.bounding_box(); assert box and box['width']<=392 and box['x']>=-2 and box['x']+box['width']<=392
 assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 3')
 await page.screenshot(path='/mnt/data/optimum67-work-mobile-proof.png',full_page=True)
 await page.close()

async def pdc_owner_flow(browser):
 enable_pdc_contracts()
 captured['actor']='owner'; captured['pdc_calls'].clear()
 page=await browser.new_page(viewport={'width':1536,'height':1024})
 await initialize(page,'client','owner'); await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/projects"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded')
 await page.locator('.pdc-portfolio-hero').wait_for(state='visible',timeout=8000)
 assert await page.locator('.pdc-project-card').count()==2
 await page.locator('.pdc-project-card [data-action="open-project"]').first.click()
 await page.locator('.project360-hero').wait_for(state='visible',timeout=4000)
 assert '82%' in await page.locator('.project-health-orb').inner_text()
 assert await page.locator('.pdc-site-list [data-action="open-site"]').count()==1
 await page.locator('.pdc-site-list [data-action="open-site"]').click(); await page.locator('.site-delivery-hero').wait_for(state='visible',timeout=4000)
 assert 'Alpha Main Site' in await page.locator('.drawer').last.inner_text()
 await page.locator('[data-action="close-overlay"]').first.click()
 # open exact project CDE
 await page.locator('.pdc-project-card [data-action="open-project-files"]').first.click(); await page.locator('.cde-workspace').wait_for(state='visible',timeout=6000)
 assert await page.locator('.folder-tree-panel').count()==1
 await page.locator(f'[data-action="open-folder"][data-id="{FOLDER}"]').first.click()
 await page.locator('.cde-document-card').wait_for(state='visible',timeout=5000)
 assert 'Electrical Shop Drawing A-102' in await page.locator('.cde-document-card').inner_text()
 # server-side search
 await page.locator('#file-search').fill('Electrical Shop'); await page.wait_for_timeout(500)
 assert await page.locator('.cde-search-caption').count()==1
 # Document 360 and direct linked Work
 await page.locator(f'[data-action="open-document"][data-id="{DOC}"]').first.click(); await page.locator('.document360-hero').wait_for(state='visible',timeout=4000)
 assert await page.locator('.document360-links').count()==1
 assert await page.locator('[data-action="set-document-control"]').count()==5
 before=len(captured['pdc_calls']); await page.locator('[data-action="set-document-control"][data-status="approved"]').click(); await wait_until(lambda: len(captured['pdc_calls'])>before,label='document control status')
 assert captured['pdc_calls'][-1][0]=='set_document_control_status'
 await page.wait_for_timeout(700)
 await page.locator('[data-action="close-overlay"]').first.click()
 # Storage intelligence is real/actionable.
 await page.locator('[data-action="open-storage-intelligence"]').click(); await page.locator('.storage-intelligence-hero').wait_for(state='visible',timeout=3000)
 assert '7.0 MB' in await page.locator('.storage-intelligence-hero').inner_text()
 await page.locator('[data-action="close-overlay"]').first.click()
 # Smart Trash server view.
 await page.locator('[data-nav="trash"]').click(); await page.locator('.trash-control').wait_for(state='visible',timeout=4000)
 assert 'Old Correspondence' in await page.locator('.page').inner_text()
 # Blueprint create and command RPC capture.
 await page.locator('[data-nav="projects"]').click(); await page.locator('[data-action="new-project"]').first.click()
 form=page.locator('form[data-form="project"]'); await form.wait_for(state='visible',timeout=3000)
 assert await form.locator('.blueprint-choice').count()>=1
 await form.locator('[name="name"]').fill('PDC Browser Project'); await form.locator('[name="code"]').fill('PDC-BR')
 before=len(captured['pdc_calls']); await form.locator('button[type="submit"]').click(); await wait_until(lambda: len(captured['pdc_calls'])>before,label='save project RPC')
 assert captured['pdc_calls'][-1][0]=='save_project' and captured['pdc_calls'][-1][1]['p_payload']['blueprint_id']==BLUEPRINT
 await page.screenshot(path='/mnt/data/optimum68-project-document-control-proof.png',full_page=True)
 await page.close()

async def pdc_limited_flow(browser):
 enable_pdc_contracts(); captured['actor']='engineer'; captured['pdc_calls'].clear()
 page=await browser.new_page(viewport={'width':1440,'height':960})
 await initialize(page,'client','engineer'); await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/projects"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded')
 await page.locator('.pdc-portfolio-hero').wait_for(state='visible',timeout=8000)
 assert await page.locator('[data-action="new-project"]').count()==0
 await page.locator('.pdc-project-card [data-action="open-project"]').first.click(); await page.locator('.project360-hero').wait_for(state='visible',timeout=4000)
 assert await page.locator('[data-action="archive-project"]').count()==0
 assert await page.locator('[data-action="edit-project"]').count()==0
 await page.locator('[data-action="close-overlay"]').first.click()
 await page.locator('.pdc-project-card [data-action="open-project-files"]').first.click(); await page.locator('.cde-workspace').wait_for(state='visible',timeout=5000)
 assert await page.locator('[data-action="upload-files"]').is_disabled()
 assert await page.locator('[data-action="create-folder"]').is_disabled()
 await page.locator(f'[data-action="open-folder"][data-id="{FOLDER}"]').first.click(); await page.locator('.cde-document-card').wait_for(state='visible',timeout=5000)
 await page.locator(f'[data-action="open-document"][data-id="{DOC}"]').first.click(); await page.locator('.document360-hero').wait_for(state='visible',timeout=4000)
 assert await page.locator('[data-action="set-document-control"]').count()==0
 assert await page.locator('[data-action="rename-document"]').count()==1
 assert await page.locator('[data-action="move-document"]').count()==1
 assert await page.locator('[data-action="trash-document"]').count()==0
 await page.screenshot(path='/mnt/data/optimum68-limited-document-control-proof.png',full_page=True)
 await page.close()

async def pdc_mobile_flow(browser):
 enable_pdc_contracts(); captured['actor']='owner'
 page=await browser.new_page(viewport={'width':390,'height':844})
 await initialize(page,'client','owner'); await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/projects"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded'); await page.locator('.pdc-portfolio-hero').wait_for(state='visible',timeout=8000)
 assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 3')
 await page.locator('.pdc-project-card [data-action="open-project"]').first.click(); drawer=page.locator('.drawer').last; await drawer.wait_for(state='visible',timeout=4000); await page.wait_for_timeout(240)
 box=await drawer.bounding_box(); assert box and box['width']<=392 and box['x']>=-2 and box['x']+box['width']<=392
 assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 3')
 await page.locator('[data-action="close-overlay"]').first.click(); await page.locator('.pdc-project-card [data-action="open-project-files"]').first.click(); await page.locator('.cde-workspace').wait_for(state='visible',timeout=5000)
 assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 3')
 await page.locator(f'[data-action="open-folder"][data-id="{FOLDER}"]').first.click(); await page.locator('.cde-document-card').wait_for(state='visible',timeout=5000); await page.locator(f'[data-action="open-document"][data-id="{DOC}"]').first.click(); drawer=page.locator('.drawer').last; await drawer.wait_for(state='visible',timeout=4000); await page.wait_for_timeout(240)
 box=await drawer.bounding_box(); assert box and box['width']<=392 and box['x']>=-2 and box['x']+box['width']<=392
 assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 3')
 await page.screenshot(path='/mnt/data/optimum68-project-document-mobile-proof.png',full_page=True)
 await page.close()


async def site69_owner_flow(browser):
 enable_pdc_contracts(); captured['actor']='owner'; captured['pdc_calls'].clear()
 page=await browser.new_page(viewport={'width':1536,'height':1024})
 await initialize(page,'client','owner'); await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/projects"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded'); await page.locator('.pdc-portfolio-hero').wait_for(state='visible',timeout=8000)
 # Site Delivery 360
 await page.locator('.pdc-project-card [data-action="open-project"]').first.click(); await page.locator('.project360-hero').wait_for(state='visible',timeout=4000)
 await page.locator(f'[data-action="open-site"][data-id="{SITE}"]').click(); await page.locator('.site-delivery-hero').wait_for(state='visible',timeout=4000)
 assert await page.locator('.cabinet-card').count()==1
 assert await page.locator('[data-action="new-cabinet"]').count()==1
 assert '42%' in await page.locator('.site-delivery-hero').inner_text()
 # Cabinet 360
 await page.locator(f'[data-action="open-cabinet"][data-id="{CABINET}"]').click(); await page.locator('.cabinet360-hero').wait_for(state='visible',timeout=4000)
 assert await page.locator('.cabinet-folder-card').count()==6
 assert await page.locator('[data-action="edit-cabinet"]').count()==1
 assert await page.locator('[data-action="archive-cabinet"]').count()==1
 await page.locator('[data-action="close-overlay"]').first.click()
 # Claim package and auto collect
 await page.locator('.pdc-project-card [data-action="open-project"]').first.click(); await page.locator(f'[data-action="open-site"][data-id="{SITE}"]').click(); await page.locator('.site-delivery-hero').wait_for(state='visible',timeout=4000)
 await page.locator(f'[data-action="open-claim-package"][data-id="{CLAIM}"]').click(); await page.locator('.claim360-hero').wait_for(state='visible',timeout=4000)
 assert await page.locator('.claim-requirement').count()>=2
 assert await page.locator('[data-action="auto-collect-claim"]').count()==1
 before=len(captured['pdc_calls']); await page.locator('[data-action="auto-collect-claim"]').click(); await wait_until(lambda: len(captured['pdc_calls'])>before,label='auto collect site claim')
 assert captured['pdc_calls'][-1][0]=='auto_collect_site_claim'
 await page.locator('.claim360-hero').wait_for(state='visible',timeout=4000)
 # Included canonical document deep-link -> Document 360 -> add to another claim requirement.
 await page.locator(f'[data-action="navigate-entity"][data-type="document"][data-id="{SITE_DOC}"]').click(); await page.locator('.document360-hero').wait_for(state='visible',timeout=6000)
 assert await page.locator('.document-cabinet-context').count()==1
 assert await page.locator('.drawer').last.locator('[data-action="add-document-claim"]').count()>=1
 await page.locator('.drawer').last.locator('[data-action="add-document-claim"]').click(); form=page.locator('form[data-form="document-claim"]'); await form.wait_for(state='visible',timeout=3000)
 before=len(captured['pdc_calls']); await form.locator('button[type="submit"]').click(); await wait_until(lambda: len(captured['pdc_calls'])>before,label='add document to site claim')
 assert captured['pdc_calls'][-1][0]=='add_document_to_site_claim'
 # Create Cabinet command from Site 360.
 await page.locator('[data-action="close-overlay"]').first.click()
 await page.locator('[data-nav="projects"]').click(); await page.locator('.pdc-project-card [data-action="open-project"]').first.click(); await page.locator(f'[data-action="open-site"][data-id="{SITE}"]').click(); await page.locator('.site-delivery-hero').wait_for(state='visible',timeout=4000)
 await page.locator('[data-action="new-cabinet"]').click(); form=page.locator('form[data-form="site-cabinet"]'); await form.wait_for(state='visible',timeout=3000)
 await form.locator('[name="code"]').fill('CAB-02'); await form.locator('[name="name"]').fill('Cabinet Two')
 before=len(captured['pdc_calls']); await form.locator('button[type="submit"]').click(); await wait_until(lambda: len(captured['pdc_calls'])>before,label='save site cabinet')
 assert captured['pdc_calls'][-1][0]=='save_site_cabinet'
 await page.screenshot(path='/mnt/data/optimum69-site-delivery-claim-proof.png',full_page=True)
 await page.close()

async def site69_limited_flow(browser):
 enable_pdc_contracts(); captured['actor']='engineer'; captured['pdc_calls'].clear()
 page=await browser.new_page(viewport={'width':1440,'height':960})
 await initialize(page,'client','engineer'); await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/projects"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded'); await page.locator('.pdc-portfolio-hero').wait_for(state='visible',timeout=8000)
 await page.locator('.pdc-project-card [data-action="open-project"]').first.click(); await page.locator(f'[data-action="open-site"][data-id="{SITE}"]').click(); await page.locator('.site-delivery-hero').wait_for(state='visible',timeout=4000)
 assert await page.locator('[data-action="new-cabinet"]').count()==0
 assert await page.locator('[data-action="edit-site"]').count()==0
 assert await page.locator('[data-action="archive-site"]').count()==0
 await page.locator(f'[data-action="open-cabinet"][data-id="{CABINET}"]').click(); await page.locator('.cabinet360-hero').wait_for(state='visible',timeout=4000)
 assert await page.locator('[data-action="edit-cabinet"]').count()==0
 assert await page.locator('[data-action="archive-cabinet"]').count()==0
 await page.locator('[data-action="close-overlay"]').first.click()
 await page.locator('.pdc-project-card [data-action="open-project"]').first.click(); await page.locator(f'[data-action="open-site"][data-id="{SITE}"]').click(); await page.locator(f'[data-action="open-claim-package"][data-id="{CLAIM}"]').click(); await page.locator('.claim360-hero').wait_for(state='visible',timeout=4000)
 assert await page.locator('[data-action="auto-collect-claim"]').count()==0
 assert await page.locator('[data-action="add-claim-requirement"]').count()==0
 assert await page.locator('[data-action="freeze-claim"]').count()==0
 await page.locator(f'[data-action="navigate-entity"][data-type="document"][data-id="{SITE_DOC}"]').click(); await page.locator('.document360-hero').wait_for(state='visible',timeout=6000)
 assert await page.locator('.document-cabinet-context').count()==1
 assert await page.locator('.drawer').last.locator('[data-action="add-document-claim"]').count()==0
 # Proof screenshot should show the stable read-only Site Delivery surface rather than a nested portal transition.
 await page.locator('[data-action="close-overlay"]').first.click()
 await page.locator('[data-nav="projects"]').click(); await page.locator('.pdc-project-card [data-action="open-project"]').first.click(); await page.locator(f'[data-action="open-site"][data-id="{SITE}"]').click(); await page.locator('.site-delivery-hero').wait_for(state='visible',timeout=4000); await page.wait_for_timeout(320)
 await page.screenshot(path='/mnt/data/optimum69-site-delivery-limited-proof.png',full_page=True)
 await page.close()

async def site69_mobile_flow(browser):
 enable_pdc_contracts(); captured['actor']='owner'
 page=await browser.new_page(viewport={'width':390,'height':844})
 await initialize(page,'client','owner'); await page.route('https://client.test/**',local_route)
 html=(ROOT/'index.html').read_text().replace('<head>','<head><base href="https://client.test/"><script>location.hash="#/projects"</script>',1)
 await page.set_content(html,wait_until='domcontentloaded'); await page.locator('.pdc-portfolio-hero').wait_for(state='visible',timeout=8000)
 await page.locator('.pdc-project-card [data-action="open-project"]').first.click(); await page.locator(f'[data-action="open-site"][data-id="{SITE}"]').click(); drawer=page.locator('.drawer').last; await page.locator('.site-delivery-hero').wait_for(state='visible',timeout=4000); await page.wait_for_timeout(180)
 box=await drawer.bounding_box(); assert box and box['width']<=392 and box['x']>=-2 and box['x']+box['width']<=392; assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 3')
 await page.locator(f'[data-action="open-cabinet"][data-id="{CABINET}"]').click(); await page.locator('.cabinet360-hero').wait_for(state='visible',timeout=4000); await page.wait_for_timeout(180)
 box=await page.locator('.drawer').last.bounding_box(); assert box and box['width']<=392 and box['x']>=-2 and box['x']+box['width']<=392; assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 3')
 await page.locator('[data-action="close-overlay"]').first.click(); await page.locator('.pdc-project-card [data-action="open-project"]').first.click(); await page.locator(f'[data-action="open-site"][data-id="{SITE}"]').click(); await page.locator(f'[data-action="open-claim-package"][data-id="{CLAIM}"]').click(); await page.locator('.claim360-hero').wait_for(state='visible',timeout=4000); await page.wait_for_timeout(180)
 box=await page.locator('.drawer').last.bounding_box(); assert box and box['width']<=392 and box['x']>=-2 and box['x']+box['width']<=392; assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 3')
 await page.screenshot(path='/mnt/data/optimum69-site-delivery-mobile-proof.png',full_page=True)
 await page.close()

async def main():
 flow=(sys.argv[1] if len(sys.argv)>1 else os.environ.get('OPTIMUM_BROWSER_FLOW','all')).strip().lower()
 flows={'client':client_flow,'orgos':organization_os_flow,'limited':limited_permission_flow,'mobile':mobile_responsive_flow,'policy':adaptive_policy_flow,'platform':platform_flow,'workos':work_os_flow,'worklimited':work_os_limited_flow,'excellence':work_excellence_flow,'workmobile':work_mobile_excellence_flow,'pdc':pdc_owner_flow,'pdclimited':pdc_limited_flow,'pdcmobile':pdc_mobile_flow,'site69':site69_owner_flow,'site69limited':site69_limited_flow,'site69mobile':site69_mobile_flow}
 selected=list(flows) if flow=='all' else [x.strip() for x in flow.split(',') if x.strip()]
 unknown=[x for x in selected if x not in flows]
 if unknown: raise SystemExit(f'Unknown browser flow(s): {unknown}')
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for name in selected:
   print(f'BROWSER FLOW {name} START',flush=True)
   await flows[name](browser)
   print(f'BROWSER FLOW {name} PASS',flush=True)
  await browser.close()
 print(json.dumps({'ok':True,'flows':selected,'captured':{**captured,'disabled_entitlements':sorted(captured.get('disabled_entitlements') or [])}},ensure_ascii=False,indent=2))

asyncio.run(main())
