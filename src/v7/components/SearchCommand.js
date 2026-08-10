'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { api } from '../lib/api';
import { tx } from '../lib/i18n';
import { Skeleton } from './Primitives';
import { resolveEntityHref } from '../lib/navigation';

export default function SearchCommand({ open, onClose, companyId, locale }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const input = useRef(null);
  const router = useRouter();

  useEffect(() => { if (open) { setQuery(''); setRows([]); setTimeout(() => input.current?.focus(), 20); } }, [open]);
  useEffect(() => {
    if (!open || query.trim().length < 2) { setRows([]); setLoading(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.rpc('global_search', { p_company_id: companyId, p_query: query.trim(), p_limit: 16 }, { signal: controller.signal });
        setRows(Array.isArray(data) ? data : []);
      } catch (error) { if (error?.name !== 'AbortError') setRows([]); }
      finally { setLoading(false); }
    }, 240);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query, companyId]);

  if (!open) return null;
  const go = async (row) => {
    onClose();
    const href = await resolveEntityHref(row.entity_type, row.entity_id, {
      type: row.entity_type,
      project_id: row.project_id,
      site_id: row.site_id,
      folder_id: row.folder_id,
      document_id: row.entity_type === 'document' ? row.entity_id : null,
      task_id: row.entity_type === 'task' ? row.entity_id : null,
      drawing_id: row.entity_type === 'engineering_drawing' ? row.entity_id : null
    });
    router.push(href);
  };

  return <div className="v7-command-overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="v7-command-modal">
      <div className="v7-command-input"><Icon name="search" /><input ref={input} value={query} onChange={e => setQuery(e.target.value)} placeholder={tx(locale, 'commandHint')} onKeyDown={e => e.key === 'Escape' && onClose()} /><button onClick={onClose}><Icon name="close" size={16} /></button></div>
      <div className="v7-command-results">
        {loading ? <Skeleton lines={4} /> : rows.length ? rows.map(row => <button key={`${row.entity_type}:${row.entity_id}`} onClick={() => go(row)}><span className="v7-result-icon"><Icon name={row.entity_type === 'project' ? 'briefcase' : row.entity_type === 'site' ? 'map' : row.entity_type === 'document' || row.entity_type === 'folder' ? 'file' : row.entity_type === 'engineering_drawing' ? 'drafting' : 'check'} size={17} /></span><span><strong>{row.title}</strong><small>{row.subtitle || row.entity_type}</small></span><Icon name="chevron" size={15} /></button>) : <div className="v7-command-hint">{query.length < 2 ? tx(locale, 'commandHint') : tx(locale, 'noData')}</div>}
      </div>
    </div>
  </div>;
}
