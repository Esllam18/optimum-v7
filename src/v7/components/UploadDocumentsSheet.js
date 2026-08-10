'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import { tx } from '../lib/i18n';
import Icon from './Icon';
import SideSheet from './SideSheet';
import { Badge, Button } from './Primitives';

const baseName = (filename) => String(filename || '').replace(/\.[^/.]+$/, '') || 'Document';
const splitTags = (value) => String(value || '').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 20);

export default function UploadDocumentsSheet({ open, onClose, workspace, locale, folderId, contextLabel, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [documentType, setDocumentType] = useState('general');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({});

  useEffect(() => {
    if (!open) {
      setFiles([]); setDocumentType('general'); setDescription(''); setTags(''); setRunning(false); setError(''); setProgress({});
    }
  }, [open]);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + Number(file.size || 0), 0), [files]);
  const setSelected = (event) => {
    const next = Array.from(event.target.files || []).filter(file => file.size > 0);
    setFiles(next);
    setProgress({});
    setError('');
  };

  const upload = async (event) => {
    event.preventDefault();
    if (running || !folderId || !files.length) return;
    setRunning(true); setError('');
    let success = 0;
    let failed = 0;
    const uploadedDocuments = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      let reservation = null;
      let objectUploaded = false;
      setProgress(current => ({ ...current, [index]: { status: 'reserving', percent: 0 } }));
      try {
        reservation = await api.rpc('begin_document_upload', {
          p_folder_id: folderId,
          p_display_name: baseName(file.name),
          p_original_filename: file.name,
          p_mime_type: file.type || 'application/octet-stream',
          p_size_bytes: file.size,
          p_document_type: documentType,
          p_description: description.trim() || null,
          p_tags: splitTags(tags),
          p_change_note: locale === 'ar' ? 'الإصدار الأول' : 'Initial version'
        });
        setProgress(current => ({ ...current, [index]: { status: 'uploading', percent: 1 } }));
        await api.uploadObject(reservation.storage_bucket, reservation.storage_path, file, {
          onProgress: percent => setProgress(current => ({ ...current, [index]: { status: percent >= 100 ? 'finalizing' : 'uploading', percent } }))
        });
        objectUploaded = true;
        await api.rpc('finalize_document_upload', { p_version_id: reservation.version_id, p_checksum_sha256: null });
        uploadedDocuments.push(reservation.document_id);
        setProgress(current => ({ ...current, [index]: { status: 'done', percent: 100 } }));
        success += 1;
      } catch (err) {
        if (objectUploaded && reservation?.storage_bucket && reservation?.storage_path) {
          try { await api.deleteObject(reservation.storage_bucket, reservation.storage_path); } catch {}
        }
        if (reservation?.version_id) {
          try { await api.rpc('abort_document_upload', { p_version_id: reservation.version_id }); } catch {}
        }
        setProgress(current => ({ ...current, [index]: { status: 'error', percent: 0, error: err.message || 'Upload failed' } }));
        failed += 1;
      }
    }

    api.clearReadCache();
    setRunning(false);
    if (success) await onUploaded?.({ success, failed, documentIds: uploadedDocuments });
    if (failed) setError(locale === 'ar' ? `تم رفع ${success} ملف، وفشل ${failed}. يمكنك تعديل الاختيار والمحاولة مرة أخرى للملفات الفاشلة.` : `${success} file(s) uploaded and ${failed} failed. You can adjust the selection and retry the failed files.`);
    else if (success) onClose?.();
  };

  return <SideSheet open={open} onClose={running ? undefined : onClose} eyebrow="CDE UPLOAD" title={locale === 'ar' ? 'رفع مستندات' : 'Upload documents'} subtitle={contextLabel || (locale === 'ar' ? 'يتم إنشاء مستند وإصدار غير قابل للاستبدال لكل ملف.' : 'Each file becomes a canonical document with an immutable first version.')}>
    <form className="v7-form-stack" onSubmit={upload}>
      <label className="v7-upload-drop"><input type="file" multiple onChange={setSelected} disabled={running} /><span className="v7-upload-drop-icon"><Icon name="upload" size={20} /></span><strong>{locale === 'ar' ? 'اختر ملفًا أو أكثر' : 'Choose one or more files'}</strong><small>{files.length ? `${files.length} · ${formatBytes(totalSize, locale)}` : (locale === 'ar' ? 'حتى 1 GB للملف الواحد وفق حدود النظام والباقة.' : 'Up to 1 GB per file, subject to system and plan limits.')}</small></label>
      <div className="v7-form-grid"><label><span>{locale === 'ar' ? 'نوع المستند' : 'Document type'}</span><select value={documentType} onChange={e => setDocumentType(e.target.value)} disabled={running}><option value="general">General</option><option value="drawing">Drawing</option><option value="photo">Photo</option><option value="contract">Contract</option><option value="report">Report</option><option value="handover">Handover</option><option value="quantity_survey">Quantity Survey</option></select></label><label><span>{locale === 'ar' ? 'وسوم' : 'Tags'}</span><input value={tags} onChange={e => setTags(e.target.value)} placeholder={locale === 'ar' ? 'as-built, fiber, approved' : 'as-built, fiber, approved'} disabled={running} /></label></div>
      <label><span>{locale === 'ar' ? 'وصف مشترك' : 'Shared description'}</span><textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} disabled={running} /></label>

      {files.length ? <div className="v7-upload-queue">{files.map((file, index) => {
        const state = progress[index] || { status: 'ready', percent: 0 };
        return <article key={`${file.name}:${file.size}:${index}`}><span className="v7-file-icon"><Icon name="file" size={15} /></span><span><strong>{file.name}</strong><small>{formatBytes(file.size, locale)}</small>{state.error ? <small className="is-error">{state.error}</small> : null}</span><div><Badge tone={state.status === 'done' ? 'success' : state.status === 'error' ? 'danger' : state.status === 'ready' ? 'neutral' : 'warning'}>{state.status}</Badge><div className="v7-upload-progress"><i style={{ width: `${state.percent || 0}%` }} /></div></div></article>;
      })}</div> : null}
      {error ? <div className="v7-form-error">{error}</div> : null}
      <div className="v7-form-actions"><Button type="button" onClick={onClose} disabled={running}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" variant="primary" icon="upload" disabled={running || !folderId || !files.length}>{running ? tx(locale, 'loading') : (locale === 'ar' ? `رفع ${files.length || ''}` : `Upload ${files.length || ''}`)}</Button></div>
    </form>
  </SideSheet>;
}
