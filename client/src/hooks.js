import { useCallback, useEffect, useRef, useState } from 'react';

// Fetches on mount and then every `ms` (pauses while the tab is hidden). This is what makes dashboards "live".
export function useLive(fn, ms = 8000, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    if (!ms) return undefined;
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ms, ...deps]);

  return { data, error, reload: load, setData };
}

export const money = (n) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtTime = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export function relative(d, now = Date.now()) {
  const diff = new Date(d).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  const txt = m < 1 ? 'under a minute' : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d`;
  return diff >= 0 ? `in ${txt}` : `${txt} ago`;
}
