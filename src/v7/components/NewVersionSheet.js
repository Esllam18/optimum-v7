'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import SideSheet from './SideSheet';
import Icon from './Icon';
import { Badge, Button } from './Primitives';

export default function NewVersionSheet({ open, onClose, document, locale, onUploaded }) {
  const [file,setFile]=useState(null); const [note,setNote]=useState(''); const [progress,setProgress]=useState(0); const [status,setStatus]=useState('ready'); const [error,setError]=useState('');
  useEffect(()=>{if(!open){setFile(null);setNote('');setProgress(0);setStatus('ready');setError('');}},[open]);
  const running=status==='uploading'||status==='finalizing';
  const submit=async e=>{e.preventDefault();if(running||!file||!document?.id)return;setStatus('uploading');setProgress(1);setError('');let reservation=null,uploaded=false;try{reservation=await api.rpc('begin_new_version_upload',{p_document_id:document.id,p_original_filename:file.name,p_mime_type:file.type||'application/octet-stream',p_size_bytes:file.size,p_change_note:note.trim()||null});await api.uploadObject(reservation.storage_bucket,reservation.storage_path,file,{onProgress:value=>{setProgress(value);if(value>=100)setStatus('finalizing');}});uploaded=true;setStatus('finalizing');await api.rpc('finalize_document_upload',{p_version_id:reservation.version_id,p_checksum_sha256:null});api.clearReadCache();setProgress(100);setStatus('done');await onUploaded?.(reservation);}catch(err){if(uploaded&&reservation?.storage_bucket&&reservation?.storage_path){try{await api.deleteObject(reservation.storage_bucket,reservation.storage_path);}catch{}}if(reservation?.version_id){try{await api.rpc('abort_document_upload',{p_version_id:reservation.version_id});}catch{}}setStatus('error');setError(err.message||(locale==='ar'?'فشل رفع الإصدار الجديد.':'New version upload failed.'));}};
  return <SideSheet open={open} onClose={running?undefined:onClose} eyebrow="VERSION CONTROL" title={locale==='ar'?'رفع إصدار جديد':'Upload new version'} subtitle={document?.display_name||''}><form className="v7-form-stack" onSubmit={submit}>
    <label className="v7-upload-drop"><input type="file" onChange={e=>{setFile(e.target.files?.[0]||null);setStatus('ready');setProgress(0);setError('');}}/><span className="v7-upload-drop-icon"><Icon name="upload" size={20}/></span><strong>{file?.name||(locale==='ar'?'اختر الملف الجديد':'Choose the new file')}</strong><small>{file?formatBytes(file.size,locale):(locale==='ar'?'سيتم الاحتفاظ بكل الإصدارات السابقة بدون استبدالها.':'All previous versions remain immutable and available.')}</small></label>
    <label><span>{locale==='ar'?'ملاحظة التغيير':'Change note'}</span><textarea rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder={locale==='ar'?'ما الذي تغير في هذا الإصدار؟':'What changed in this version?'}/></label>
    {file?<div className="v7-version-upload-status"><div><strong>{file.name}</strong><Badge tone={status==='done'?'success':status==='error'?'danger':running?'warning':'neutral'}>{status}</Badge></div><div className="v7-upload-progress v7-upload-progress--wide"><i style={{width:`${progress}%`}}/></div></div>:null}
    {error?<div className="v7-form-error">{error}</div>:null}
    <div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={running}>{locale==='ar'?'إلغاء':'Cancel'}</Button><Button type="submit" variant="primary" icon="upload" disabled={running||!file}>{running?(locale==='ar'?'جارٍ الرفع…':'Uploading…'):(locale==='ar'?'رفع الإصدار':'Upload version')}</Button></div>
  </form></SideSheet>;
}
