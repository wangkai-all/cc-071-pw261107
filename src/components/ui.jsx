import { useEffect, useRef, useState } from 'react';

export function Card({ title, subtitle, actions, children, flush = false, className = '', id }) {
  return (
    <section className={`card ${flush ? 'card--flush' : ''} ${className}`} id={id}>
      {(title || actions) && (
        <div className="card-head" style={flush ? { padding: '0 20px' } : undefined}>
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusTag({ tone = 'neutral', children }) {
  const cls = tone === 'warn' ? 'status-tag--warn' : tone === 'bad' ? 'status-tag--bad' : tone === 'good' ? 'status-tag--good' : '';
  return <span className={`status-tag ${cls}`}>{children}</span>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          className="tab"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count != null && (
            <span className={`count ${tab.alert ? 'count--alert' : ''}`}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Drawer({ open, title, subtitle, onClose, actions, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement;
    ref.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="drawer-actions">
            {actions}
            <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="关闭">
              关闭 ✕
            </button>
          </div>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function useToast() {
  const [message, setMessage] = useState(null);
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(null), 2600);
    return () => clearTimeout(timer);
  }, [message]);
  const node = message ? (
    <div className="toast" role="status">
      {message}
    </div>
  ) : null;
  return [setMessage, node];
}

