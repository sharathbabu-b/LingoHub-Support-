import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context';
import { useNotifications } from '../components/Notifications';
import { money } from '../hooks';
import ScheduleGrid from '../components/ScheduleGrid';

export default function Match() {
  const { langName, levelLabel } = useApp();
  const { notify } = useNotifications();
  const [searchParams] = useSearchParams();
  const hubId = searchParams.get('hub');
  const [hubList, setHubList] = useState(null);
  const [results, setResults] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [hub, setHub] = useState(null);
  const [invitations, setInvitations] = useState([]);

  const loadInvitations = async () => {
    if (!hubId) return;
    setInvitations(await api(`/client/hubs/${hubId}/invitations`));
  };

  useEffect(() => {
    setHub(null);
    setHubList(null);
    setResults(null);
    setInvitations([]);
    setErr('');
    const load = async () => {
      if (hubId) {
        const saved = await api(`/hubs/${hubId}`);
        setHub(saved);
        await loadInvitations();
      } else {
        setHubList(await api('/hubs'));
      }
    };
    load()
      .catch((e) => setErr(e.message));
  }, [hubId]);

  const run = async (fn) => {
    setErr('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const find = () =>
    run(async () => {
      if (!hubId) throw new Error('Select a Support Hub before matching');
      setResults((await api(`/client/hubs/${hubId}/match`, { method: 'POST' })).results);
      await loadInvitations();
      notify('Match results updated. Scores are deterministic; review each factor before inviting.');
    });
  const invite = (results, label) =>
    run(async () => {
      for (const result of results) {
        for (const agent of result.team) {
          await api(`/client/hubs/${hubId}/invitations`, {
            method: 'POST',
            body: { agentId: agent.agentId, language: result.language, slots: agent.assignedSlots },
          });
        }
      }
      await loadInvitations();
      notify(`${label} invited. Invitations expire after seven days and agents must accept before joining your team.`);
    });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{hub ? `Match for ${hub.name}` : 'Find agents'}</h1>
          <div className="muted">{hub ? 'Verified candidates are ranked against this Hub. Invite agents to join; they must accept before shifts are committed.' : 'Pick languages and hours to explore agent matches. Create a Support Hub to add skills, channels and agent invitations.'}</div>
        </div>
      </div>
      {err && <div className="alert">{err}</div>}

      {hubId && hub && (
        <section className="hub-match-brief" aria-label="Support Hub requirements">
          <div><span>LANGUAGES</span><strong>{hub.languages.map((language) => `${langName(language.code)} · ${levelLabel(language.minLevel)}`).join(' / ')}</strong></div>
          <div><span>SCHEDULE</span><strong>{hub.grid.length} hours / week · {hub.timezone}{hub.requires24x7 ? ' · 24/7 requested' : ''}</strong></div>
          <div><span>SKILLS & CHANNELS</span><strong>{hub.requiredSkills.length} required skills · {hub.channels.join(', ')}</strong></div>
        </section>
      )}

      {!hubId && (
        <section className="hub-picker" aria-labelledby="hub-picker-title">
          <p className="dashboard-eyebrow">START WITH A REQUIREMENT</p>
          <h2 id="hub-picker-title">Choose a Support Hub</h2>
          <p>Matching and invitations use the languages, skills, channels, and schedule saved in a Hub.</p>
          {hubList === null ? <div className="muted small-text">Loading Support Hubs…</div> : hubList.length === 0 ? <Link className="hub-match-link" to="/hubs">Create your first Support Hub <span aria-hidden="true">→</span></Link> : (
            <div className="hub-picker-list">{hubList.map((item) => <Link className="hub-picker-item" to={`/match?hub=${item.id}`} key={item.id}><span><strong>{item.name}</strong><small>{item.languages.map((language) => langName(language.code)).join(', ') || 'No languages'} · {item.grid.length} hours/week</small></span><b aria-hidden="true">→</b></Link>)}</div>
          )}
        </section>
      )}
      {hubId && hub && <button className="primary" disabled={!hub.grid.length || !hub.languages.length || busy} onClick={find}>{busy ? 'Working…' : 'Find matches for this Hub'}</button>}

      {results && (
        <div style={{ marginTop: 20 }}>
          <div className="row spread">
            <h2>Recommended teams</h2>
            {results.filter((r) => r.team.length).length > 1 && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => invite(results.filter((r) => r.team.length), 'Recommended agents')}
              >
                Invite all recommended agents ({money(results.reduce((s, r) => s + r.weeklyCost, 0))}/week)
              </button>
            )}
          </div>
          {results.map((r) => (
            <div className="card" key={r.language}>
              <div className="row spread">
                <div>
                  <h3 style={{ marginBottom: 0 }}>
                    {langName(r.language)} <span className="badge">min {levelLabel(r.minLevel)}</span>
                  </h3>
                  <div className="muted small-text">
                    {r.candidates} matching agent{r.candidates === 1 ? '' : 's'}
                    {r.alreadyCoveredHours ? ` · ${r.alreadyCoveredHours}h already covered by your current team` : ''}
                  </div>
                </div>
                <div className="row">
                  <span className={`badge ${r.coveragePct === 100 ? 'ok' : r.coveragePct === 0 ? 'bad' : 'warn'}`}>{r.coveragePct}% covered</span>
                  <b>{money(r.weeklyCost)}/week</b>
                  {r.team.length > 0 && <button className="primary" disabled={busy} onClick={() => invite([r], `${langName(r.language)} team`)}>Invite this team</button>}
                </div>
              </div>

              {r.team.length === 0 ? (
                <div className="empty">No available agents for these hours. Try a lower proficiency level, a higher rate cap, or fewer hours.</div>
              ) : (
                <table style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Level</th>
                      <th>Rating</th>
                      <th>Hours/wk</th>
                      <th>Rate</th>
                      <th>Cost/wk</th>
                      <th>Shift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.team.map((t) => (
                      <tr key={t.agentId}>
                        <td>
                          <b>{t.name}</b>
                          {t.headline && <div className="muted small-text">{t.headline}</div>}
                          <div className="muted small-text">{t.verified && <span className="badge ok">Verified</span>} {t.languages.map((l) => langName(l.code)).join(', ')}</div>
                          {t.skills?.length > 0 && <div className="hub-tags match-skills">{t.skills.map((skill) => <span key={skill}>{skill.replaceAll('-', ' ')}</span>)}</div>}
                          <details className="match-explanation">
                            <summary>{Math.round(t.score * 100)}% match · score details</summary>
                            <div className="score-factors">
                              {Object.entries({ language: 'Language', availability: 'Availability', skills: 'Skills', experience: 'Experience', timezone: 'Timezone' }).map(([factor, label]) => <div key={factor}><span>{label}</span><strong>{t.scoreBreakdown?.[factor] ?? 0}%</strong><i><b style={{ width: `${t.scoreBreakdown?.[factor] ?? 0}%` }} /></i></div>)}
                            </div>
                          </details>
                        </td>
                        <td>{levelLabel(t.level)}</td>
                        <td>{t.rating == null ? <span className="muted">New</span> : `★ ${t.rating} (${t.ratingCount})`}</td>
                        <td>{t.assignedHours}</td>
                        <td>{money(t.clientRate)}/h</td>
                        <td>{money(t.weeklyCost)}</td>
                        <td>
                          <ScheduleGrid small readOnly value={t.assignedGrid} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {r.gapHours > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="alert" style={{ marginBottom: 8 }}>
                    {r.gapHours} hours/week can't be covered yet (shown in red). Adjust your requirements, or check back as more agents join.
                  </div>
                  <ScheduleGrid small readOnly tone="danger" value={r.gapGrid} />
                </div>
              )}

              {r.alternatives.length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary className="muted small-text">Other matching agents ({r.alternatives.length})</summary>
                  <table>
                    <tbody>
                      {r.alternatives.map((a) => (
                        <tr key={a.agentId}>
                          <td>{a.name}</td>
                          <td>{levelLabel(a.level)}</td>
                          <td>{a.rating == null ? 'New' : `★ ${a.rating}`}</td>
                          <td>{money(a.clientRate)}/h</td>
                          <td>{a.overlapPct}% of your hours</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
      {hubId && invitations.length > 0 && (
        <section className="hub-invitations">
          <h2>Agent invitations</h2>
          <div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>Agent</th><th>Language</th><th>Match</th><th>Status</th><th>Expires</th></tr></thead><tbody>{invitations.map((invitation) => <tr key={invitation.id}><td>{invitation.agent?.name || 'Unavailable agent'}</td><td>{langName(invitation.language)}</td><td>{Math.round((invitation.matchScore || 0) * 100)}%</td><td><span className={`badge ${invitation.status === 'accepted' ? 'ok' : invitation.status === 'pending' ? 'warn' : ''}`}>{invitation.status}</span></td><td>{new Date(invitation.expiresAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>
        </section>
      )}
    </>
  );
}
