import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../context';
import { useLive, fmtTime, relative } from '../hooks';

const STATUS_LABEL = { queued: 'Queued', assigned: 'Assigned', in_progress: 'In progress', resolved: 'Resolved' };
const SLA = { ok: ['On track', 'ok'], at_risk: ['At risk', 'warn'], breached: ['Breached', 'bad'], met: ['Met', 'ok'] };

function SlaBadge({ t }) {
  const [label, cls] = SLA[t.sla] || SLA.ok;
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function Tickets() {
  const { user, meta, langName } = useApp();
  const [filter, setFilter] = useState('open');
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const list = useLive(() => api(`/tickets?status=${filter}`), 5000, [filter]);
  const tickets = list.data || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{user.role === 'admin' ? 'All tickets' : 'Tickets'}</h1>
          <div className="muted">Updates every few seconds.</div>
        </div>
        {user.role === 'client' && (
          <button className="primary" onClick={() => setCreating((c) => !c)}>
            {creating ? 'Close' : 'New ticket'}
          </button>
        )}
      </div>
      {list.error && <div className="alert">{list.error}</div>}
      {creating && (
        <NewTicket
          languages={meta.languages}
          onDone={(t) => {
            setCreating(false);
            setFilter('open');
            setSelected(t._id);
            list.reload();
          }}
        />
      )}
      <div className="tabs">
        {[
          ['open', 'Open'],
          ['queued', 'Queued'],
          ['resolved', 'Resolved'],
          ['all', 'All'],
        ].map(([k, l]) => (
          <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="split">
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          {tickets.length === 0 ? (
            <div className="empty">{list.data ? 'No tickets here.' : 'Loading…'}</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Subject</th>
                  <th>Lang</th>
                  <th>Status</th>
                  <th>SLA</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t._id} className={`click ${selected === t._id ? 'sel' : ''}`} onClick={() => setSelected(t._id)}>
                    <td>{t.number}</td>
                    <td>
                      <b>{t.subject}</b>
                      <div className="muted small-text">
                        {t.customerName}
                        {user.role === 'admin' && t.company ? ` · ${t.company}` : ''}
                        {t.agentName && user.role !== 'agent' ? ` → ${t.agentName}` : ''}
                      </div>
                    </td>
                    <td>{langName(t.language)}</td>
                    <td>
                      <span className="badge">{STATUS_LABEL[t.status]}</span>
                      {t.priority !== 'normal' && <span className={`badge ${t.priority === 'urgent' ? 'bad' : ''}`}> {t.priority}</span>}
                    </td>
                    <td>
                      <SlaBadge t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>{selected ? <Detail id={selected} onChange={list.reload} /> : <div className="card empty">Select a ticket to see the conversation.</div>}</div>
      </div>
    </>
  );
}

function NewTicket({ languages, onDone }) {
  const [f, setF] = useState({ customerName: '', customerEmail: '', language: 'de', subject: '', priority: 'normal', message: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      onDone(await api('/tickets', { method: 'POST', body: f }));
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h2>New ticket</h2>
      {err && <div className="alert">{err}</div>}
      <div className="grid g2" style={{ gap: 12 }}>
        <div>
          <label style={{ marginTop: 0 }}>Customer name</label>
          <input value={f.customerName} onChange={set('customerName')} required />
        </div>
        <div>
          <label style={{ marginTop: 0 }}>Customer email (optional)</label>
          <input type="email" value={f.customerEmail} onChange={set('customerEmail')} />
        </div>
        <div>
          <label>Customer's language</label>
          <select value={f.language} onChange={set('language')}>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Priority</label>
          <select value={f.priority} onChange={set('priority')}>
            {['low', 'normal', 'high', 'urgent'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      <label>Subject</label>
      <input value={f.subject} onChange={set('subject')} required maxLength={200} />
      <label>Message</label>
      <textarea value={f.message} onChange={set('message')} required />
      <button className="primary" style={{ marginTop: 12 }} disabled={busy}>
        {busy ? 'Creating…' : 'Create & route'}
      </button>
    </form>
  );
}

function Detail({ id, onChange }) {
  const { user, langName } = useApp();
  const { data: t, error, reload } = useLive(() => api(`/tickets/${id}`), 4000, [id]);
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const endRef = useRef(null);
  const count = t ? t.messages.length : 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [count]);
  useEffect(() => setBody(''), [id]);

  if (error && !t) return <div className="alert">{error}</div>;
  if (!t) return <div className="card empty">Loading…</div>;

  const act = async (fn) => {
    setErr('');
    try {
      await fn();
      await reload();
      onChange();
    } catch (e) {
      setErr(e.message);
    }
  };
  const canReply = t.status !== 'resolved' && (user.role === 'client' || (user.role === 'agent' && t.status !== 'queued'));

  return (
    <div className="card">
      <div className="row spread">
        <h2 style={{ marginBottom: 0 }}>
          #{t.number} {t.subject}
        </h2>
        <SlaBadge t={t} />
      </div>
      <div className="muted small-text" style={{ margin: '4px 0 8px' }}>
        {t.customerName}
        {t.customerEmail ? ` <${t.customerEmail}>` : ''} · {langName(t.language)} · {STATUS_LABEL[t.status]}
        {t.agentName ? ` · agent ${t.agentName}` : ''}
        <br />
        {t.status === 'queued'
          ? 'Waiting for a matching agent to come on shift.'
          : t.firstResponseAt
          ? `First response ${fmtTime(t.firstResponseAt)}`
          : t.firstResponseDueAt && `First response due ${relative(t.firstResponseDueAt)}`}
      </div>
      <div className="msgs">
        {t.messages.map((m, i) => (
          <div key={i} className={`msg ${m.from}`}>
            {m.from !== 'system' && (
              <div className="by">
                {m.authorName} · {fmtTime(m.at)}
              </div>
            )}
            {m.body}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {err && <div className="alert">{err}</div>}
      {canReply && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            act(async () => {
              await api(`/tickets/${id}/messages`, { method: 'POST', body: { body } });
              setBody('');
            });
          }}
        >
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={user.role === 'agent' ? `Reply in ${langName(t.language)}…` : 'Add a follow-up…'} />
          <div className="row spread" style={{ marginTop: 8 }}>
            <button className="primary" disabled={!body.trim()}>
              Send
            </button>
            {t.status !== 'queued' && (
              <button type="button" onClick={() => act(() => api(`/tickets/${id}/resolve`, { method: 'POST' }))}>
                Mark resolved
              </button>
            )}
          </div>
        </form>
      )}
      {t.status === 'resolved' && user.role === 'client' && t.agent && (
        <div className="row" style={{ marginTop: 8 }}>
          {t.csat ? (
            <span>Your rating: {'★'.repeat(t.csat)}</span>
          ) : (
            <>
              <span>Rate the agent:</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => act(() => api(`/tickets/${id}/rate`, { method: 'POST', body: { csat: n } }))}>
                  {n}★
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
