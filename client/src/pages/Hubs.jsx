import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, browserTz } from '../api';
import { useApp } from '../context';
import { useNotifications } from '../components/Notifications';
import SuccessDialog from '../components/SuccessDialog';
import ScheduleGrid, { presets } from '../components/ScheduleGrid';

const blankHub = (timezone = browserTz()) => ({
  id: '',
  name: '',
  industry: '',
  companySize: '',
  country: '',
  website: '',
  supportContext: '',
  languages: [],
  skills: [],
  requiredSkills: [],
  channels: ['email', 'chat'],
  tier: 'tier1',
  ticketVolume: 0,
  timezone,
  grid: [],
  maxRate: '',
  requires24x7: false,
  status: 'active',
});

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

export default function Hubs() {
  const { meta, langName } = useApp();
  const { notify } = useNotifications();
  const [hubs, setHubs] = useState(null);
  const [form, setForm] = useState(null);
  const [languagePick, setLanguagePick] = useState('');
  const [requirement, setRequirement] = useState('');
  const [aiDraft, setAiDraft] = useState(null);
  const [error, setError] = useState('');
  const [createdHub, setCreatedHub] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const loadHubs = async () => {
    setHubs(await api('/hubs'));
  };

  useEffect(() => {
    loadHubs().catch((e) => setError(e.message));
  }, []);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggle = (key, value) => {
    const selected = new Set(form[key]);
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    set(key, [...selected]);
  };

  const edit = (hub) => {
    setError('');
    setCreatedHub(null);
    setForm({ ...hub, maxRate: hub.maxRate ?? '', status: hub.status === 'draft' ? 'active' : hub.status });
    setRequirement('');
    setAiDraft(null);
  };

  const create = () => {
    setError('');
    setCreatedHub(null);
    setForm(blankHub());
    setRequirement('');
    setAiDraft(null);
  };

  const draftWithAi = async () => {
    setError('');
    setAiDraft(null);
    setAiBusy(true);
    try {
      const draft = await api('/ai/parse-requirement', { method: 'POST', body: { requirement } });
      setForm((current) => ({
        ...current,
        languages: draft.languages,
        skills: draft.skills,
        channels: draft.channels,
        tier: draft.tier,
        timezone: draft.timezone,
        grid: draft.grid,
        requires24x7: draft.requires24x7,
        maxRate: draft.maxRate ?? '',
      }));
      setAiDraft(draft);
    } catch (e) {
      setError(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const creating = !form.id;
      const body = {
        name: form.name,
        industry: form.industry,
        companySize: form.companySize,
        country: form.country,
        website: form.website,
        supportContext: form.supportContext,
        languages: form.languages,
        skills: form.skills,
        requiredSkills: form.requiredSkills,
        channels: form.channels,
        tier: form.tier,
        timezone: form.timezone,
        grid: form.grid,
        requires24x7: form.requires24x7,
        maxRate: form.maxRate === '' ? null : Number(form.maxRate),
        ticketVolume: Number(form.ticketVolume),
        status: 'active',
      };
      const saved = await api(form.id ? `/hubs/${form.id}` : '/hubs', { method: form.id ? 'PUT' : 'POST', body });
      setForm(null);
      if (creating) setCreatedHub(saved);
      else notify(`Support Hub “${saved.name}” updated.`);
      await loadHubs();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const archive = async (hub) => {
    if (!window.confirm(`Archive “${hub.name}”? Existing invitations and engagements are not deleted.`)) return;
    setError('');
    try {
      await api(`/hubs/${hub.id}`, { method: 'DELETE' });
      await loadHubs();
      notify(`Support Hub “${hub.name}” archived.`);
    } catch (e) {
      setError(e.message);
    }
  };

  if (hubs === null && !form) return error ? <div className="alert">{error}</div> : <div className="muted">Loading Support Hubs…</div>;

  return (
    <section className="hubs-page" aria-labelledby="hubs-title">
      <header className="page-head hubs-head">
        <div>
          <p className="dashboard-eyebrow">COMPANY WORKSPACE</p>
          <h1 id="hubs-title">Support Hubs</h1>
          <p className="muted">Define what your customers need, then find verified agents who can cover it.</p>
        </div>
        {!form && <button className="primary" onClick={create}>Create Support Hub <span aria-hidden="true">+</span></button>}
      </header>
      {error && <div className="alert" role="alert">{error}</div>}
      {createdHub && <SuccessDialog title="Support Hub created" message={`${createdHub.name} is ready for matching. You can review eligible agents before sending invitations.`} actionLabel="Run matching" actionTo={`/match?hub=${createdHub.id}`} onClose={() => setCreatedHub(null)} />}

      {form ? (
        <form className="hub-editor" onSubmit={save}>
          <div className="hub-editor-head">
            <div>
              <p className="dashboard-eyebrow">{form.id ? 'EDIT REQUIREMENT' : 'NEW REQUIREMENT'}</p>
              <h2>{form.name || 'Configure your Support Hub'}</h2>
            </div>
            <button type="button" className="hub-close" aria-label="Close editor" onClick={() => setForm(null)}>×</button>
          </div>

          <div className="hub-ai">
            <div className="hub-ai-heading">
              <div>
                <span className="ai-indicator">AI assistant</span>
                <h3>Describe the support you need</h3>
                <p>Drafts language, skills, channels, tier, timezone and hours. You review every field before saving.</p>
              </div>
            </div>
            <label htmlFor="hub-requirement">Requirement description</label>
            <textarea id="hub-requirement" value={requirement} onChange={(e) => { setRequirement(e.target.value); setAiDraft(null); }} maxLength={2000} placeholder="Need native Japanese and English agents for SaaS billing and API questions, weekdays 6 pm to 2 am UTC." />
            <div className="hub-ai-footer">
              <p>Text is sent to the AI provider configured by your service operator. Do not include customer personal data.</p>
              <button type="button" className="primary" disabled={aiBusy || requirement.trim().length < 12} onClick={draftWithAi}>{aiBusy ? 'Drafting…' : 'Draft fields'}</button>
            </div>
            {aiDraft && (
              <div className="ai-draft" role="status">
                <p>{aiDraft.summary}</p>
                {aiDraft.assumptions.length > 0 && <p><strong>Assumptions:</strong> {aiDraft.assumptions.join(' ')}</p>}
                {aiDraft.questions.length > 0 && <p><strong>Confirm:</strong> {aiDraft.questions.join(' ')}</p>}
                <p className="ai-review-note">Review and edit the structured fields below before saving.</p>
              </div>
            )}
          </div>

          <div className="hub-section">
            <div className="hub-section-heading"><span>01</span><div><h3>Company & support context</h3><p>Help agents understand the service they will support.</p></div></div>
            <div className="hub-form-grid">
              <div className="hub-field"><label htmlFor="hub-name">Hub name</label><input id="hub-name" required minLength={2} maxLength={100} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Global SaaS support" /></div>
              <div className="hub-field"><label htmlFor="hub-industry">Industry</label><input id="hub-industry" maxLength={80} value={form.industry} onChange={(e) => set('industry', e.target.value)} placeholder="Software" /></div>
              <div className="hub-field"><label htmlFor="hub-size">Company size</label><select id="hub-size" value={form.companySize} onChange={(e) => set('companySize', e.target.value)}><option value="">Select size</option><option value="1-10">1–10</option><option value="11-50">11–50</option><option value="51-200">51–200</option><option value="201-1000">201–1,000</option><option value="1000+">1,000+</option></select></div>
              <div className="hub-field"><label htmlFor="hub-country">Country</label><input id="hub-country" maxLength={80} value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="Country" /></div>
              <div className="hub-field"><label htmlFor="hub-website">Website</label><input id="hub-website" type="url" maxLength={200} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://example.com" /></div>
              <div className="hub-field"><label htmlFor="hub-volume">Expected tickets / week</label><input id="hub-volume" type="number" min="0" max="100000" value={form.ticketVolume} onChange={(e) => set('ticketVolume', e.target.value)} /></div>
              <div className="hub-field hub-field-wide"><label htmlFor="hub-context">Product and support context</label><textarea id="hub-context" maxLength={1000} value={form.supportContext} onChange={(e) => set('supportContext', e.target.value)} placeholder="What does your product do? What should Tier-1 support handle?" /></div>
            </div>
          </div>

          <div className="hub-section">
            <div className="hub-section-heading"><span>02</span><div><h3>Languages & expertise</h3><p>Choose minimum language proficiency and required support skills.</p></div></div>
            <div className="hub-field">
              <label htmlFor="hub-language">Add a language</label>
              <div className="hub-add-language"><select id="hub-language" value={languagePick} onChange={(e) => setLanguagePick(e.target.value)}><option value="">Choose language</option>{meta.languages.filter((language) => !form.languages.some((item) => item.code === language.code)).map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}</select><button type="button" disabled={!languagePick} onClick={() => { set('languages', [...form.languages, { code: languagePick, minLevel: 'C1' }]); setLanguagePick(''); }}>Add language</button></div>
            </div>
            <div className="hub-language-list">
              {form.languages.length === 0 && <p className="muted small-text">Add at least one language to enable matching.</p>}
              {form.languages.map((language) => <div className="hub-language-row" key={language.code}><strong>{langName(language.code)}</strong><select aria-label={`${langName(language.code)} minimum proficiency`} value={language.minLevel} onChange={(e) => set('languages', form.languages.map((item) => item.code === language.code ? { ...item, minLevel: e.target.value } : item))}>{meta.levels.map((level) => <option key={level.code} value={level.code}>{level.label}</option>)}</select><button type="button" className="hub-remove" aria-label={`Remove ${langName(language.code)}`} onClick={() => set('languages', form.languages.filter((item) => item.code !== language.code))}>Remove</button></div>)}
            </div>
            <div className="hub-choice-grid">
              <fieldset className="hub-choice-group"><legend>Preferred skills <span>scored</span></legend>{SKILLS.map(([value, label]) => <label className="hub-check" key={value}><input type="checkbox" checked={form.skills.includes(value)} onChange={() => toggle('skills', value)} /><span>{label}</span></label>)}</fieldset>
              <fieldset className="hub-choice-group"><legend>Required skills <span>hard filter</span></legend>{SKILLS.map(([value, label]) => <label className="hub-check" key={value}><input type="checkbox" checked={form.requiredSkills.includes(value)} onChange={() => toggle('requiredSkills', value)} /><span>{label}</span></label>)}</fieldset>
            </div>
          </div>

          <div className="hub-section">
            <div className="hub-section-heading"><span>03</span><div><h3>Channels, tier & rate</h3><p>Agents must support each selected channel and tier.</p></div></div>
            <div className="hub-inline-fields">
              <div className="hub-field"><label htmlFor="hub-tier">Support tier</label><select id="hub-tier" value={form.tier} onChange={(e) => set('tier', e.target.value)}><option value="tier1">Tier 1</option><option value="tier2">Tier 2</option></select></div>
              <div className="hub-field"><label htmlFor="hub-max-rate">Maximum agent rate (USD / hour)</label><input id="hub-max-rate" type="number" min="1" max="1000" value={form.maxRate} onChange={(e) => set('maxRate', e.target.value)} placeholder="No limit" /></div>
            </div>
            <fieldset className="hub-choice-group hub-channels"><legend>Support channels</legend>{CHANNELS.map(([value, label]) => <label className="hub-check" key={value}><input type="checkbox" checked={form.channels.includes(value)} onChange={() => toggle('channels', value)} /><span>{label}</span></label>)}</fieldset>
          </div>

          <div className="hub-section hub-schedule-section">
            <div className="hub-section-heading"><span>04</span><div><h3>Availability & timezone</h3><p>Coverage is stored in UTC and displayed in your chosen timezone.</p></div></div>
            <div className="hub-inline-fields">
              <div className="hub-field"><label htmlFor="hub-timezone">Hub timezone</label><select id="hub-timezone" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>{meta.timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></div>
              <label className="hub-check hub-24x7"><input type="checkbox" checked={form.requires24x7} onChange={(e) => { const checked = e.target.checked; set('requires24x7', checked); if (checked) set('grid', presets.all()); }} /><span>Require continuous 24/7 coverage</span></label>
            </div>
            <div className="hub-schedule-tools"><button type="button" onClick={() => set('grid', presets.all())}>24/7</button><button type="button" onClick={() => set('grid', presets.business())}>Weekdays 9–17</button><button type="button" onClick={() => set('grid', [])}>Clear schedule</button><span>{form.grid.length} hours/week</span></div>
            <div className="hub-schedule-scroll"><ScheduleGrid value={form.grid} onChange={(grid) => set('grid', grid)} /></div>
          </div>

          <div className="hub-editor-actions"><button type="button" onClick={() => setForm(null)}>Cancel</button><button className="primary" disabled={busy || form.languages.length === 0 || form.grid.length === 0}>{busy ? 'Saving…' : form.id ? 'Save changes' : 'Create Support Hub'}</button></div>
        </form>
      ) : hubs.length === 0 ? (
        <div className="hub-empty"><p className="dashboard-eyebrow">YOUR REQUIREMENTS</p><h2>No Support Hubs yet</h2><p>Create a Hub to capture languages, skills, service hours and channels in one reusable requirement.</p><button className="primary" onClick={create}>Create your first Hub</button></div>
      ) : (
        <div className="hub-list">
          {hubs.map((hub) => <article className="hub-row" key={hub.id}>
            <div className="hub-row-main"><div className="hub-row-title"><h2>{hub.name}</h2><span className={`badge ${hub.status === 'active' ? 'ok' : 'warn'}`}>{hub.status}</span></div><p>{hub.industry || 'Support requirement'}{hub.country ? ` · ${hub.country}` : ''} · {hub.tier === 'tier1' ? 'Tier 1' : 'Tier 2'}</p><div className="hub-tags">{hub.languages.map((language) => <span key={language.code}>{langName(language.code)} · {language.minLevel}</span>)}<span>{hub.grid.length} coverage hours / week</span><span>{hub.requiredSkills.length} required skills</span></div></div>
            <div className="hub-row-actions"><Link className="hub-match-link" to={`/match?hub=${hub.id}`}>Run matching <span aria-hidden="true">→</span></Link><button type="button" onClick={() => edit(hub)}>Edit</button><button type="button" className="hub-remove" onClick={() => archive(hub)}>Archive</button></div>
          </article>)}
        </div>
      )}
    </section>
  );
}