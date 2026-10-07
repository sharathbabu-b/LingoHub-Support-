import { Link } from 'react-router-dom';
import { api, browserTz } from '../api';
import { useApp } from '../context';
import { useLive, money } from '../hooks';

export default function ClientDashboard() {
  const { user, langName } = useApp();
  const tz = browserTz();
  const stats = useLive(() => api('/tickets/stats'), 8000);
  const cov = useLive(() => api(`/client/coverage?tz=${encodeURIComponent(tz)}`), 15000);
  const bill = useLive(() => api('/client/billing'), 30000);
  const err = stats.error || cov.error || bill.error;
  const s = stats.data;
  const langs = cov.data ? cov.data.languages : [];

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <header className="page-head dashboard-head">
        <div>
          <p className="dashboard-eyebrow">CLIENT OVERVIEW</p>
          <h1 id="dashboard-title">{user.company || 'Your workspace'}</h1>
          <p className="muted">Live service activity and weekly coverage.</p>
        </div>
        <Link className="dashboard-action" to="/match">Find agents <span aria-hidden="true">+</span></Link>
      </header>
      {err && <div className="alert">{err}</div>}
      <div className="dashboard-stats">
        <article className="dashboard-metric metric-queued">
          <div className="metric-label">Queued tickets</div>
          <div className="metric-value">{s ? s.queued : '–'}</div>
          <p>Waiting for an agent to come on shift</p>
        </article>
        <article className="dashboard-metric metric-active">
          <div className="metric-label">With an agent</div>
          <div className="metric-value">{s ? s.assigned + s.in_progress : '–'}</div>
          <p>Assigned or being handled now</p>
        </article>
        <article className="dashboard-metric metric-sla">
          <div className="metric-label">SLA breached</div>
          <div className="metric-value">{s ? s.breached : '–'}</div>
          <p>{s ? `${s.atRisk || 0} currently at risk` : 'First-response deadlines'}</p>
        </article>
        <article className="dashboard-metric metric-cost">
          <div className="metric-label">Weekly cost</div>
          <div className="metric-value">{bill.data ? money(bill.data.weeklyTotal) : '–'}</div>
          <p>Based on your active coverage</p>
        </article>
      </div>

      <section className="dashboard-panel" aria-labelledby="coverage-title">
        <div className="dashboard-panel-head">
          <div>
            <p className="dashboard-eyebrow">SERVICE FOOTPRINT</p>
            <h2 id="coverage-title">Language coverage</h2>
          </div>
          <span className="coverage-count">{langs.length} {langs.length === 1 ? 'language' : 'languages'}</span>
        </div>
        {langs.length === 0 ? (
          <div className="coverage-empty">
            <div className="coverage-mark" aria-hidden="true"><span /><span /><span /></div>
            <div>
              <h3>Your coverage plan is waiting</h3>
              <p>No languages or hours are set up yet. Choose what your customers need and find agents to cover it.</p>
              <Link to="/match">Set up coverage <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Language</th>
                  <th>Hours required / week</th>
                  <th>Covered</th>
                </tr>
              </thead>
              <tbody>
                {langs.map((l) => (
                  <tr key={l.language}>
                    <td><strong>{langName(l.language)}</strong></td>
                    <td>{l.requiredHours || '—'}</td>
                    <td>
                      {l.coveragePct == null ? (
                        <span className="muted">No plan set</span>
                      ) : (
                        <div className="coverage-progress">
                          <div className="coverage-track">
                            <span className={l.coveragePct === 100 ? 'complete' : ''} style={{ width: `${l.coveragePct}%` }} />
                          </div>
                          <strong>{l.coveragePct}%</strong>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
