import { useState } from 'react';
import { api } from '../api';
import { useApp } from '../context';
import { useNotifications } from '../components/Notifications';
import { useLive, money, fmtTime } from '../hooks';

export default function AgentEngagements() {
  const { langName } = useApp();
  const { notify } = useNotifications();
  const eng = useLive(() => api('/agent/engagements'), 15000);
  const stats = useLive(() => api('/agent/stats'), 8000);
  const invites = useLive(() => api('/agent/invitations'), 15000);
  const [responding, setResponding] = useState('');
  const [responseError, setResponseError] = useState('');
  const list = eng.data || [];
  const invitationList = invites.data || [];
  const weekly = list.reduce((s, e) => s + e.weeklyEarnings, 0);
  const hrs = list.reduce((s, e) => s + e.weeklyHours, 0);

  const respond = async (id, action) => {
    setResponding(id);
    setResponseError('');
    try {
      await api(`/agent/invitations/${id}/${action}`, { method: 'POST' });
      await Promise.all([invites.reload(), eng.reload()]);
      notify(action === 'accept' ? 'Invitation accepted. The scheduled hours are now committed.' : 'Invitation declined.');
    } catch (e) {
      setResponseError(e.message);
    } finally {
      setResponding('');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients & earnings</h1>
          <div className="muted">Clients who have hired you, and what you earn from them.</div>
        </div>
      </div>
      {(eng.error || stats.error || invites.error || responseError) && <div className="alert">{responseError || eng.error || stats.error || invites.error}</div>}
      <section className="agent-invitations" aria-labelledby="invitations-title">
        <div className="dashboard-panel-head">
          <div><p className="dashboard-eyebrow">SUPPORT HUBS</p><h2 id="invitations-title">Invitations</h2></div>
          <span className="coverage-count">{invitationList.filter((invite) => invite.status === 'pending').length} pending</span>
        </div>
        {invites.data && invitationList.length === 0 ? <p className="agent-invitations-empty">No invitations yet. Complete your profile and availability so companies can find a match.</p> : (
          <div className="agent-invitation-list">
            {invitationList.map((invite) => <article className="agent-invitation" key={invite.id}>
              <div className="agent-invitation-main">
                <div className="agent-invitation-title"><h3>{invite.hubName}</h3><span className={`badge ${invite.status === 'accepted' ? 'ok' : invite.status === 'pending' ? 'warn' : ''}`}>{invite.status}</span></div>
                <p>{invite.company} · {langName(invite.language)} · {invite.tier === 'tier1' ? 'Tier 1' : 'Tier 2'}</p>
                <div className="hub-tags"><span>{invite.weeklyHours} hours / week</span><span>{money(invite.hourlyRate)} / hour</span><span>{Math.round((invite.matchScore || 0) * 100)}% match</span><span>Expires {fmtTime(invite.expiresAt)}</span></div>
                {invite.scoreBreakdown && <details className="match-explanation"><summary>How the match was scored</summary><div className="score-factors">{Object.entries({ language: 'Language', availability: 'Availability', skills: 'Skills', experience: 'Experience', timezone: 'Timezone' }).map(([factor, label]) => <div key={factor}><span>{label}</span><strong>{invite.scoreBreakdown[factor] ?? 0}%</strong><i><b style={{ width: `${invite.scoreBreakdown[factor] ?? 0}%` }} /></i></div>)}</div></details>}
              </div>
              {invite.status === 'pending' && <div className="agent-invitation-actions"><button className="primary" disabled={responding === invite.id} onClick={() => respond(invite.id, 'accept')}>{responding === invite.id ? 'Saving…' : 'Accept'}</button><button disabled={responding === invite.id} onClick={() => respond(invite.id, 'reject')}>Decline</button></div>}
            </article>)}
          </div>
        )}
      </section>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="n">{money(weekly)}</div>
          <div className="l">Weekly earnings</div>
        </div>
        <div className="card stat">
          <div className="n">{hrs}</div>
          <div className="l">Committed hours / week</div>
        </div>
        <div className="card stat">
          <div className="n">{stats.data ? stats.data.open : '–'}</div>
          <div className="l">Open tickets</div>
        </div>
        <div className="card stat">
          <div className="n">{stats.data ? stats.data.resolved : '–'}</div>
          <div className="l">Resolved</div>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        {list.length === 0 ? (
          <div className="empty">No clients yet. Make sure your profile is complete and your availability is set. Verified agents appear in client searches.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Language</th>
                <th>Hours/week</th>
                <th>Rate</th>
                <th>Weekly earnings</th>
                <th>Since</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td>{e.company}</td>
                  <td>{langName(e.language)}</td>
                  <td>{e.weeklyHours}</td>
                  <td>{money(e.hourlyRate)}/h</td>
                  <td>{money(e.weeklyEarnings)}</td>
                  <td>{fmtTime(e.since)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
