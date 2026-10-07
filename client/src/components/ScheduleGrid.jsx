import { useRef, useState, useEffect } from 'react';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const key = (d, h) => d * 24 + h;

export const presets = {
  clear: () => [],
  all: () => Array.from({ length: 168 }, (_, i) => ({ day: Math.floor(i / 24), hour: i % 24 })),
  business: () => {
    const g = [];
    for (let d = 0; d < 5; d++) for (let h = 9; h < 17; h++) g.push({ day: d, hour: h });
    return g;
  },
  weekdays24: () => {
    const g = [];
    for (let d = 0; d < 5; d++) for (let h = 0; h < 24; h++) g.push({ day: d, hour: h });
    return g;
  },
};

/**
 * Weekly 7x24 grid in the viewer's chosen timezone.
 * value: [{day,hour}]; onChange(newValue). Click or drag to paint; the first cell touched decides add/remove.
 * locked: [{day,hour}] cells that cannot be removed (already committed to a client).
 */
export default function ScheduleGrid({ value, onChange, locked = [], readOnly = false, tone = 'accent', small = false }) {
  const set = new Set(value.map((c) => key(c.day, c.hour)));
  const lock = new Set(locked.map((c) => key(c.day, c.hour)));
  const painting = useRef(null); // 'add' | 'remove' | null
  const [, force] = useState(0);

  useEffect(() => {
    const up = () => {
      painting.current = null;
      force((n) => n + 1);
    };
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, []);

  const apply = (d, h, mode) => {
    const k = key(d, h);
    const next = new Set(set);
    if (mode === 'add') next.add(k);
    else if (!lock.has(k)) next.delete(k);
    else return;
    if (next.size === set.size && next.has(k) === set.has(k)) return;
    onChange([...next].sort((a, b) => a - b).map((n) => ({ day: Math.floor(n / 24), hour: n % 24 })));
  };

  const start = (d, h) => {
    if (readOnly) return;
    const mode = set.has(key(d, h)) ? 'remove' : 'add';
    painting.current = mode;
    apply(d, h, mode);
  };
  const enter = (d, h) => {
    if (!readOnly && painting.current) apply(d, h, painting.current);
  };

  const toggleDay = (d) => {
    if (readOnly) return;
    const full = Array.from({ length: 24 }, (_, h) => set.has(key(d, h))).every(Boolean);
    const next = new Set(set);
    for (let h = 0; h < 24; h++) {
      if (full) {
        if (!lock.has(key(d, h))) next.delete(key(d, h));
      } else next.add(key(d, h));
    }
    onChange([...next].sort((a, b) => a - b).map((n) => ({ day: Math.floor(n / 24), hour: n % 24 })));
  };

  return (
    <div className={`sched ${small ? 'small' : ''} ${readOnly ? 'ro' : ''}`} onMouseLeave={() => (painting.current = null)}>
      <div className="sched-head">
        <span />
        {DAYS.map((d, i) => (
          <button type="button" key={d} className="sched-day" onClick={() => toggleDay(i)} disabled={readOnly} title={readOnly ? '' : 'Toggle whole day'}>
            {d}
          </button>
        ))}
      </div>
      {Array.from({ length: 24 }, (_, h) => (
        <div className="sched-row" key={h}>
          <span className="sched-hour">{small ? (h % 6 === 0 ? String(h).padStart(2, '0') : '') : String(h).padStart(2, '0')}</span>
          {DAYS.map((_, d) => {
            const on = set.has(key(d, h));
            const isLocked = lock.has(key(d, h));
            return (
              <div
                key={d}
                className={`sched-cell ${on ? `on ${tone}` : ''} ${isLocked ? 'locked' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  start(d, h);
                }}
                onMouseEnter={() => enter(d, h)}
                onTouchStart={() => start(d, h)}
                title={`${DAYS[d]} ${String(h).padStart(2, '0')}:00${isLocked ? ' (committed to a client)' : ''}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
