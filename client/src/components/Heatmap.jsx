import { DAYS } from './ScheduleGrid';

/**
 * Coverage heatmap. cells: [{day,hour,count}] (agents on shift). required: [{day,hour}] hours the client needs.
 * Needed but uncovered -> red. Covered -> green, deeper with more agents. Not needed & empty -> neutral.
 */
export default function Heatmap({ cells, required = [] }) {
  const need = new Set(required.map((c) => c.day * 24 + c.hour));
  const by = new Map(cells.map((c) => [c.day * 24 + c.hour, c.count]));
  const max = Math.max(1, ...cells.map((c) => c.count));
  return (
    <div className="sched small ro">
      <div className="sched-head">
        <span />
        {DAYS.map((d) => (
          <span key={d} className="sched-day static">
            {d}
          </span>
        ))}
      </div>
      {Array.from({ length: 24 }, (_, h) => (
        <div className="sched-row" key={h}>
          <span className="sched-hour">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>
          {DAYS.map((_, d) => {
            const k = d * 24 + h;
            const count = by.get(k) || 0;
            const needed = need.has(k);
            let cls = 'sched-cell';
            let style;
            if (count > 0) {
              cls += ' on heat';
              style = { opacity: 0.35 + 0.65 * (count / max) };
            } else if (needed) cls += ' gap';
            return (
              <div key={d} className={cls} style={style} title={`${DAYS[d]} ${String(h).padStart(2, '0')}:00 – ${count} agent${count === 1 ? '' : 's'}${needed && !count ? ' (GAP)' : ''}`} />
            );
          })}
        </div>
      ))}
    </div>
  );
}
