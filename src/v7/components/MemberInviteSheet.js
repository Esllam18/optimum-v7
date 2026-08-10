'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import SideSheet from './SideSheet';
import { Button } from './Primitives';

export default function MemberInviteSheet({ open, onClose, workspace, roles = [], locale, onInvited }) {
  const assignable = useMemo(() => roles.filter(r => r.slug !== 'owner'), [roles]);
  const [fullName,setFullName]=useState('');
  const [email,setEmail]=useState('');
  const [roleId,setRoleId]=useState('');
  const [expiry,setExpiry]=useState('168');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [inviteLink,setInviteLink]=useState('');
  const [existingAccount,setExistingAccount]=useState(false);
  const [copied,setCopied]=useState(false);
  useEffect(()=>{
    if(!open){setFullName('');setEmail('');setRoleId('');setExpiry('168');setError('');setInviteLink('');setExistingAccount(false);setCopied(false);return;}
    if(!roleId&&assignable[0]) setRoleId(assignable[0].id);
  },[open,assignable,roleId]);
  const submit=async e=>{
    e.preventDefault(); if(saving||!email.trim()||!roleId)return;
    setSaving(true);setError('');setInviteLink('');setExistingAccount(false);setCopied(false);
    try{
      const result=await api.invokeFunction('v7-member-invitation',{
        company_id:workspace.company.id,
        full_name:fullName.trim(),
        email:email.trim().toLowerCase(),
        role_id:roleId,
        expires_in_hours:Number(expiry)||168,
        redirect_origin:location.origin,
        locale
      });
      const link=String(result?.activation_url||'');
      if(!link) throw new Error(locale==='ar'?'لم يتم إنشاء رابط التفعيل.':'Activation link was not generated.');
      setInviteLink(link);setExistingAccount(Boolean(result?.existing_account));api.clearReadCache();await onInvited?.();
    }catch(err){setError(err.message||(locale==='ar'?'تعذر إنشاء الدعوة.':'Could not create invitation.'));}
    finally{setSaving(false);}
  };
  const copy=async()=>{if(!inviteLink)return;try{await navigator.clipboard.writeText(inviteLink);setCopied(true);}catch{setError(locale==='ar'?'تعذر نسخ الرابط تلقائيًا.':'Could not copy the link automatically.');}};
  return <SideSheet open={open} onClose={saving?undefined:onClose} eyebrow="SECURE INVITATION" title={locale==='ar'?'دعوة عضو جديد':'Invite a new member'} subtitle={locale==='ar'?'أنشئ رابط تفعيل مرتبط بالبريد. العضو الجديد يحدد كلمة مروره بنفسه، والحساب القائم يسجل الدخول بحسابه الحالي.':'Create an email-bound activation link. A new member chooses their own password; an existing account signs in with its current credentials.'}>
    <form className="v7-form-stack" onSubmit={submit}>
      <label><span>{locale==='ar'?'الاسم':'Full name'}</span><input autoFocus value={fullName} onChange={e=>setFullName(e.target.value)} placeholder={locale==='ar'?'اسم العضو':'Member name'} disabled={Boolean(inviteLink)} /></label>
      <label><span>{locale==='ar'?'البريد الإلكتروني':'Email address'}</span><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" disabled={Boolean(inviteLink)}/></label>
      <label><span>{locale==='ar'?'الدور عند التفعيل':'Role after activation'}</span><select required value={roleId} onChange={e=>setRoleId(e.target.value)} disabled={Boolean(inviteLink)}><option value="">{locale==='ar'?'اختر دورًا':'Choose a role'}</option>{assignable.map(r=><option key={r.id} value={r.id}>{locale==='ar'?(r.name_ar||r.name_en):(r.name_en||r.name_ar)}</option>)}</select></label>
      <label><span>{locale==='ar'?'صلاحية دعوة الشركة':'Company invitation expiry'}</span><select value={expiry} onChange={e=>setExpiry(e.target.value)} disabled={Boolean(inviteLink)}><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option><option value="336">14 days</option><option value="720">30 days</option></select></label>
      {error?<div className="v7-form-error">{error}</div>:null}
      {inviteLink?<div className="v7-invite-result"><span>{existingAccount?(locale==='ar'?'رابط قبول العضوية — حساب قائم':'Membership link — existing account'):(locale==='ar'?'رابط تفعيل الحساب':'Account activation link')}</span><code>{inviteLink}</code><div className="v7-inline-actions"><Button type="button" variant="primary" icon="copy" onClick={copy}>{copied?(locale==='ar'?'تم النسخ':'Copied'):(locale==='ar'?'نسخ الرابط':'Copy link')}</Button><Button type="button" onClick={()=>{setFullName('');setEmail('');setInviteLink('');setExistingAccount(false);setCopied(false);}}>{locale==='ar'?'دعوة شخص آخر':'Invite another'}</Button></div><small>{existingAccount?(locale==='ar'?'هذا البريد لديه حساب Optimum قائم؛ الرابط يطلب منه تسجيل الدخول ثم يقبل عضوية الشركة.':'This email already has an Optimum account; the link asks the user to sign in and then accepts the company membership.'):(locale==='ar'?'هذا رابط Auth أحادي الاستخدام ينشئ جلسة التفعيل؛ العضو يحدد كلمة مروره بنفسه ثم تُقبل عضوية الشركة.':'This one-time Auth link starts the activation session; the member chooses their own password and the company membership is then accepted.')}</small></div>:<div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={saving}>{locale==='ar'?'إلغاء':'Cancel'}</Button><Button type="submit" variant="primary" icon="plus" disabled={saving||!email.trim()||!roleId}>{saving?(locale==='ar'?'جارٍ إنشاء الدعوة…':'Creating invitation…'):(locale==='ar'?'إنشاء دعوة آمنة':'Create secure invitation')}</Button></div>}
    </form>
  </SideSheet>;
}
