'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDate, normalizeArray, statusTone } from '../lib/format';
import Icon from './Icon';
import TaskAttachmentSheet from './TaskAttachmentSheet';
import { Badge, Button, EmptyState, Skeleton } from './Primitives';

export default function WorkTaskActions({ data, locale, onChanged }) {
  const task = data?.task || {};
  const capabilities = data?.capabilities || {};
  const [running, setRunning] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState(task.status || 'todo');
  const [progress, setProgress] = useState(String(task.progress ?? 0));
  const [blockedReason, setBlockedReason] = useState(task.blocked_reason || '');
  const [completionNote, setCompletionNote] = useState(task.completion_note || '');
  const [comment, setComment] = useState('');
  const [checklistBody, setChecklistBody] = useState('');
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [dependencySearch, setDependencySearch] = useState('');
  const [dependencyRows, setDependencyRows] = useState([]);
  const [dependencyLoading, setDependencyLoading] = useState(false);

  useEffect(() => {
    setStatus(task.status || 'todo');
    setProgress(String(task.progress ?? 0));
    setBlockedReason(task.blocked_reason || '');
    setCompletionNote(task.completion_note || '');
  }, [task.id, task.status, task.progress, task.blocked_reason, task.completion_note]);

  const labelStatus = value => ({
    todo: locale === 'ar' ? 'لم تبدأ' : 'To do',
    in_progress: locale === 'ar' ? 'قيد التنفيذ' : 'In progress',
    blocked: locale === 'ar' ? 'محجوبة' : 'Blocked',
    done: locale === 'ar' ? 'مكتملة' : 'Done',
    cancelled: locale === 'ar' ? 'ملغاة' : 'Cancelled'
  }[value] || value);

  const run = async (key, fn) => {
    if (running) return;
    setRunning(key); setError('');
    try {
      await fn();
      api.clearReadCache('work_');
      await onChanged?.();
    } catch (err) {
      setError(err.message || (locale === 'ar' ? 'تعذر تنفيذ العملية.' : 'The action could not be completed.'));
    } finally { setRunning(''); }
  };

  useEffect(() => {
    const term = dependencySearch.trim();
    if (!task.id || term.length < 2 || !capabilities.edit) { setDependencyRows([]); setDependencyLoading(false); return; }
    const c = new AbortController();
    const timer = setTimeout(() => {
      setDependencyLoading(true);
      api.rpc('work_task_query', {
        p_company_id: task.company_id,
        p_filters: { search: term, status: 'active', scope: 'all', project_id: task.project_id || 'all' },
        p_limit: 10,
        p_offset: 0
      }, { signal: c.signal, cacheTtlMs: 5_000, dedupe: true }).then(result => {
        const currentBlockers = new Set(normalizeArray(data.blockers).map(row => row.id));
        setDependencyRows(normalizeArray(result?.items).filter(row => row.id !== task.id && !currentBlockers.has(row.id)));
      }).catch(err => { if (err?.name !== 'AbortError') setError(err.message); })
        .finally(() => { if (!c.signal.aborted) setDependencyLoading(false); });
    }, 220);
    return () => { clearTimeout(timer); c.abort(); };
  }, [dependencySearch, task.id, task.company_id, task.project_id, capabilities.edit, data.blockers]);

  const applyStatus = () => run('status', () => api.rpc('set_task_status', {
    p_task_id: task.id,
    p_status: status,
    p_completion_note: status === 'done' ? completionNote.trim() || null : null,
    p_blocked_reason: status === 'blocked' ? blockedReason.trim() || null : null,
    p_progress: Number.isFinite(Number(progress)) ? Number(progress) : null
  }));

  const addComment = event => {
    event.preventDefault();
    if (!comment.trim()) return;
    run('comment', async () => {
      await api.rpc('add_task_comment', { p_task_id: task.id, p_body: comment.trim() });
      setComment('');
    });
  };

  const addChecklist = event => {
    event.preventDefault();
    if (!checklistBody.trim()) return;
    run('checklist-add', async () => {
      await api.rpc('add_task_checklist_item', { p_task_id: task.id, p_body: checklistBody.trim() });
      setChecklistBody('');
    });
  };

  const downloadAttachment = attachment => run(`attachment:${attachment.id}`, () => api.downloadObject(attachment.storage_bucket || 'task-attachments', attachment.storage_path, attachment.original_filename || 'attachment'));

  return <>
    {error ? <div className="v7-form-error">{error}</div> : null}
    <div className="v7-work360-tabs">
      <span><Icon name="activity" size={14} />{locale === 'ar' ? 'تنفيذ فعلي' : 'Live execution'}</span>
      {task.open_unassigned && capabilities.claim ? <Button variant="primary" icon="check" onClick={() => run('claim', () => api.rpc('claim_task', { p_task_id: task.id }))} disabled={Boolean(running)}>{locale === 'ar' ? 'استلام المهمة' : 'Claim work'}</Button> : null}
      {capabilities.attach ? <Button icon="upload" onClick={() => setAttachmentOpen(true)}>{locale === 'ar' ? 'إرفاق ملف' : 'Attach file'}</Button> : null}
    </div>

    {capabilities.complete ? <div className="v7-detail-section"><h3>{locale === 'ar' ? 'حالة التنفيذ' : 'Execution state'}</h3><div className="v7-form-grid"><label><span>{locale === 'ar' ? 'الحالة' : 'Status'}</span><select value={status} onChange={e => setStatus(e.target.value)}>{['todo','in_progress','blocked','done','cancelled'].map(value => <option key={value} value={value}>{labelStatus(value)}</option>)}</select></label><label><span>{locale === 'ar' ? 'التقدم %' : 'Progress %'}</span><input type="number" min="0" max="100" value={progress} onChange={e => setProgress(e.target.value)} /></label></div>{status === 'blocked' ? <label className="v7-inline-field"><span>{locale === 'ar' ? 'سبب الحجب' : 'Blocked reason'}</span><textarea rows={2} value={blockedReason} onChange={e => setBlockedReason(e.target.value)} /></label> : null}{status === 'done' ? <label className="v7-inline-field"><span>{locale === 'ar' ? 'ملاحظة الإكمال' : 'Completion note'}</span><textarea rows={2} value={completionNote} onChange={e => setCompletionNote(e.target.value)} /></label> : null}<div className="v7-form-actions"><Button variant="primary" icon="save" onClick={applyStatus} disabled={Boolean(running)}>{running === 'status' ? (locale === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale === 'ar' ? 'تحديث الحالة' : 'Update status')}</Button></div></div> : null}

    <div className="v7-detail-section"><div className="v7-section-heading"><h3>{locale === 'ar' ? 'قائمة التحقق' : 'Checklist'}</h3><Badge tone="neutral">{normalizeArray(data.checklist).filter(item => item.is_completed).length}/{normalizeArray(data.checklist).length}</Badge></div>{normalizeArray(data.checklist).length ? <div className="v7-checklist-live">{normalizeArray(data.checklist).map(item => <button key={item.id} className={item.is_completed ? 'is-done' : ''} disabled={!capabilities.complete || Boolean(running)} onClick={() => run(`check:${item.id}`, () => api.rpc('toggle_task_checklist_item', { p_item_id: item.id, p_completed: !item.is_completed }))}><span>{item.is_completed ? <Icon name="check" size={13} /> : null}</span><strong>{item.body}</strong></button>)}</div> : <EmptyState icon="check" title={locale === 'ar' ? 'لا توجد خطوات تحقق' : 'No checklist items'} />}{capabilities.edit ? <form className="v7-inline-form" onSubmit={addChecklist}><input value={checklistBody} onChange={e => setChecklistBody(e.target.value)} placeholder={locale === 'ar' ? 'أضف خطوة تحقق…' : 'Add checklist step…'} /><Button type="submit" icon="plus" disabled={!checklistBody.trim() || Boolean(running)}>{locale === 'ar' ? 'إضافة' : 'Add'}</Button></form> : null}</div>

    <div className="v7-detail-section"><h3>{locale === 'ar' ? 'الاعتماديات' : 'Dependencies'}</h3>{normalizeArray(data.blockers).length ? <div className="v7-linked-list">{normalizeArray(data.blockers).map(item => <article key={item.id}><Icon name="alert" size={15} /><span><strong>#{item.task_number} · {item.title}</strong><small>{labelStatus(item.status)}</small></span>{capabilities.edit ? <Button variant="danger" icon="close" onClick={() => run(`dep-remove:${item.dependency_id}`, () => api.rpc('delete_task_dependency', { p_dependency_id: item.dependency_id }))} disabled={Boolean(running)}>{locale === 'ar' ? 'فك' : 'Remove'}</Button> : null}</article>)}</div> : <p>{locale === 'ar' ? 'لا توجد معطلات مرئية.' : 'No visible blockers.'}</p>}{normalizeArray(data.downstream).length ? <div className="v7-work360-downstream"><small>{locale === 'ar' ? 'يعتمد عليها' : 'Downstream'}</small>{normalizeArray(data.downstream).map(item => <Badge key={item.id} tone={statusTone(item.status)}>#{item.task_number} · {item.title}</Badge>)}</div> : null}{capabilities.edit ? <><div className="v7-search-field"><Icon name="search" size={15} /><input value={dependencySearch} onChange={e => setDependencySearch(e.target.value)} placeholder={locale === 'ar' ? 'ابحث عن مهمة لإضافتها كمعطّل…' : 'Search work to add as a blocker…'} /></div>{dependencyLoading ? <Skeleton lines={2} /> : dependencyRows.length ? <div className="v7-linked-list">{dependencyRows.map(row => <article key={row.id}><Icon name="link" size={15} /><span><strong>#{row.task_number} · {row.title}</strong><small>{labelStatus(row.status)} · {row.project_name || ''}</small></span><Button icon="plus" onClick={() => run(`dep-add:${row.id}`, async () => { await api.rpc('save_task_dependency', { p_blocker_task_id: row.id, p_blocked_task_id: task.id }); setDependencySearch(''); setDependencyRows([]); })} disabled={Boolean(running)}>{locale === 'ar' ? 'ربط' : 'Link'}</Button></article>)}</div> : null}</> : null}</div>

    <div className="v7-detail-section"><div className="v7-section-heading"><h3>{locale === 'ar' ? 'المرفقات' : 'Attachments'}</h3>{capabilities.attach ? <Button icon="plus" onClick={() => setAttachmentOpen(true)}>{locale === 'ar' ? 'إرفاق' : 'Attach'}</Button> : null}</div>{normalizeArray(data.attachments).length ? <div className="v7-linked-list">{normalizeArray(data.attachments).map(item => <article key={item.id}><Icon name="file" size={15} /><span><strong>{item.original_filename}</strong><small>{formatDate(item.finalized_at || item.created_at, locale)}</small></span><Button icon="download" onClick={() => downloadAttachment(item)} disabled={Boolean(running)}>{locale === 'ar' ? 'تنزيل' : 'Download'}</Button></article>)}</div> : <EmptyState icon="file" title={locale === 'ar' ? 'لا توجد مرفقات' : 'No attachments'} />}</div>

    <div className="v7-detail-section"><h3>{locale === 'ar' ? 'المحادثة' : 'Conversation'}</h3>{normalizeArray(data.comments).length ? <div className="v7-conversation-list">{normalizeArray(data.comments).slice().reverse().map(item => <article key={item.id}><span className="v7-avatar-mini">{String(item.author_name || 'M').trim().charAt(0).toUpperCase()}</span><div><strong>{item.author_name || (locale === 'ar' ? 'عضو' : 'Member')}</strong><p>{item.body}</p><small>{formatDate(item.created_at, locale)}</small></div></article>)}</div> : <p>{locale === 'ar' ? 'لا توجد تعليقات بعد.' : 'No comments yet.'}</p>}{capabilities.comment ? <form className="v7-inline-form" onSubmit={addComment}><input value={comment} onChange={e => setComment(e.target.value)} placeholder={locale === 'ar' ? 'اكتب تعليقًا…' : 'Write a comment…'} /><Button type="submit" variant="primary" icon="plus" disabled={!comment.trim() || Boolean(running)}>{locale === 'ar' ? 'إرسال' : 'Send'}</Button></form> : null}</div>

    <div className="v7-detail-section"><h3>{locale === 'ar' ? 'الخط الزمني' : 'Timeline'}</h3>{normalizeArray(data.events).length ? <div className="v7-timeline-list">{normalizeArray(data.events).map(item => <article key={item.id}><span><Icon name="activity" size={14} /></span><div><strong>{item.event_type}</strong><small>{item.actor_name || (locale === 'ar' ? 'النظام' : 'System')} · {formatDate(item.created_at, locale)}</small></div></article>)}</div> : <p>{locale === 'ar' ? 'لم يتم تسجيل نشاط بعد.' : 'No activity has been recorded yet.'}</p>}</div>

    <TaskAttachmentSheet open={attachmentOpen} onClose={() => setAttachmentOpen(false)} taskId={task.id} locale={locale} onUploaded={onChanged} />
  </>;
}
