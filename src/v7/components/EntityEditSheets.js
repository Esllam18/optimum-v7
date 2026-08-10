'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import SideSheet from './SideSheet';
import { Button, Skeleton } from './Primitives';

const dateValue = value => value ? String(value).slice(0, 10) : '';
const nullable = value => String(value ?? '').trim() || null;

function useActiveMembers(open, companyId) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !companyId) { setMembers([]); return; }
    const c = new AbortController(); setLoading(true);
    (async () => {
      try {
        const memberships = await api.select('company_memberships', {
          select: 'id,user_id,job_title', filters: { company_id: `eq.${companyId}`, status: 'eq.active' },
          order: 'created_at.asc', cacheTtlMs: 30_000, signal: c.signal
        }).catch(() => []);
        const ids = [...new Set(memberships.map(row => row.user_id).filter(Boolean))];
        const profiles = ids.length ? await api.select('profiles', {
          select: 'id,full_name', filters: { id: `in.(${ids.join(',')})` }, cacheTtlMs: 30_000, signal: c.signal
        }).catch(() => []) : [];
        const names = new Map(profiles.map(row => [row.id, row.full_name]));
        setMembers(memberships.map(row => ({ ...row, full_name: names.get(row.user_id) || row.user_id })));
      } finally { if (!c.signal.aborted) setLoading(false); }
    })();
    return () => c.abort();
  }, [open, companyId]);
  return { members, loading };
}

export function ProjectEditSheet({ open, onClose, workspace, project, locale, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { members, loading } = useActiveMembers(open, workspace?.company?.id);

  useEffect(() => {
    if (!open || !project?.id) return;
    setForm({
      code: project.code || '', name: project.name || '', client_name: project.client_name || '',
      project_type: project.project_type || '', status: project.status === 'archived' ? 'active' : (project.status || 'active'),
      manager_user_id: project.manager_user_id || '', planned_start_date: dateValue(project.planned_start_date),
      target_end_date: dateValue(project.target_end_date), progress_percent: Number(project.progress_percent || 0),
      description: project.description || ''
    });
    setError('');
  }, [open, project]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    if (saving || !project?.id || !form.code?.trim() || !form.name?.trim()) return;
    if (form.planned_start_date && form.target_end_date && form.target_end_date < form.planned_start_date) {
      setError(locale === 'ar' ? 'تاريخ النهاية المستهدف لا يمكن أن يسبق تاريخ البداية.' : 'Target end date cannot be before the planned start date.'); return;
    }
    setSaving(true); setError('');
    try {
      const saved = await api.rpc('save_project', { p_payload: {
        id: project.id, company_id: workspace.company.id, code: form.code.trim(), name: form.name.trim(),
        description: nullable(form.description), status: form.status, project_type: nullable(form.project_type),
        client_name: nullable(form.client_name), manager_user_id: form.manager_user_id || null,
        planned_start_date: form.planned_start_date || null, target_end_date: form.target_end_date || null,
        progress_percent: Math.max(0, Math.min(100, Number(form.progress_percent || 0)))
      }});
      api.clearReadCache(); await onSaved?.(saved);
    } catch (err) { setError(err.message || (locale === 'ar' ? 'تعذر تحديث المشروع.' : 'Could not update project.')); }
    finally { setSaving(false); }
  };

  return <SideSheet open={open} onClose={saving ? undefined : onClose} eyebrow="PROJECT SETTINGS" title={locale === 'ar' ? 'تعديل المشروع' : 'Edit project'} subtitle={project ? `${project.code} · ${project.name}` : ''}>
    {loading ? <Skeleton lines={2} /> : null}
    <form className="v7-form-stack" onSubmit={submit}>
      <div className="v7-form-grid"><label><span>{locale === 'ar' ? 'كود المشروع' : 'Project code'}</span><input required autoFocus value={form.code || ''} onChange={e => set('code', e.target.value)} /></label><label><span>{locale === 'ar' ? 'اسم المشروع' : 'Project name'}</span><input required value={form.name || ''} onChange={e => set('name', e.target.value)} /></label></div>
      <div className="v7-form-grid"><label><span>{locale === 'ar' ? 'نوع المشروع' : 'Project type'}</span><input value={form.project_type || ''} onChange={e => set('project_type', e.target.value)} /></label><label><span>{locale === 'ar' ? 'العميل' : 'Client'}</span><input value={form.client_name || ''} onChange={e => set('client_name', e.target.value)} /></label></div>
      <div className="v7-form-grid"><label><span>{locale === 'ar' ? 'مدير المشروع' : 'Project manager'}</span><select value={form.manager_user_id || ''} onChange={e => set('manager_user_id', e.target.value)}><option value="">{locale === 'ar' ? 'بدون تحديد' : 'Not assigned'}</option>{members.map(row => <option key={row.id} value={row.user_id}>{row.full_name}{row.job_title ? ` · ${row.job_title}` : ''}</option>)}</select></label><label><span>{locale === 'ar' ? 'الحالة' : 'Status'}</span><select value={form.status || 'active'} onChange={e => set('status', e.target.value)}><option value="planned">Planned</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select></label></div>
      <div className="v7-form-grid"><label><span>{locale === 'ar' ? 'البداية المخططة' : 'Planned start'}</span><input type="date" value={form.planned_start_date || ''} onChange={e => set('planned_start_date', e.target.value)} /></label><label><span>{locale === 'ar' ? 'النهاية المستهدفة' : 'Target end'}</span><input type="date" min={form.planned_start_date || undefined} value={form.target_end_date || ''} onChange={e => set('target_end_date', e.target.value)} /></label></div>
      <label><span>{locale === 'ar' ? 'نسبة الإنجاز' : 'Progress'}</span><input type="number" min="0" max="100" value={form.progress_percent ?? 0} onChange={e => set('progress_percent', e.target.value)} /></label>
      <label><span>{locale === 'ar' ? 'الوصف' : 'Description'}</span><textarea rows={5} value={form.description || ''} onChange={e => set('description', e.target.value)} /></label>
      {error ? <div className="v7-form-error">{error}</div> : null}
      <div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={saving}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant="primary" icon="check" disabled={saving}>{saving ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'حفظ التعديلات' : 'Save changes')}</Button></div>
    </form>
  </SideSheet>;
}

