import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, browserTz } from '../api';
import { useApp } from '../context';
import { useLive } from '../hooks';
import Heatmap from '../components/Heatmap';

export default function Coverage() {
  const { meta, langName } = useApp();
  const [tz, setTz] = useState(browserTz());
  const { data, error } = useLive(() => api(`/client/coverage?tz=${encodeURIComponent(tz)}`), 20000, [tz]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Coverage</h1>
          <div className="muted">Agents on shift for every hour of the week, per language. Red = hours you need that nobody covers.</div>
        </div>
        <select value={tz} onChange={(e) => setTz(e.target.value)} style={{ width: 'auto' }} aria-label="Timezone">
          {meta.timezones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
      </div>
      {error && <div className="alert">{error}</div>}
      {data && data.languages.length === 0 && (
        <div className="card empty">
          Nothing to show yet. <Link to="/match">Set up your languages and hours</Link>.
        </div>
      )}
      <div className="grid g2">
        {data &&
          data.languages.map((l) => {
            const gapCount = l.required.length ? l.required.filter((c) => !l.heat.find((h) => h.day === c.day && h.hour === c.hour && h.count > 0)).length : 0;
            return (
              <div className="card" key={l.language}>
                <div className="row spread">
                  <h3 style={{ margin: 0 }}>{langName(l.language)}</h3>
                  {l.coveragePct == null ? <span className="badge">No plan</span> : <span className={`badge ${gapCount === 0 ? 'ok' : 'bad'}`}>{gapCount === 0 ? 'Fully covered' : `${gapCount}h gap/week`}</span>}
                </div>
                <div style={{ marginTop: 10 }}>
                  <Heatmap cells={l.heat} required={l.required} />
                </div>
                <div className="legend">
                  <span>
                    <i style={{ background: 'var(--brand)' }} />
                    Covered (darker = more agents)
                  </span>
                  <span>
                    <i style={{ background: 'var(--danger-soft)', borderColor: 'var(--danger)' }} />
                    Gap
                  </span>
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}
