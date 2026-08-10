'use client';

import { useEffect } from 'react';
import Icon from './Icon';

export default function SideSheet({ open, onClose, eyebrow, title, subtitle, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return <div className="v7-sheet-layer" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
    <aside className="v7-sheet">
      <header className="v7-sheet-head">
        <div>{eyebrow ? <span className="v7-eyebrow">{eyebrow}</span> : null}<h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        <button className="v7-icon-button" onClick={onClose} aria-label="Close"><Icon name="close" size={17} /></button>
      </header>
      <div className="v7-sheet-body">{children}</div>
      {footer ? <footer className="v7-sheet-foot">{footer}</footer> : null}
    </aside>
  </div>;
}
