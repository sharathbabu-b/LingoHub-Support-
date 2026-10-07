import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const NotificationsContext = createContext(null);
let nextToastId = 0;

export function useNotifications() {
  const notifications = useContext(NotificationsContext);
  if (!notifications) throw new Error('useNotifications must be used inside NotificationsProvider');
  return notifications;
}

export function NotificationsProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message, type = 'success', duration = 4800) => {
    const id = ++nextToastId;
    setToasts((current) => [...current, { id, message, type }].slice(-4));
    window.setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-label="Notifications" aria-live="polite" aria-relevant="additions text">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'} key={toast.id}>
            <span className="toast-mark" aria-hidden="true">{toast.type === 'success' ? '✓' : toast.type === 'error' ? '!' : 'i'}</span>
            <span className="toast-message">{toast.message}</span>
            <button type="button" className="toast-dismiss" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">×</button>
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  );
}