export function SiteEditSheet({ open, onClose, workspace, site, locale, onSaved }) {
  const [form, setForm] = useState({}); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const { members, loading } = useActiveMembers(open, workspace?.company?.id);
  useEffect(() => { if (!open || !site?.id) return; setForm({ code:site.code||'', name:site.name||'', description:site.description||'', status:site.status==='archived'?'active':(site.status||'active'), manager_user_id:site.manager_user_id||'', address:site.address||'', timezone:site.timezone||'Africa/Cairo', start_date:dateValue(site.start_date), target_end_date:dateValue(site.target_end_date) }); setError(''); }, [open, site]);
  const set=(k,v)=>setForm(x=>({...x,[k]:v}));
  const submit=async e=>{e.preventDefault();if(saving||!site?.id||!form.code?.trim()||!form.name?.trim())return;if(form.start_date&&form.target_end_date&&form.target_end_date<form.start_date){setError(locale==='ar'?'تاريخ النهاية المستهدف لا يمكن أن يسبق تاريخ البداية.':'Target end date cannot be before the start date.');return;}setSaving(true);setError('');try{const saved=await api.rpc('save_site',{p_payload:{id:site.id,project_id:site.project_id,code:form.code.trim(),name:form.name.trim(),description:nullable(form.description),status:form.status,manager_user_id:form.manager_user_id||null,address:nullable(form.address),timezone:nullable(form.timezone),start_date:form.start_date||null,target_end_date:form.target_end_date||null}});api.clearReadCache();await onSaved?.(saved);}catch(err){setError(err.message||(locale==='ar'?'تعذر تحديث الموقع.':'Could not update site.'));}finally{setSaving(false);}};
  return <SideSheet open={open} onClose={saving?undefined:onClose} eyebrow="SITE SETTINGS" title={locale==='ar'?'تعديل الموقع':'Edit site'} subtitle={site?`${site.code} · ${site.name}`:''}>{loading?<Skeleton lines={2}/>:null}<form className="v7-form-stack" onSubmit={submit}>
    <div className="v7-form-grid"><label><span>{locale==='ar'?'كود الموقع':'Site code'}</span><input required autoFocus value={form.code||''} onChange={e=>set('code',e.target.value)}/></label><label><span>{locale==='ar'?'اسم الموقع':'Site name'}</span><input required value={form.name||''} onChange={e=>set('name',e.target.value)}/></label></div>
    <div className="v7-form-grid"><label><span>{locale==='ar'?'مدير الموقع':'Site manager'}</span><select value={form.manager_user_id||''} onChange={e=>set('manager_user_id',e.target.value)}><option value="">{locale==='ar'?'بدون تحديد':'Not assigned'}</option>{members.map(row=><option key={row.id} value={row.user_id}>{row.full_name}{row.job_title?` · ${row.job_title}`:''}</option>)}</select></label><label><span>{locale==='ar'?'الحالة':'Status'}</span><select value={form.status||'active'} onChange={e=>set('status',e.target.value)}><option value="planned">Planned</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select></label></div>
    <label><span>{locale==='ar'?'العنوان / الموقع':'Address / location'}</span><input value={form.address||''} onChange={e=>set('address',e.target.value)}/></label>
    <div className="v7-form-grid"><label><span>{locale==='ar'?'تاريخ البداية':'Start date'}</span><input type="date" value={form.start_date||''} onChange={e=>set('start_date',e.target.value)}/></label><label><span>{locale==='ar'?'النهاية المستهدفة':'Target end'}</span><input type="date" min={form.start_date||undefined} value={form.target_end_date||''} onChange={e=>set('target_end_date',e.target.value)}/></label></div>
    <label><span>{locale==='ar'?'المنطقة الزمنية':'Timezone'}</span><input value={form.timezone||''} onChange={e=>set('timezone',e.target.value)}/></label><label><span>{locale==='ar'?'الوصف':'Description'}</span><textarea rows={4} value={form.description||''} onChange={e=>set('description',e.target.value)}/></label>
    {error?<div className="v7-form-error">{error}</div>:null}<div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={saving}>{locale==='ar'?'إلغاء':'Cancel'}</Button><Button type="submit" variant="primary" icon="check" disabled={saving}>{saving?(locale==='ar'?'جارٍ الحفظ…':'Saving…'):(locale==='ar'?'حفظ التعديلات':'Save changes')}</Button></div>
  </form></SideSheet>;
}

