'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import SideSheet from './SideSheet';
import { Button, Skeleton } from './Primitives';

const empty = { code:'', name:'', description:'', status:'active', manager_user_id:'', address:'', timezone:'Africa/Cairo', start_date:'', target_end_date:'' };

export default function SiteCreateSheet({ open, onClose, workspace, project, locale, onCreated }) {
  const [form,setForm]=useState(empty);
  const [members,setMembers]=useState([]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!open){setForm(empty);setMembers([]);setError('');return;}
    const c=new AbortController(); setLoading(true);
    (async()=>{
      try{
        const ms=await api.select('company_memberships',{select:'id,user_id,job_title',filters:{company_id:`eq.${workspace.company.id}`,status:'eq.active'},order:'created_at.asc',cacheTtlMs:30_000,signal:c.signal}).catch(()=>[]);
        const ids=[...new Set(ms.map(x=>x.user_id).filter(Boolean))];
        const ps=ids.length?await api.select('profiles',{select:'id,full_name',filters:{id:`in.(${ids.join(',')})`},cacheTtlMs:30_000,signal:c.signal}).catch(()=>[]):[];
        const pm=new Map(ps.map(x=>[x.id,x.full_name]));
        setMembers(ms.map(x=>({...x,full_name:pm.get(x.user_id)||x.user_id})));
      }catch(err){if(err?.name!=='AbortError')setError(err.message||'Could not load site options');}
      finally{if(!c.signal.aborted)setLoading(false);}
    })();
    return()=>c.abort();
  },[open,workspace.company.id]);
  const set=(k,v)=>setForm(x=>({...x,[k]:v}));
  const submit=async e=>{
    e.preventDefault(); if(saving||!form.code.trim()||!form.name.trim())return;
    if(form.start_date&&form.target_end_date&&form.target_end_date<form.start_date){setError(locale==='ar'?'تاريخ النهاية المستهدف لا يمكن أن يسبق تاريخ البداية.':'Target end date cannot be before the start date.');return;}
    setSaving(true);setError('');
    try{
      const site=await api.rpc('save_site',{p_payload:{id:null,project_id:project.id,code:form.code.trim(),name:form.name.trim(),description:form.description.trim()||null,status:form.status,manager_user_id:form.manager_user_id||null,address:form.address.trim()||null,timezone:form.timezone.trim()||null,start_date:form.start_date||null,target_end_date:form.target_end_date||null}});
      api.clearReadCache(); await onCreated?.(site);
    }catch(err){setError(err.message||(locale==='ar'?'تعذر إنشاء الموقع.':'Could not create site.'));}
    finally{setSaving(false);}
  };
  return <SideSheet open={open} onClose={saving?undefined:onClose} eyebrow="SITE SETUP" title={locale==='ar'?'موقع جديد':'New site'} subtitle={locale==='ar'?`${project.code} · ${project.name} — الموقع سيصبح سياقًا مباشرًا للعمل والمستندات والهندسة والتسليم.`:`${project.code} · ${project.name} — the site becomes a direct context for work, documents, engineering and delivery.`}>
    {loading?<Skeleton lines={2}/>:null}
    <form className="v7-form-stack" onSubmit={submit}>
      <div className="v7-form-grid"><label><span>{locale==='ar'?'كود الموقع':'Site code'}</span><input required autoFocus value={form.code} onChange={e=>set('code',e.target.value)} placeholder="S001"/></label><label><span>{locale==='ar'?'اسم الموقع':'Site name'}</span><input required value={form.name} onChange={e=>set('name',e.target.value)}/></label></div>
      <div className="v7-form-grid"><label><span>{locale==='ar'?'مدير الموقع':'Site manager'}</span><select value={form.manager_user_id} onChange={e=>set('manager_user_id',e.target.value)}><option value="">{locale==='ar'?'بدون تحديد الآن':'Not assigned yet'}</option>{members.map(x=><option key={x.id} value={x.user_id}>{x.full_name}{x.job_title?` · ${x.job_title}`:''}</option>)}</select></label><label><span>{locale==='ar'?'الحالة':'Status'}</span><select value={form.status} onChange={e=>set('status',e.target.value)}><option value="planned">Planned</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select></label></div>
      <label><span>{locale==='ar'?'العنوان / وصف الموقع':'Address / location'}</span><input value={form.address} onChange={e=>set('address',e.target.value)}/></label>
      <div className="v7-form-grid"><label><span>{locale==='ar'?'تاريخ البداية':'Start date'}</span><input type="date" value={form.start_date} onChange={e=>set('start_date',e.target.value)}/></label><label><span>{locale==='ar'?'النهاية المستهدفة':'Target end'}</span><input type="date" min={form.start_date||undefined} value={form.target_end_date} onChange={e=>set('target_end_date',e.target.value)}/></label></div>
      <label><span>{locale==='ar'?'المنطقة الزمنية':'Timezone'}</span><input value={form.timezone} onChange={e=>set('timezone',e.target.value)} placeholder="Africa/Cairo"/></label>
      <label><span>{locale==='ar'?'الوصف':'Description'}</span><textarea rows={4} value={form.description} onChange={e=>set('description',e.target.value)}/></label>
      {error?<div className="v7-form-error">{error}</div>:null}
      <div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={saving}>{locale==='ar'?'إلغاء':'Cancel'}</Button><Button type="submit" variant="primary" icon="plus" disabled={saving||!form.code.trim()||!form.name.trim()}>{saving?(locale==='ar'?'جارٍ الإنشاء…':'Creating…'):(locale==='ar'?'إنشاء الموقع':'Create site')}</Button></div>
    </form>
  </SideSheet>;
}
