'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { can } from '../lib/workspace';
import Icon from '../components/Icon';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Panel, Skeleton, Stat } from '../components/Primitives';

const dayNames = {
  ar: ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'],
  en: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
};
const unitLabel = (locale, type) => ({
  ar: { division:'قطاع', department:'إدارة', team:'فريق', location:'موقع', cost_center:'مركز تكلفة' },
  en: { division:'Division', department:'Department', team:'Team', location:'Location', cost_center:'Cost center' }
})[locale]?.[type] || type;

export default function OrganizationPage({ workspace, locale }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unit, setUnit] = useState({ name_ar:'', name_en:'', unit_type:'department', parent_id:'', manager_user_id:'', code:'' });
  const [work, setWork] = useState({ timezone:'Africa/Cairo', work_days:[0,1,2,3,4], workday_start:'09:00', workday_end:'17:00', default_weekly_hours:'40', holidays:[], notification_defaults:{} });
  const canManage = can(workspace, 'company.manage') || can(workspace, 'members.manage');

  useEffect(() => {
    const c = new AbortController(); setError(null);
    Promise.all([
      api.select('organization_units', { filters:{ company_id:`eq.${workspace.company.id}`, is_active:'eq.true' }, order:'sort_order.asc,created_at.asc', cacheTtlMs:20_000, signal:c.signal }),
      api.rpc('member_directory_query', { p_company_id:workspace.company.id, p_query:null, p_status:'active', p_role_id:null, p_limit:200, p_offset:0 }, { cacheTtlMs:20_000, signal:c.signal, dedupe:true }).catch(() => ({ items:[] })),
      api.select('company_work_settings', { filters:{ company_id:`eq.${workspace.company.id}` }, limit:1, cacheTtlMs:20_000, signal:c.signal }).catch(() => []),
      api.rpc('organization_health_snapshot', { p_company_id:workspace.company.id }, { cacheTtlMs:20_000, signal:c.signal, dedupe:true }).catch(() => null)
    ]).then(([units, members, settings, health]) => {
      const row = settings[0];
      setData({ units, members:members?.items || [], health });
      if (row) setWork({ timezone:row.timezone || 'Africa/Cairo', work_days:row.work_days || [0,1,2,3,4], workday_start:String(row.workday_start || '09:00').slice(0,5), workday_end:String(row.workday_end || '17:00').slice(0,5), default_weekly_hours:String(row.default_weekly_hours || 40), holidays:row.holidays || [], notification_defaults:row.notification_defaults || {} });
    }).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [workspace.company.id, reload]);

  const orderedUnits = useMemo(() => {
    if (!data?.units) return [];
    const byParent = new Map();
    for (const row of data.units) { const key = row.parent_id || 'root'; if (!byParent.has(key)) byParent.set(key, []); byParent.get(key).push(row); }
    const out = [];
    const visit = (parent, depth) => { for (const row of byParent.get(parent) || []) { out.push({ ...row, depth }); visit(row.id, depth + 1); } };
    visit('root', 0); return out;
  }, [data]);

  const saveUnit = async (event) => {
    event.preventDefault(); setSaving(true); setError(null);
    try {
      await api.rpc('save_organization_unit', { p_payload:{ company_id:workspace.company.id, ...unit, parent_id:unit.parent_id || null, manager_user_id:unit.manager_user_id || null, color:'#6d5dfc', icon:'users', sort_order:100 } });
      setUnit({ name_ar:'', name_en:'', unit_type:'department', parent_id:'', manager_user_id:'', code:'' }); setShowNew(false); api.clearReadCache(); setReload(x => x + 1);
    } catch (err) { setError(err); }
    finally { setSaving(false); }
  };

  const saveWork = async () => {
    setSaving(true); setError(null);
    try { await api.rpc('save_company_work_settings', { p_company_id:workspace.company.id, p_payload:{ ...work, default_weekly_hours:Number(work.default_weekly_hours || 40) } }); api.clearReadCache(); setReload(x => x + 1); }
    catch (err) { setError(err); }
    finally { setSaving(false); }
  };

  if (error && !data) return <ErrorState title={locale === 'ar' ? 'تعذر تحميل نظام المؤسسة' : 'Organization OS could not be loaded'} description={error.message} retryLabel={locale === 'ar' ? 'إعادة المحاولة' : 'Retry'} onRetry={() => setReload(x => x + 1)} />;
  const health = data?.health || {};
  return <>
    <PageHeader eyebrow={locale === 'ar' ? 'نظام المؤسسة' : 'ORGANIZATION OS'} title={locale === 'ar' ? 'الهيكل والتنظيم' : 'Organization & structure'} description={locale === 'ar' ? 'الهيكل الإداري، المديرون، ساعات العمل والطاقة الأسبوعية؛ نفس عناصر النظام القديم في تجربة تشغيل أنظف.' : 'Structure, managers, working hours and weekly capacity — the original organization model in a cleaner operating experience.'} actions={canManage ? <Button variant="primary" icon="plus" onClick={() => setShowNew(x => !x)}>{locale === 'ar' ? 'وحدة تنظيمية' : 'Organization unit'}</Button> : null} />
    {error ? <div className="v7-inline-error">{error.message}</div> : null}
    <section className="v7-org-stats"><Stat icon="layers" label={locale === 'ar' ? 'وحدات تنظيمية' : 'Organization units'} value={data?.units?.length ?? '—'} /><Stat icon="users" label={locale === 'ar' ? 'أعضاء نشطون' : 'Active members'} value={health.metrics?.active_members ?? data?.members?.length ?? '—'} /><Stat icon="shield" label={locale === 'ar' ? 'صحة الإعداد' : 'Setup health'} value={health.score != null ? `${health.score}%` : '—'} /><Stat icon="clock" label={locale === 'ar' ? 'ساعات أسبوعية' : 'Weekly hours'} value={`${work.default_weekly_hours || 40}h`} /></section>
    {showNew ? <Panel title={locale === 'ar' ? 'إضافة وحدة تنظيمية' : 'Add organization unit'}><form className="v7-form-stack" onSubmit={saveUnit}><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'الاسم العربي' : 'Arabic name'}</span><input value={unit.name_ar} onChange={e => setUnit(x => ({...x,name_ar:e.target.value}))} required /></label><label><span>{locale === 'ar' ? 'الاسم الإنجليزي' : 'English name'}</span><input value={unit.name_en} onChange={e => setUnit(x => ({...x,name_en:e.target.value}))} required /></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'النوع' : 'Type'}</span><select value={unit.unit_type} onChange={e => setUnit(x => ({...x,unit_type:e.target.value}))}><option value="division">{unitLabel(locale,'division')}</option><option value="department">{unitLabel(locale,'department')}</option><option value="team">{unitLabel(locale,'team')}</option><option value="location">{unitLabel(locale,'location')}</option><option value="cost_center">{unitLabel(locale,'cost_center')}</option></select></label><label><span>{locale === 'ar' ? 'الوحدة الأم' : 'Parent unit'}</span><select value={unit.parent_id} onChange={e => setUnit(x => ({...x,parent_id:e.target.value}))}><option value="">{locale === 'ar' ? 'بدون — مستوى رئيسي' : 'None — root level'}</option>{data?.units?.map(row => <option key={row.id} value={row.id}>{locale === 'ar' ? row.name_ar : row.name_en}</option>)}</select></label></div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'المدير' : 'Manager'}</span><select value={unit.manager_user_id} onChange={e => setUnit(x => ({...x,manager_user_id:e.target.value}))}><option value="">{locale === 'ar' ? 'غير محدد' : 'Not assigned'}</option>{data?.members?.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.name || m.email}</option>)}</select></label><label><span>{locale === 'ar' ? 'الكود' : 'Code'}</span><input value={unit.code} onChange={e => setUnit(x => ({...x,code:e.target.value}))} /></label></div><div className="v7-form-actions"><Button type="button" onClick={() => setShowNew(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant="primary" disabled={saving}>{locale === 'ar' ? 'حفظ الوحدة' : 'Save unit'}</Button></div></form></Panel> : null}
    <div className="v7-org-layout">
      <Panel title={locale === 'ar' ? 'الخريطة التنظيمية' : 'Organization map'} description={locale === 'ar' ? 'تسلسل الوحدات والمدير المسؤول عن كل نطاق.' : 'Hierarchy and accountable manager for each operating area.'}>
        {!data ? <Skeleton lines={9} /> : orderedUnits.length ? <div className="v7-org-tree">{orderedUnits.map(row => { const manager = data.members.find(m => m.user_id === row.manager_user_id); return <article key={row.id} style={{ '--org-depth': row.depth }}><span><Icon name={row.unit_type === 'location' ? 'map' : row.unit_type === 'division' ? 'briefcase' : 'users'} size={16} /></span><div><strong>{locale === 'ar' ? row.name_ar : row.name_en}</strong><small>{unitLabel(locale,row.unit_type)}{row.code ? ` · ${row.code}` : ''}</small></div><span className="v7-org-manager"><strong>{manager?.full_name || manager?.name || '—'}</strong><small>{locale === 'ar' ? 'المدير' : 'Manager'}</small></span></article>; })}</div> : <EmptyState icon="layers" title={locale === 'ar' ? 'ابدأ بناء الهيكل التنظيمي' : 'Start the organization structure'} description={locale === 'ar' ? 'أنشئ إدارة أو فريقًا واحدًا على الأقل.' : 'Create at least one department or team.'} />}
      </Panel>
      <Panel title={locale === 'ar' ? 'أيام وساعات العمل' : 'Work schedule'} description={locale === 'ar' ? 'هذه القيم تغذي التقويم وحساب القدرة والتوزيع.' : 'These values drive calendar, capacity and assignment planning.'} action={can(workspace,'company.manage') ? <Button icon="save" onClick={saveWork} disabled={saving}>{locale === 'ar' ? 'حفظ' : 'Save'}</Button> : null}>
        {!data ? <Skeleton lines={8} /> : <div className="v7-work-settings"><label><span>{locale === 'ar' ? 'المنطقة الزمنية' : 'Timezone'}</span><input value={work.timezone} onChange={e => setWork(x => ({...x,timezone:e.target.value}))} /></label><div className="v7-work-days">{dayNames[locale].map((name, index) => <button type="button" key={name} className={work.work_days.includes(index) ? 'is-active' : ''} onClick={() => setWork(x => ({...x,work_days:x.work_days.includes(index) ? x.work_days.filter(d => d !== index) : [...x.work_days,index].sort()}))}>{name}</button>)}</div><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'بداية اليوم' : 'Workday start'}</span><input type="time" value={work.workday_start} onChange={e => setWork(x => ({...x,workday_start:e.target.value}))} /></label><label><span>{locale === 'ar' ? 'نهاية اليوم' : 'Workday end'}</span><input type="time" value={work.workday_end} onChange={e => setWork(x => ({...x,workday_end:e.target.value}))} /></label></div><label><span>{locale === 'ar' ? 'الساعات الأسبوعية الافتراضية' : 'Default weekly capacity'}</span><input type="number" min="1" max="168" value={work.default_weekly_hours} onChange={e => setWork(x => ({...x,default_weekly_hours:e.target.value}))} /></label></div>}
      </Panel>
    </div>
  </>;
}
