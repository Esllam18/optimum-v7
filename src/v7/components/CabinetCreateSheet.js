'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import SideSheet from './SideSheet';
import { Button } from './Primitives';

const empty={code:'',name:'',cabinet_type:'fiber_cabinet',status:'active',location_label:'',description:''};
export default function CabinetCreateSheet({open,onClose,site,locale,onCreated}){
  const [form,setForm]=useState(empty),[saving,setSaving]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!open){setForm(empty);setError('');}},[open]);
  const set=(k,v)=>setForm(x=>({...x,[k]:v}));
  const submit=async e=>{e.preventDefault();if(saving||!form.code.trim()||!form.name.trim())return;setSaving(true);setError('');try{const cabinet=await api.rpc('save_site_cabinet',{p_payload:{id:null,site_id:site.id,code:form.code.trim(),name:form.name.trim(),cabinet_type:form.cabinet_type.trim()||'fiber_cabinet',status:form.status,description:form.description.trim()||null,location_label:form.location_label.trim()||null}});api.clearReadCache();await onCreated?.(cabinet);}catch(err){setError(err.message||(locale==='ar'?'تعذر إنشاء الكابينة.':'Could not create cabinet.'));}finally{setSaving(false);}};
  return <SideSheet open={open} onClose={saving?undefined:onClose} eyebrow="DELIVERY UNIT" title={locale==='ar'?'كابينة جديدة':'New cabinet'} subtitle={locale==='ar'?`${site.code} · ${site.name} — سيُنشئ Optimum تلقائيًا هيكل C01–C06 داخل الـCDE.`:`${site.code} · ${site.name} — Optimum will automatically seed the C01–C06 CDE evidence structure.`}>
    <form className="v7-form-stack" onSubmit={submit}>
      <div className="v7-form-grid"><label><span>{locale==='ar'?'كود الكابينة':'Cabinet code'}</span><input required autoFocus value={form.code} onChange={e=>set('code',e.target.value)} placeholder="CAB-001"/></label><label><span>{locale==='ar'?'الاسم':'Name'}</span><input required value={form.name} onChange={e=>set('name',e.target.value)}/></label></div>
      <div className="v7-form-grid"><label><span>{locale==='ar'?'النوع':'Type'}</span><input value={form.cabinet_type} onChange={e=>set('cabinet_type',e.target.value)} placeholder="fiber_cabinet"/></label><label><span>{locale==='ar'?'الحالة':'Status'}</span><select value={form.status} onChange={e=>set('status',e.target.value)}><option value="planned">Planned</option><option value="active">Active</option><option value="installed">Installed</option><option value="testing">Testing</option><option value="handover">Handover</option><option value="completed">Completed</option></select></label></div>
      <label><span>{locale==='ar'?'الموقع داخل الموقع':'Location label'}</span><input value={form.location_label} onChange={e=>set('location_label',e.target.value)} placeholder={locale==='ar'?'غرفة الاتصالات / الدور…':'Telecom room / floor…'}/></label>
      <label><span>{locale==='ar'?'الوصف':'Description'}</span><textarea rows={4} value={form.description} onChange={e=>set('description',e.target.value)}/></label>
      {error?<div className="v7-form-error">{error}</div>:null}
      <div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={saving}>{locale==='ar'?'إلغاء':'Cancel'}</Button><Button type="submit" variant="primary" icon="plus" disabled={saving||!form.code.trim()||!form.name.trim()}>{saving?(locale==='ar'?'جارٍ الإنشاء…':'Creating…'):(locale==='ar'?'إنشاء الكابينة':'Create cabinet')}</Button></div>
    </form>
  </SideSheet>;
}
