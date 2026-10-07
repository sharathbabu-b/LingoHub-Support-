import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, setToken } from '../api';
import { useApp } from '../context';
import { useNotifications } from '../components/Notifications';

export default function Account() {
  const { user, logout } = useApp();
  const { notify } = useNotifications();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [delPw, setDelPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn, okMsg) => {
    setErr('');
    setBusy(true);
    try {
      await fn();
      if (okMsg) notify(okMsg);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const changePassword = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await api('/auth/change-password', { method: 'POST', body: { currentPassword: cur, newPassword: next } });
      setToken(r.token); // this session continues; all other sessions are signed out
      setCur('');
      setNext('');
    }, 'Password changed. All your other sessions were signed out.');
  };

  const download = () =>
    run(async () => {
      const data = await api('/auth/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lingohub-data-export.json';
      a.click();
      URL.revokeObjectURL(url);
    }, 'Your data export was downloaded.');

  const signOutEverywhere = () =>
    run(async () => {
      await api('/auth/logout-all', { method: 'POST' });
      logout();
    });

  const deleteAccount = (e) => {
    e.preventDefault();
    if (!window.confirm('Permanently delete your account and data? This cannot be undone.')) return;
    run(async () => {
      await api('/auth/me', { method: 'DELETE', body: { password: delPw } });
      logout();
    });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Account</h1>
          <div className="muted">
            {user.name} · {user.email} · <Link to="/privacy">Privacy Notice</Link>
          </div>
        </div>
      </div>
      {err && (
        <div className="alert" role="alert">
          {err}
        </div>
      )}

      <form className="card" onSubmit={changePassword}>
        <h2>Change password</h2>
        <label htmlFor="cur" style={{ marginTop: 0 }}>
          Current password
        </label>
        <input id="cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" maxLength={200} />
        <label htmlFor="new">New password (min 10 characters)</label>
        <input id="new" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} maxLength={72} autoComplete="new-password" />
        <button className="primary" style={{ marginTop: 12 }} disabled={busy}>
          Change password
        </button>
      </form>

      <div className="card">
        <h2>Sessions</h2>
        <p className="muted small-text">Sign out of every device, including this one.</p>
        <button onClick={signOutEverywhere} disabled={busy}>
          Sign out everywhere
        </button>
      </div>

      <div className="card">
        <h2>Your data</h2>
        <p className="muted small-text">Download a copy of the personal data we hold about you (JSON).</p>
        <button onClick={download} disabled={busy}>
          Download my data
        </button>
      </div>

      {user.role !== 'admin' && (
        <form className="card" onSubmit={deleteAccount}>
          <h2 style={{ color: 'var(--danger)' }}>Delete account</h2>
          <p className="muted small-text">
            {user.role === 'client'
              ? 'Erases your account, coverage plans, Support Hubs, invitations, hired-agent records and all tickets (including your customers’ details). Your agents’ hours become available to others.'
              : 'Erases your profile and account. Your name is removed from past conversations and your open tickets return to the queue.'}
          </p>
          <label htmlFor="delpw">Confirm with your password</label>
          <input id="delpw" type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} required autoComplete="current-password" maxLength={200} />
          <button className="danger" style={{ marginTop: 12 }} disabled={busy || !delPw}>
            Delete my account permanently
          </button>
        </form>
      )}
    </>
  );
}
