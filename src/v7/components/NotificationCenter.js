'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { resolveEntityHref } from '../lib/navigation';
import { formatDate } from '../lib/format';
import Icon from './Icon';
import SideSheet from './SideSheet';
import { Button, EmptyState, ErrorState, Skeleton } from './Primitives';

export default function NotificationCenter({ open, onClose, workspace, locale }) {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(false);

  const load = async (signal) => {
    setError(null);
    const result = await api.select('notifications', {
      filters: { company_id: `eq.${workspace.company.id}`, user_id: `eq.${workspace.user.id}` },
      order: 'created_at.desc', limit: 40, cacheTtlMs: 5_000, signal
    });
    setRows(result);
  };

  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    setRows(null);
    load(c.signal).catch(err => { if (err?.name !== 'AbortError') setError(err); });
    return () => c.abort();
  }, [open, workspace.company.id, workspace.user.id]);

  const openNotification = async (item) => {
    try {
      if (!item.read_at) {
        await api.update('notifications', { read_at: new Date().toISOString() }, { filters: { id: `eq.${item.id}`, user_id: `eq.${workspace.user.id}` } });
        setRows(current => (current || []).map(row => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
      }
      if (item.entity_type && item.entity_id) {
        const href = await resolveEntityHref(item.entity_type, item.entity_id);
        onClose();
        router.push(href);
      }
    } catch (err) { setError(err); }
  };

  const markAll = async () => {
    setWorking(true); setError(null);
    try {
      await api.rpc('mark_all_notifications_read', { p_company_id: workspace.company.id });
      const now = new Date().toISOString();
      setRows(current => (current || []).map(row => ({ ...row, read_at: row.read_at || now })));
    } catch (err) { setError(err); }
    finally { setWorking(false); }
  };

  const unread = (rows || []).filter(row => !row.read_at).length;
  return <SideSheet open={open} onClose={onClose} eyebrow="ACTIVITY · NOTIFICATIONS" title={locale === 'ar' ? 'الإشعارات' : 'Notifications'} subtitle={locale === 'ar' ? 'كل إشعار يعيدك إلى العنصر الحقيقي داخل سياقه.' : 'Every notification returns you to the actual entity in its workspace context.'}>
    {error ? <ErrorState title={locale === 'ar' ? 'تعذر تحميل الإشعارات' : 'Could not load notifications'} description={error.message} /> : null}
    <div className="v7-notification-toolbar"><span>{rows ? `${unread} ${locale === 'ar' ? 'غير مقروء' : 'unread'}` : '—'}</span>{rows?.length ? <Button icon="check" disabled={working || unread === 0} onClick={markAll}>{locale === 'ar' ? 'تحديد الكل كمقروء' : 'Mark all read'}</Button> : null}</div>
    {!rows ? <Skeleton lines={9} /> : rows.length ? <div className="v7-notification-list">{rows.map(item => <button key={item.id} className={!item.read_at ? 'is-unread' : ''} onClick={() => openNotification(item)} disabled={!item.entity_id}><span className="v7-result-icon"><Icon name={!item.read_at ? 'bell' : 'check'} size={16} /></span><span><strong>{locale === 'ar' ? item.title_ar : item.title_en}</strong><small>{locale === 'ar' ? item.body_ar : item.body_en}</small><em>{formatDate(item.created_at, locale)} · {item.entity_type || item.type}</em></span>{item.entity_id ? <Icon name="chevron" size={14} /> : null}</button>)}</div> : <EmptyState icon="bell" title={locale === 'ar' ? 'لا توجد إشعارات' : 'No notifications'} />}
  </SideSheet>;
}
