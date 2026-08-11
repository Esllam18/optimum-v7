'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import { normalizeArray } from '../lib/format';
import Icon from './Icon';
import SideSheet from './SideSheet';
import MemberOffboardingPanel from './MemberOffboardingPanel';
import { Badge, Button, ErrorState, Skeleton } from './Primitives';

const dateTimeValue = value => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const isoOrNull = value => value ? new Date(value).toISOString() : null;
const csv = value => String(value || '').split(',').map(x => x.trim()).filter(Boolean);

export default function MemberControlSheet({ open, onClose, workspace, membershipId, locale, onSaved }) {
  const [data, setData] = useState(null);
  const [security, setSecurity] = useState(null);
  const [roles, setRoles] = useState([]);
  const [units, setUnits] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [members, setMembers] = useState([]);
  const [preferences, setPreferences] = useState(null);
  const [compensation, setCompensation] = useState(null);
  const [compForm, setCompForm] = useState({ salary_amount:'', currency:'EGP', pay_frequency:'monthly', salary_effective_from:'', housing_allowance:'', transport_allowance:'', other_allowance:'', bonus_target:'', compensation_notes:'' });
  const [form, setForm] = useState(null);
  const [workPrefs, setWorkPrefs] = useState({ default_project_ids:[], notification_preferences:{}, calendar_preferences:{} });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !membershipId) return;
    const c = new AbortController();
    setData(null); setSecurity(null); setError('');
    Promise.all([
      api.rpc('member_access_snapshot', { p_membership_id:membershipId }, { cacheTtlMs:4_000, signal:c.signal, dedupe:true }),
      api.rpc('member_security_snapshot', { p_membership_id:membershipId }, { cacheTtlMs:4_000, signal:c.signal, dedupe:true }).catch(() => null),
      api.select('roles', { filters:{ company_id:`eq.${workspace.company.id}` }, order:'sort_order.asc,created_at.asc', cacheTtlMs:20_000, signal:c.signal }),
      api.select('organization_units', { filters:{ company_id:`eq.${workspace.company.id}`, is_active:'eq.true' }, order:'sort_order.asc,created_at.asc', cacheTtlMs:20_000, signal:c.signal }),
      api.select('projects', { filters:{ company_id:`eq.${workspace.company.id}`, archived_at:'is.null' }, order:'name.asc', cacheTtlMs:20_000, signal:c.signal }),
      api.select('sites', { filters:{ company_id:`eq.${workspace.company.id}`, archived_at:'is.null' }, order:'name.asc', cacheTtlMs:20_000, signal:c.signal }),
      api.rpc('member_directory_query', { p_company_id:workspace.company.id, p_query:null, p_status:'active', p_role_id:null, p_limit:200, p_offset:0 }, { cacheTtlMs:20_000, signal:c.signal, dedupe:true }).catch(() => ({items:[]})),
      api.select('member_work_preferences', { filters:{ membership_id:`eq.${membershipId}` }, limit:1, cacheTtlMs:10_000, signal:c.signal }).catch(() => []),
      can(workspace,'compensation.view') ? api.select('member_compensation', { filters:{ membership_id:`eq.${membershipId}` }, limit:1, cacheTtlMs:10_000, signal:c.signal }).catch(() => []) : Promise.resolve([])
    ]).then(([access, sec, roleRows, unitRows, projectRows, siteRows, memberRows, prefs, comp]) => {
      const member = access?.membership || {};
      const profile = access?.profile || {};
      setData(access); setSecurity(sec); setRoles(roleRows); setUnits(unitRows); setProjects(projectRows); setSites(siteRows); setMembers(normalizeArray(memberRows?.items));
      const compensationRow = comp[0] || null;
      setPreferences(prefs[0] || null); setCompensation(compensationRow);
      setCompForm({
        salary_amount:String(compensationRow?.salary_amount ?? ''), currency:compensationRow?.currency || 'EGP', pay_frequency:compensationRow?.pay_frequency || 'monthly',
        salary_effective_from:compensationRow?.salary_effective_from || '', housing_allowance:String(compensationRow?.housing_allowance ?? ''), transport_allowance:String(compensationRow?.transport_allowance ?? ''),
        other_allowance:String(compensationRow?.other_allowance ?? ''), bonus_target:String(compensationRow?.bonus_target ?? ''), compensation_notes:compensationRow?.compensation_notes || ''
      });
      setForm({
        full_name:profile.full_name || '', phone:profile.phone || '', whatsapp:profile.whatsapp || '',
        employee_code:member.employee_code || '', job_title:member.job_title || '', department:member.department || '',
        role_id:member.role_id || '', status:member.status || 'active', manager_user_id:member.manager_user_id || '',
        access_starts_at:dateTimeValue(member.access_starts_at), access_ends_at:dateTimeValue(member.access_ends_at), notes:member.notes || '',
        lifecycle_stage:member.lifecycle_stage || member.status || 'active', employment_type:member.employment_type || 'full_time',
        work_mode:member.work_mode || 'onsite', weekly_capacity_hours:String(member.weekly_capacity_hours ?? 40),
        experience_level:member.experience_level || '', skills:normalizeArray(member.skills).join(', '),
        alternate_manager_user_id:member.alternate_manager_user_id || '', primary_site_id:member.primary_site_id || '',
        unit_ids:normalizeArray(access?.organization_units).map(x => x.id),
      });
      const pref = prefs[0] || {};
      setWorkPrefs({ default_project_ids:normalizeArray(pref.default_project_ids), notification_preferences:pref.notification_preferences || {}, calendar_preferences:pref.calendar_preferences || {} });
    }).catch(err => { if (err?.name !== 'AbortError') setError(err.message || 'Load failed'); });
    return () => c.abort();
  }, [open, membershipId, workspace.company.id]);

  const member = data?.membership || {};
  const role = data?.role || {};
  const roleName = locale === 'ar' ? (role.name_ar || role.name_en) : (role.name_en || role.name_ar);

  const toggleUnit = id => setForm(x => ({ ...x, unit_ids:x.unit_ids.includes(id) ? x.unit_ids.filter(v => v !== id) : [...x.unit_ids,id] }));
  const toggleProject = id => setWorkPrefs(x => ({ ...x, default_project_ids:x.default_project_ids.includes(id) ? x.default_project_ids.filter(v => v !== id) : [...x.default_project_ids,id] }));

  const save = async event => {
    event.preventDefault();
    if (!form || saving) return;
    setSaving(true); setError('');
    try {
      const currentAddons = normalizeArray(data?.addons).map(x => x.id);
      const currentRules = normalizeArray(data?.scope_rules).map(rule => ({ permission_key:rule.permission_key || null, scope_type:rule.scope_type || 'company', target_id:rule.target_id || null, effect:rule.effect || 'allow' }));
      const compensationPayload = can(workspace,'compensation.manage') && (compensation || Object.values(compForm).some(value => String(value || '').trim())) ? {
        salary_amount:compForm.salary_amount || null, currency:(compForm.currency || 'EGP').toUpperCase(), pay_frequency:compForm.pay_frequency || 'monthly',
        salary_effective_from:compForm.salary_effective_from || null, housing_allowance:compForm.housing_allowance || null, transport_allowance:compForm.transport_allowance || null,
        other_allowance:compForm.other_allowance || null, bonus_target:compForm.bonus_target || null, compensation_notes:compForm.compensation_notes || null
      } : {};
      await api.rpc('save_member_control_profile', {
        p_membership_id:membershipId,
        p_control:{ role_id:form.role_id || null, status:form.status },
        p_profile:{ full_name:form.full_name, phone:form.phone || null, whatsapp:form.whatsapp || null, employee_code:form.employee_code || null, job_title:form.job_title || null, department:form.department || null, manager_user_id:form.manager_user_id || null, access_starts_at:isoOrNull(form.access_starts_at), access_ends_at:isoOrNull(form.access_ends_at), notes:form.notes || null },
        p_compensation:compensationPayload, p_permission_overrides:[],
        p_access:{ lifecycle_stage:form.lifecycle_stage, employment_type:form.employment_type, work_mode:form.work_mode, weekly_capacity_hours:Number(form.weekly_capacity_hours || 0), experience_level:form.experience_level || null, skills:csv(form.skills), alternate_manager_user_id:form.alternate_manager_user_id || null, primary_site_id:form.primary_site_id || null },
        p_addon_ids:currentAddons, p_unit_ids:form.unit_ids, p_scope_rules:currentRules
      });
      await api.rpc('save_member_work_preferences', { p_membership_id:membershipId, p_payload:workPrefs });
      api.clearReadCache();
      await onSaved?.();
      onClose?.();
    } catch (err) { setError(err.message || (locale === 'ar' ? 'تعذر حفظ ملف العضو.' : 'Could not save member profile.')); }
    finally { setSaving(false); }
  };

  return <SideSheet open={open} onClose={onClose} eyebrow={locale === 'ar' ? 'إدارة العضو 360°' : 'MEMBER CONTROL 360'} title={data?.profile?.full_name || (locale === 'ar' ? 'إدارة العضو' : 'Manage member')} subtitle={data ? `${roleName || '—'} · ${member.status || '—'}` : ''}>
    {error && !data ? <ErrorState title={locale === 'ar' ? 'تعذر تحميل ملف العضو' : 'Could not load member'} description={error} /> : !form ? <Skeleton lines={12} /> : <form className="v7-form-stack v7-member-control" onSubmit={save}>
      <section className="v7-detail-section"><div className="v7-member-control-status"><div><span className="v7-eyebrow">{locale === 'ar' ? 'الحساب والوصول' : 'ACCOUNT & ACCESS'}</span><strong>{data.profile?.full_name || '—'}</strong></div><Badge tone={member.status === 'active' ? 'success' : member.status === 'suspended' ? 'danger' : 'neutral'}>{member.status}</Badge></div><div className="v7-detail-grid"><div className="v7-detail-field"><span>{locale === 'ar' ? 'آخر دخول' : 'Last sign-in'}</span><strong>{security?.last_sign_in_at ? new Date(security.last_sign_in_at).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB') : '—'}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'البريد مؤكد' : 'Email confirmed'}</span><strong>{security?.email_confirmed_at ? (locale === 'ar' ? 'نعم' : 'Yes') : (locale === 'ar' ? 'لا' : 'No')}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'تغيير كلمة المرور مطلوب' : 'Password change required'}</span><strong>{security?.must_change_password ? (locale === 'ar' ? 'نعم' : 'Yes') : (locale === 'ar' ? 'لا' : 'No')}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'صلاحيات فعالة' : 'Effective permissions'}</span><strong>{normalizeArray(data.effective_permissions).length}</strong></div></div></section>

      <section className="v7-detail-section"><h3>{locale === 'ar' ? 'الهوية الوظيفية' : 'Employment profile'}</h3><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'الاسم' : 'Name'}</span><input value={form.full_name} onChange={e => setForm(x => ({...x,full_name:e.target.value}))} required /></label><label><span>{locale === 'ar' ? 'كود الموظف' : 'Employee code'}</span><input value={form.employee_code} onChange={e => setForm(x => ({...x,employee_code:e.target.value}))} /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'المسمى الوظيفي' : 'Job title'}</span><input value={form.job_title} onChange={e => setForm(x => ({...x,job_title:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'الإدارة/القسم' : 'Department'}</span><input value={form.department} onChange={e => setForm(x => ({...x,department:e.target.value}))} /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'المدير المباشر' : 'Direct manager'}</span><select value={form.manager_user_id} onChange={e => setForm(x => ({...x,manager_user_id:e.target.value}))}><option value="">{locale === 'ar' ? 'غير محدد' : 'Not assigned'}</option>{members.filter(m => m.user_id !== member.user_id).map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</select></label><label><span>{locale === 'ar' ? 'المدير البديل' : 'Alternate manager'}</span><select value={form.alternate_manager_user_id} onChange={e => setForm(x => ({...x,alternate_manager_user_id:e.target.value}))}><option value="">{locale === 'ar' ? 'غير محدد' : 'Not assigned'}</option>{members.filter(m => m.user_id !== member.user_id).map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</select></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'الهاتف' : 'Phone'}</span><input value={form.phone} onChange={e => setForm(x => ({...x,phone:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'واتساب' : 'WhatsApp'}</span><input value={form.whatsapp} onChange={e => setForm(x => ({...x,whatsapp:e.target.value}))} /></label></div></section>

      <section className="v7-detail-section"><h3>{locale === 'ar' ? 'الدور والحالة' : 'Role & lifecycle'}</h3><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'الدور' : 'Role'}</span><select value={form.role_id} onChange={e => setForm(x => ({...x,role_id:e.target.value}))}>{roles.filter(r => r.slug !== 'owner' || r.id === form.role_id).map(r => <option key={r.id} value={r.id}>{locale === 'ar' ? (r.name_ar || r.name_en) : (r.name_en || r.name_ar)}</option>)}</select></label><label><span>{locale === 'ar' ? 'حالة الحساب' : 'Account status'}</span><select value={form.status} onChange={e => setForm(x => ({...x,status:e.target.value}))}><option value="active">{locale === 'ar' ? 'نشط' : 'Active'}</option><option value="suspended">{locale === 'ar' ? 'موقوف' : 'Suspended'}</option>{member.status === 'left' ? <option value="left">{locale === 'ar' ? 'غادر' : 'Left'}</option> : null}{member.status === 'invited' ? <option value="invited">{locale === 'ar' ? 'مدعو' : 'Invited'}</option> : null}</select></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'مرحلة العضوية' : 'Lifecycle stage'}</span><select value={form.lifecycle_stage} onChange={e => setForm(x => ({...x,lifecycle_stage:e.target.value}))}>{member.status === 'invited' ? <option value="invited">{locale === 'ar' ? 'مدعو' : 'Invited'}</option> : null}<option value="onboarding">{locale === 'ar' ? 'تهيئة' : 'Onboarding'}</option><option value="active">{locale === 'ar' ? 'نشط' : 'Active'}</option><option value="on_leave">{locale === 'ar' ? 'في إجازة' : 'On leave'}</option>{member.lifecycle_stage === 'offboarding' ? <option value="offboarding">{locale === 'ar' ? 'قيد المغادرة' : 'Offboarding'}</option> : null}<option value="suspended">{locale === 'ar' ? 'موقوف' : 'Suspended'}</option>{member.status === 'left' ? <option value="left">{locale === 'ar' ? 'غادر' : 'Left'}</option> : null}</select></label><label><span>{locale === 'ar' ? 'نوع التوظيف' : 'Employment type'}</span><select value={form.employment_type} onChange={e => setForm(x => ({...x,employment_type:e.target.value}))}><option value="full_time">{locale === 'ar' ? 'دوام كامل' : 'Full time'}</option><option value="part_time">{locale === 'ar' ? 'دوام جزئي' : 'Part time'}</option><option value="contractor">{locale === 'ar' ? 'متعاقد' : 'Contractor'}</option><option value="temporary">{locale === 'ar' ? 'مؤقت' : 'Temporary'}</option><option value="intern">{locale === 'ar' ? 'متدرب' : 'Intern'}</option></select></label></div></section>

      <section className="v7-detail-section"><h3>{locale === 'ar' ? 'العمل والتوفر' : 'Work & availability'}</h3><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'نمط العمل' : 'Work mode'}</span><select value={form.work_mode} onChange={e => setForm(x => ({...x,work_mode:e.target.value}))}><option value="onsite">{locale === 'ar' ? 'بالموقع' : 'On-site'}</option><option value="hybrid">{locale === 'ar' ? 'هجين' : 'Hybrid'}</option><option value="remote">{locale === 'ar' ? 'عن بعد' : 'Remote'}</option></select></label><label><span>{locale === 'ar' ? 'السعة الأسبوعية' : 'Weekly capacity'}</span><input type="number" min="0" max="168" value={form.weekly_capacity_hours} onChange={e => setForm(x => ({...x,weekly_capacity_hours:e.target.value}))} /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'مستوى الخبرة' : 'Experience level'}</span><input value={form.experience_level} onChange={e => setForm(x => ({...x,experience_level:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'الموقع الأساسي' : 'Primary site'}</span><select value={form.primary_site_id} onChange={e => setForm(x => ({...x,primary_site_id:e.target.value}))}><option value="">{locale === 'ar' ? 'نطاق الشركة' : 'Company scope'}</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div><label><span>{locale === 'ar' ? 'المهارات — بفواصل' : 'Skills — comma separated'}</span><input value={form.skills} onChange={e => setForm(x => ({...x,skills:e.target.value}))} /></label></section>

      <section className="v7-detail-section"><h3>{locale === 'ar' ? 'نافذة الوصول' : 'Access window'}</h3><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'بداية الوصول' : 'Access starts'}</span><input type="datetime-local" value={form.access_starts_at} onChange={e => setForm(x => ({...x,access_starts_at:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'نهاية الوصول' : 'Access ends'}</span><input type="datetime-local" value={form.access_ends_at} onChange={e => setForm(x => ({...x,access_ends_at:e.target.value}))} /></label></div><label><span>{locale === 'ar' ? 'ملاحظات داخلية' : 'Internal notes'}</span><textarea value={form.notes} onChange={e => setForm(x => ({...x,notes:e.target.value}))} /></label></section>

      <section className="v7-detail-section"><h3>{locale === 'ar' ? 'الوحدات التنظيمية' : 'Organization units'}</h3><div className="v7-choice-grid">{units.map(u => <label key={u.id} className={form.unit_ids.includes(u.id) ? 'is-selected' : ''}><input type="checkbox" checked={form.unit_ids.includes(u.id)} onChange={() => toggleUnit(u.id)} /><Icon name="users" size={14} /><span>{locale === 'ar' ? u.name_ar : u.name_en}</span></label>)}</div></section>

      <section className="v7-detail-section"><h3>{locale === 'ar' ? 'المشاريع الافتراضية والإشعارات' : 'Default projects & notifications'}</h3><div className="v7-choice-grid">{projects.map(p => <label key={p.id} className={workPrefs.default_project_ids.includes(p.id) ? 'is-selected' : ''}><input type="checkbox" checked={workPrefs.default_project_ids.includes(p.id)} onChange={() => toggleProject(p.id)} /><Icon name="briefcase" size={14} /><span>{p.name}</span></label>)}</div><div className="v7-choice-grid v7-choice-grid--toggles">{[['task_assigned',locale === 'ar'?'تعيين مهمة':'Task assigned'],['task_due',locale === 'ar'?'استحقاق مهمة':'Task due'],['approval',locale === 'ar'?'الموافقات':'Approvals'],['security',locale === 'ar'?'الأمان':'Security']].map(([key,label]) => <label key={key} className={workPrefs.notification_preferences?.[key] !== false ? 'is-selected' : ''}><input type="checkbox" checked={workPrefs.notification_preferences?.[key] !== false} onChange={e => setWorkPrefs(x => ({...x,notification_preferences:{...x.notification_preferences,[key]:e.target.checked}}))} /><Icon name="bell" size={14} /><span>{label}</span></label>)}</div></section>

      {can(workspace,'compensation.view') ? <section className="v7-detail-section v7-sensitive-panel"><h3><Icon name="lock" size={15} /> {locale === 'ar' ? 'الراتب والتعويضات' : 'Salary & compensation'}</h3>{can(workspace,'compensation.manage') ? <div className="v7-form-stack"><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'الراتب الأساسي' : 'Base salary'}</span><input type="number" min="0" step="0.01" value={compForm.salary_amount} onChange={e => setCompForm(x => ({...x,salary_amount:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'العملة' : 'Currency'}</span><input value={compForm.currency} onChange={e => setCompForm(x => ({...x,currency:e.target.value.toUpperCase()}))} /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'دورية الدفع' : 'Pay frequency'}</span><select value={compForm.pay_frequency} onChange={e => setCompForm(x => ({...x,pay_frequency:e.target.value}))}>{['monthly','weekly','daily','hourly','yearly','custom'].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label><span>{locale === 'ar' ? 'تاريخ السريان' : 'Effective date'}</span><input type="date" value={compForm.salary_effective_from} onChange={e => setCompForm(x => ({...x,salary_effective_from:e.target.value}))} /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'بدل السكن' : 'Housing allowance'}</span><input type="number" min="0" step="0.01" value={compForm.housing_allowance} onChange={e => setCompForm(x => ({...x,housing_allowance:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'بدل الانتقال' : 'Transport allowance'}</span><input type="number" min="0" step="0.01" value={compForm.transport_allowance} onChange={e => setCompForm(x => ({...x,transport_allowance:e.target.value}))} /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'بدلات أخرى' : 'Other allowance'}</span><input type="number" min="0" step="0.01" value={compForm.other_allowance} onChange={e => setCompForm(x => ({...x,other_allowance:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'هدف المكافأة' : 'Bonus target'}</span><input type="number" min="0" step="0.01" value={compForm.bonus_target} onChange={e => setCompForm(x => ({...x,bonus_target:e.target.value}))} /></label></div><label><span>{locale === 'ar' ? 'ملاحظات التعويضات' : 'Compensation notes'}</span><textarea value={compForm.compensation_notes} onChange={e => setCompForm(x => ({...x,compensation_notes:e.target.value}))} /></label></div> : compensation ? <div className="v7-detail-grid"><div className="v7-detail-field"><span>{locale === 'ar' ? 'الراتب' : 'Salary'}</span><strong>{compensation.salary_amount ?? '—'} {compensation.currency || ''}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'دورية الدفع' : 'Pay frequency'}</span><strong>{compensation.pay_frequency || '—'}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'بدل السكن' : 'Housing allowance'}</span><strong>{compensation.housing_allowance ?? '—'} {compensation.currency || ''}</strong></div><div className="v7-detail-field"><span>{locale === 'ar' ? 'بدل الانتقال' : 'Transport allowance'}</span><strong>{compensation.transport_allowance ?? '—'} {compensation.currency || ''}</strong></div></div> : <p>{locale === 'ar' ? 'لا توجد بيانات تعويضات مسجلة لهذا العضو.' : 'No compensation record is stored for this member.'}</p>}</section> : null}
      {can(workspace,'members.manage') ? <MemberOffboardingPanel workspace={workspace} membershipId={membershipId} member={member} members={members} locale={locale} onChanged={onSaved} /> : null}
      {error ? <div className="v7-form-error">{error}</div> : null}
      <div className="v7-form-actions"><Button type="button" onClick={onClose}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant="primary" icon="save" disabled={saving}>{saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ ملف العضو' : 'Save member')}</Button></div>
    </form>}
  </SideSheet>;
}
