import { useEffect, useState } from 'react';
import { api, browserTz } from '../api';
import { useApp } from '../context';
import { useNotifications } from '../components/Notifications';
import ScheduleGrid, { presets } from '../components/ScheduleGrid';

const SKILLS = [
  ['saas-support', 'SaaS support'],
  ['billing', 'Billing'],
  ['technical-support', 'Technical support'],
  ['troubleshooting', 'Troubleshooting'],
  ['account-management', 'Account management'],
  ['api-support', 'API support'],
  ['security', 'Security'],
  ['onboarding', 'Onboarding'],
];
const CHANNELS = [['email', 'Email'], ['chat', 'Chat'], ['voice', 'Voice']];

export default function AgentProfile() {
  const { meta, langName } = useApp();
  const { notify } = useNotifications();
  const [p, setP] = useState(null);
  const [tz, setTz] = useState(browserTz());
  const [pick, setPick] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // First load: use the agent's saved timezone for display (fall back to the browser's).
  useEffect(() => {
    api('/agent/profile')
      .then((r) => {
        const zone = r.timezone && r.timezone !== 'UTC' ? r.timezone : browserTz();
        setTz(zone);
        return zone === r.timezone ? r : api(`/agent/profile?tz=${encodeURIComponent(zone)}`);
      })
      .then(setP)
      .catch((e) => setErr(e.message));
  }, []);

  // Changing the timezone re-expresses the same UTC hours in the new zone (unsaved edits are kept as drawn).
  const changeTz = async (zone) => {
    setTz(zone);
    try {
      const r = await api(`/agent/profile?tz=${encodeURIComponent(zone)}`);
      setP((cur) => ({ ...cur, grid: r.grid, committedGrid: r.committedGrid }));
    } catch (e) {
      setErr(e.message);
    }
  };

  if (!p) return err ? <div className="alert">{err}</div> : <div className="muted">Loading…</div>;
  const set = (k, v) => setP((current) => ({ ...current, [k]: v }));

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      const r = await api('/agent/profile', {
        method: 'PUT',
        body: { headline: p.headline, bio: p.bio, skills: p.skills, experienceYears: Number(p.experienceYears), channels: p.channels, tiers: p.tiers, timezone: tz, hourlyRate: Number(p.hourlyRate), languages: p.languages, grid: p.grid },
      });
      setP(r);
      notify('Agent profile updated.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My profile & shifts</h1>
          <div className="muted">
            {p.verified ? <span className="badge ok">Verified, visible to clients</span> : <span className="badge warn">Pending admin verification, not yet visible to clients</span>}{' '}
            {p.weeklyHoursAvailable} h/week available · {p.weeklyHoursFree} h free
            {p.rating != null && ` · ★ ${p.rating} (${p.ratingCount})`}
          </div>
        </div>
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
      {err && <div className="alert">{err}</div>}

      <div className="grid g2">
        <div className="card">
          <h2>About you</h2>
          <label style={{ marginTop: 0 }}>Headline</label>
          <input value={p.headline} onChange={(e) => set('headline', e.target.value)} maxLength={120} placeholder="e.g. German SaaS support specialist" />
          <label>Bio</label>
          <textarea value={p.bio} onChange={(e) => set('bio', e.target.value)} maxLength={1000} />
          <div className="agent-capabilities">
            <h3>Support capabilities</h3>
            <label htmlFor="experience-years">Years supporting customers</label>
            <input id="experience-years" type="number" min="0" max="50" value={p.experienceYears || 0} onChange={(e) => set('experienceYears', e.target.value)} />
            <fieldset className="hub-choice-group">
              <legend>Skills</legend>
              {SKILLS.map(([value, label]) => <label className="hub-check" key={value}><input type="checkbox" checked={(p.skills || []).includes(value)} onChange={() => { const selected = new Set(p.skills || []); selected.has(value) ? selected.delete(value) : selected.add(value); set('skills', [...selected]); }} /><span>{label}</span></label>)}
            </fieldset>
            <fieldset className="hub-choice-group">
              <legend>Support channels</legend>
              {CHANNELS.map(([value, label]) => <label className="hub-check" key={value}><input type="checkbox" checked={(p.channels || ['email', 'chat']).includes(value)} onChange={() => { const selected = new Set(p.channels || ['email', 'chat']); selected.has(value) ? selected.delete(value) : selected.add(value); set('channels', [...selected]); }} /><span>{label}</span></label>)}
            </fieldset>
            <fieldset className="hub-choice-group">
              <legend>Support tiers</legend>
              {[['tier1', 'Tier 1'], ['tier2', 'Tier 2']].map(([value, label]) => <label className="hub-check" key={value}><input type="checkbox" checked={(p.tiers || ['tier1']).includes(value)} onChange={() => { const selected = new Set(p.tiers || ['tier1']); selected.has(value) ? selected.delete(value) : selected.add(value); set('tiers', [...selected]); }} /><span>{label}</span></label>)}
            </fieldset>
          </div>
          <label>Hourly rate you earn (USD)</label>
          <input type="number" min="1" max="500" value={p.hourlyRate} onChange={(e) => set('hourlyRate', e.target.value)} />

          <h2 className="agent-language-heading">Languages & proficiency</h2>
          <div className="agent-add-language">
            <label className="sr-only" htmlFor="agent-language">Add a language</label>
            <select id="agent-language" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Add a language…</option>
              {meta.languages
                .filter((l) => !p.languages.some((x) => x.code === l.code))
                .map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!pick || p.languages.length >= 8}
              onClick={() => {
                set('languages', [...p.languages, { code: pick, level: 'C1' }]);
                setPick('');
              }}
            >
              Add
            </button>
          </div>
          <div className="agent-language-list">
            {p.languages.length === 0 && <p className="muted small-text">Add each language you can support. Choose “Native speaker” when it is your first language.</p>}
            {p.languages.map((language) => (
              <div className="agent-language-row" key={language.code}>
                <strong>{langName(language.code)}</strong>
                <select aria-label={`${langName(language.code)} proficiency`} value={language.level} onChange={(e) => set('languages', p.languages.map((item) => (item.code === language.code ? { ...item, level: e.target.value } : item)))}>
                  {meta.levels.map((level) => <option key={level.code} value={level.code}>{level.label}</option>)}
                </select>
                <button type="button" className="hub-remove" onClick={() => set('languages', p.languages.filter((item) => item.code !== language.code))} aria-label={`Remove ${langName(language.code)}`}>Remove</button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Weekly availability</h2>
          <label style={{ marginTop: 0 }}>Your timezone</label>
          <select value={tz} onChange={(e) => changeTz(e.target.value)}>
            {meta.timezones.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
          <div className="row" style={{ margin: '10px 0' }}>
            <button onClick={() => set('grid', presets.business())}>Mon–Fri 9–17</button>
            <button onClick={() => set('grid', [])} disabled={p.committedGrid.length > 0} title={p.committedGrid.length ? 'You have committed hours' : ''}>
              Clear
            </button>
          </div>
          <ScheduleGrid value={p.grid} onChange={(g) => set('grid', g)} locked={p.committedGrid} />
          <div className="legend">
            <span>
              <i style={{ background: 'var(--brand)' }} />
              Available
            </span>
            <span>
              <i style={{ boxShadow: 'inset 0 0 0 2px var(--warn)' }} />
              Committed to a client (can't be removed)
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
