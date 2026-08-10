'use client';

import Icon from './Icon';

export function Button({ children, variant = 'secondary', icon, className = '', type = 'button', ...props }) {
  return <button type={type} className={`v7-button v7-button--${variant} ${className}`} {...props}>{icon ? <Icon name={icon} size={16} /> : null}<span>{children}</span></button>;
}

export function PageHeader({ eyebrow, title, description, actions, children }) {
  return <header className="v7-page-header">
    <div className="v7-page-heading">
      {eyebrow ? <span className="v7-eyebrow">{eyebrow}</span> : null}
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
    {actions ? <div className="v7-page-actions">{actions}</div> : null}
  </header>;
}

export function Panel({ title, description, action, children, className = '' }) {
  return <section className={`v7-panel ${className}`}>
    {(title || action) ? <header className="v7-panel-header"><div>{title ? <h2>{title}</h2> : null}{description ? <p>{description}</p> : null}</div>{action}</header> : null}
    {children}
  </section>;
}

export function Stat({ label, value, note, icon, tone = 'neutral' }) {
  return <article className={`v7-stat v7-stat--${tone}`}>
    <span className="v7-stat-icon"><Icon name={icon || 'trend'} size={18} /></span>
    <div><strong>{value ?? '—'}</strong><span>{label}</span>{note ? <small>{note}</small> : null}</div>
  </article>;
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`v7-badge v7-badge--${tone}`}>{children}</span>;
}

export function Skeleton({ lines = 4, className = '' }) {
  return <div className={`v7-skeleton ${className}`}>{Array.from({ length: lines }).map((_, i) => <span key={i} style={{ width: `${Math.max(38, 100 - i * 13)}%` }} />)}</div>;
}

export function EmptyState({ icon = 'layers', title, description, action }) {
  return <div className="v7-empty"><span className="v7-empty-icon"><Icon name={icon} size={22} /></span><strong>{title}</strong>{description ? <p>{description}</p> : null}{action}</div>;
}

export function ErrorState({ title, description, onRetry, retryLabel = 'Retry' }) {
  return <div className="v7-empty v7-empty--error"><span className="v7-empty-icon"><Icon name="alert" size={22} /></span><strong>{title}</strong><p>{description}</p>{onRetry ? <Button onClick={onRetry} icon="refresh">{retryLabel}</Button> : null}</div>;
}
