import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, browserTz } from '../api';
import { useApp } from '../context';
import { useNotifications } from '../components/Notifications';
import { useLive, money, fmtTime } from '../hooks';
import ScheduleGrid from '../components/ScheduleGrid';

export default function Team() {
  const { langName } = useApp();
  const { notify } = useNotifications();
  const tz = browserTz();
  const team = useLive(() => api(`/client/engagements?tz=${encodeURIComponent(tz)}`), 0);
  const bill = useLive(() => api('/client/billing'), 0);
  const [err, setErr] = useState('');

  const end = async (e) => {
    if (!window.confirm(`End the engagement with ${e.agentName} (${langName(e.language)})? Their hours become available to others.`)) return;
    try {
      await api(`/client/engagements/${e.id}`, { method: 'DELETE' });
      team.reload();
      bill.reload();
      notify(`Engagement with ${e.agentName} ended.`);
    } catch (x) {
      setErr(x.message);
    }
  };

  const list = team.data || [];
  const b = bill.data;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>My team & billing</h1>
          <div className="muted">Shifts are shown in {tz}.</div>
        </div>
        <Link to="/match">
          <button>Add agents</button>
        </Link>
      </div>
      {(err || team.error || bill.error) && <div className="alert">{err || team.error || bill.error}</div>}

      {b && (
        <div className="grid g4" style={{ marginBottom: 16 }}>
          <div className="card stat">
            <div className="n">{money(b.weeklyTotal)}</div>
            <div className="l">Per week</div>
          </div>
          <div className="card stat">
            <div className="n">{money(b.monthlyEstimate)}</div>
            <div className="l">Per month (estimate)</div>
          </div>
          <div className="card stat">
            <div className="n">{b.lines.reduce((s, l) => s + l.weeklyHours, 0)}</div>
            <div className="l">Agent hours / week</div>
          </div>
          <div className="card stat">
            <div className="n">{b.platformFeePct}%</div>
            <div className="l">Platform fee (included in rates)</div>
          </div>
        </div>
      )}

      {team.data && list.length === 0 && (
        <div className="card empty">
          No agents yet. <Link to="/match">Find your first team</Link>.
        </div>
      )}
      <div className="grid g2">
        {list.map((e) => (
          <div className="card" key={e.id}>
            <div className="row spread">
              <div>
                <h3 style={{ marginBottom: 0 }}>{e.agentName}</h3>
                <div className="muted small-text">{e.headline}</div>
              </div>
              <span className="badge brand">{langName(e.language)}</span>
            </div>
            <div className="row" style={{ margin: '10px 0' }}>
              <span>{e.weeklyHours} h/week</span>
              <span>·</span>
              <span>{money(e.clientRate)}/h</span>
              <span>·</span>
              <b>{money(e.weeklyCost)}/week</b>
              <span>·</span>
              <span>{e.rating == null ? 'New' : `★ ${e.rating}`}</span>
            </div>
            <ScheduleGrid small readOnly value={e.grid} />
            <div className="row spread" style={{ marginTop: 8 }}>
              <span className="muted small-text">Since {fmtTime(e.since)}</span>
              <button className="danger" onClick={() => end(e)}>
                End engagement
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