export function CabinetEditSheet({ open, onClose, cabinet, locale, onSaved }) {
  const [form,setForm]=useState({}); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  useEffect(()=>{if(!open||!cabinet?.id)return;setForm({code:cabinet.code||'',name:cabinet.name||'',cabinet_type:cabinet.cabinet_type||'fiber_cabinet',status:cabinet.status==='archived'?'active':(cabinet.status||'active'),location_label:cabinet.location_label||'',description:cabinet.description||''});setError('');},[open,cabinet]);
  const set=(k,v)=>setForm(x=>({...x,[k]:v}));
  const submit=async e=>{e.preventDefault();if(saving||!cabinet?.id||!form.code?.trim()||!form.name?.trim())return;setSaving(true);setError('');try{const saved=await api.rpc('save_site_cabinet',{p_payload:{id:cabinet.id,site_id:cabinet.site_id,code:form.code.trim(),name:form.name.trim(),cabinet_type:form.cabinet_type.trim()||'fiber_cabinet',status:form.status,location_label:nullable(form.location_label),description:nullable(form.description)}});api.clearReadCache();await onSaved?.(saved);}catch(err){setError(err.message||(locale==='ar'?'تعذر تحديث الكابينة.':'Could not update cabinet.'));}finally{setSaving(false);}};
  return <SideSheet open={open} onClose={saving?undefined:onClose} eyebrow="DELIVERY UNIT SETTINGS" title={locale==='ar'?'تعديل الكابينة':'Edit cabinet'} subtitle={cabinet?`${cabinet.code} · ${cabinet.name}`:''}><form className="v7-form-stack" onSubmit={submit}>
    <div className="v7-form-grid"><label><span>{locale==='ar'?'الكود':'Code'}</span><input required autoFocus value={form.code||''} onChange={e=>set('code',e.target.value)}/></label><label><span>{locale==='ar'?'الاسم':'Name'}</span><input required value={form.name||''} onChange={e=>set('name',e.target.value)}/></label></div>
    <div className="v7-form-grid"><label><span>{locale==='ar'?'النوع':'Type'}</span><input value={form.cabinet_type||''} onChange={e=>set('cabinet_type',e.target.value)}/></label><label><span>{locale==='ar'?'الحالة':'Status'}</span><select value={form.status||'active'} onChange={e=>set('status',e.target.value)}><option value="planned">Planned</option><option value="active">Active</option><option value="installed">Installed</option><option value="testing">Testing</option><option value="handover">Handover</option><option value="completed">Completed</option></select></label></div>
    <label><span>{locale==='ar'?'الموقع داخل الموقع':'Location label'}</span><input value={form.location_label||''} onChange={e=>set('location_label',e.target.value)}/></label><label><span>{locale==='ar'?'الوصف':'Description'}</span><textarea rows={4} value={form.description||''} onChange={e=>set('description',e.target.value)}/></label>
    {error?<div className="v7-form-error">{error}</div>:null}<div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={saving}>{locale==='ar'?'إلغاء':'Cancel'}</Button><Button type="submit" variant="primary" icon="check" disabled={saving}>{saving?(locale==='ar'?'جارٍ الحفظ…':'Saving…'):(locale==='ar'?'حفظ التعديلات':'Save changes')}</Button></div>
  </form></SideSheet>;
}
