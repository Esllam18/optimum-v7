'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import SideSheet from './SideSheet';
import Icon from './Icon';
import { Badge, Button } from './Primitives';

export default function TaskAttachmentSheet({ open, onClose, taskId, locale, onUploaded }) {
  const [file, setFile] = useState(null);
  const [running, setRunning] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) { setFile(null); setRunning(false); setPercent(0); setError(''); }
  }, [open]);

  const submit = async event => {
    event.preventDefault();
    if (!file || !taskId || running) return;
    setRunning(true); setError(''); setPercent(0);
    let reservation = null;
    let objectUploaded = false;
    try {
      reservation = await api.rpc('begin_task_attachment_upload', {
        p_task_id: taskId,
        p_original_filename: file.name,
        p_mime_type: file.type || 'application/octet-stream',
        p_size_bytes: file.size,
        p_comment_id: null
      });
      await api.uploadObject(reservation.storage_bucket, reservation.storage_path, file, { onProgress: setPercent });
      objectUploaded = true;
      await api.rpc('finalize_task_attachment_upload', { p_attachment_id: reservation.attachment_id });
      api.clearReadCache('work_');
      await onUploaded?.();
      onClose?.();
    } catch (err) {
      if (objectUploaded && reservation?.storage_bucket && reservation?.storage_path) {
        try { await api.deleteObject(reservation.storage_bucket, reservation.storage_path); } catch {}
      }
      if (reservation?.attachment_id) {
        try { await api.rpc('abort_task_attachment_upload', { p_attachment_id: reservation.attachment_id }); } catch {}
      }
      setError(err.message || (locale === 'ar' ? 'تعذر إرفاق الملف.' : 'Could not attach the file.'));
    } finally { setRunning(false); }
  };

  return <SideSheet open={open} onClose={running ? undefined : onClose} eyebrow="WORK FILE" title={locale === 'ar' ? 'إرفاق ملف بالمهمة' : 'Attach a file to work'} subtitle={locale === 'ar' ? 'المرفق يظل جزءًا من سجل المهمة ولا يستبدل أي مستند رسمي داخل CDE.' : 'The attachment stays with the work record and never replaces a controlled CDE document.'}>
    <form className="v7-form-stack" onSubmit={submit}>
      <label className="v7-upload-drop"><input type="file" onChange={event => { setFile(event.target.files?.[0] || null); setPercent(0); setError(''); }} disabled={running} /><span className="v7-upload-drop-icon"><Icon name="upload" size={20} /></span><strong>{locale === 'ar' ? 'اختر ملفًا' : 'Choose a file'}</strong><small>{file ? `${file.name} · ${formatBytes(file.size, locale)}` : (locale === 'ar' ? 'حتى 100 MB للمرفق الواحد.' : 'Up to 100 MB per attachment.')}</small></label>
      {file ? <div className="v7-upload-queue"><article><span className="v7-file-icon"><Icon name="file" size={15} /></span><span><strong>{file.name}</strong><small>{formatBytes(file.size, locale)}</small></span><div><Badge tone={running ? 'warning' : 'neutral'}>{running ? (locale === 'ar' ? 'جارٍ الرفع' : 'Uploading') : (locale === 'ar' ? 'جاهز' : 'Ready')}</Badge><div className="v7-upload-progress"><i style={{ width: `${percent}%` }} /></div></div></article></div> : null}
      {error ? <div className="v7-form-error">{error}</div> : null}
      <div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={running}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant="primary" icon="upload" disabled={!file || running}>{running ? (locale === 'ar' ? 'جارٍ الرفع…' : 'Uploading…') : (locale === 'ar' ? 'إرفاق' : 'Attach')}</Button></div>
    </form>
  </SideSheet>;
}
