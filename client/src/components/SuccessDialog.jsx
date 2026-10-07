import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function SuccessDialog({ title, message, actionLabel, actionTo, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="success-dialog" role="dialog" aria-modal="true" aria-labelledby="success-dialog-title" aria-describedby="success-dialog-message">
        <div className="success-dialog-mark" aria-hidden="true">✓</div>
        <p className="dashboard-eyebrow">SAVED</p>
        <h2 id="success-dialog-title">{title}</h2>
        <p id="success-dialog-message">{message}</p>
        <div className="success-dialog-actions">
          {actionTo && <Link className="button primary" to={actionTo} onClick={onClose}>{actionLabel}</Link>}
          <button type="button" onClick={onClose}>{actionTo ? 'Done' : 'Close'}</button>
        </div>
      </section>
    </div>
  );
}