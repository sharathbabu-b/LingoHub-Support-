import { useState } from 'react';
import { api } from '../api';
import { useApp } from '../context';
import { useLive, money, fmtTime } from '../hooks';

export default function Admin() {
  const { langName, levelLabel } = useApp();
  const stats = useLive(() => api('/admin/stats'), 10000);
  const agents = useLive(() => api('/admin/agents'), 0);
  const [err, setErr] = useState('');
  const s = stats.data;

  const setVerified = async (a, verified) => {
    setErr('');
    try {
      await api(`/admin/agents/${a.id}/verify`, { method: 'POST', body: { verified } });
      agents.reload();
      stats.reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  const list = agents.data || [];
  const pending = list.filter((a) => !a.verified);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <div className="muted">Verify agents and watch platform health.</div>
        </div>
      </div>
      {(err || stats.error || agents.error) && <div className="alert">{err || stats.error || agents.error}</div>}
      {s && (
        <div className="grid g4" style={{ marginBottom: 16 }}>
          <div className="card stat">
            <div className="n">{s.clients}</div>
            <div className="l">Clients</div>
          </div>
          <div className="card stat">
            <div className="n">
              {s.verifiedAgents}/{s.agents}
            </div>
            <div className="l">Agents verified</div>
          </div>
          <div className="card stat">
            <div className="n">{s.activeEngagements}</div>
            <div className="l">Active engagements</div>
          </div>
          <div className="card stat">
            <div className="n">{money(s.weeklyPlatformRevenue)}</div>
            <div className="l">Platform revenue / week</div>
          </div>
          <div className="card stat">
            <div className="n">{s.tickets.queued}</div>
            <div className="l">Queued tickets</div>
          </div>
          <div className="card stat">
            <div className="n">{s.tickets.resolved}</div>
            <div className="l">Resolved tickets</div>
          </div>
          <div className="card stat">
            <div className="n">{s.avgFirstResponseMin == null ? '—' : `${s.avgFirstResponseMin} min`}</div>
            <div className="l">Avg first response</div>
          </div>
          <div className="card stat">
            <div className="n">{s.slaAttainmentPct == null ? '—' : `${s.slaAttainmentPct}%`}</div>
            <div className="l">SLA attainment</div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div style={{ padding: '14px 16px 0' }}>
          <h2>
            Agents {pending.length > 0 && <span className="badge warn">{pending.length} pending</span>}
          </h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Languages</th>
              <th>Rate</th>
              <th>Hours/wk</th>
              <th>Joined</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td>
                  <b>{a.name}</b>
                  <div className="muted small-text">
                    {a.email} · {a.timezone}
                  </div>
                  {a.headline && <div className="small-text">{a.headline}</div>}
                </td>
                <td>
                  {a.languages.length === 0 ? (
                    <span className="muted">none yet</span>
                  ) : (
                    a.languages.map((l) => (
                      <div key={l.code} className="small-text">
                        {langName(l.code)} <span className="muted">({levelLabel(l.level)})</span>
                      </div>
                    ))
                  )}
                </td>
                <td>{money(a.hourlyRate)}</td>
                <td>{a.weeklyHours}</td>
                <td>{fmtTime(a.joined)}</td>
                <td>
                  {a.verified ? (
                    <div className="row">
                      <span className="badge ok">Verified</span>
                      <button className="link" onClick={() => setVerified(a, false)}>
                        Revoke
                      </button>
                    </div>
                  ) : (
                    <button className="primary" disabled={a.languages.length === 0 || a.weeklyHours === 0} title={a.languages.length === 0 || a.weeklyHours === 0 ? 'Agent must add languages and availability first' : ''} onClick={() => setVerified(a, true)}>
                      Verify
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
