import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context';

export default function AuthForm({ role, mode, signInPath, registerPath }) {
  const { login, register } = useApp();
  const navigate = useNavigate();
  const [fields, setFields] = useState({ name: '', email: '', password: '', company: '' });
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';
  const isCompany = role === 'client';
  const isAdmin = role === 'admin';
  const setField = (key) => (event) => setFields((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) {
        await register({
          name: fields.name,
          email: fields.email,
          password: fields.password,
          role,
          ...(isCompany ? { company: fields.company } : {}),
          acceptPrivacy,
        });
      } else {
        await login({ email: fields.email, password: fields.password });
      }
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <aside className="auth-aside">
          <div className="auth-brand">Lingo<span>Hub</span></div>
          <div className="auth-aside-copy">
            <p className="auth-kicker">{isCompany ? 'COMPANY PORTAL' : isAdmin ? 'PLATFORM PORTAL' : 'AGENT PORTAL'}</p>
            <h1>{isCompany ? 'Build support coverage around your customers.' : isAdmin ? 'Keep the marketplace trusted.' : 'Find support work that fits your skills.'}</h1>
            <p>{isCompany ? 'Define languages, skills, and hours, then invite verified agents.' : isAdmin ? 'Review agent verification and platform health.' : 'Share your languages and availability with support teams.'}</p>
          </div>
          <div className="auth-aside-foot">LingoHub · Role-based workspace</div>
        </aside>
        <section className="auth-content" aria-labelledby="auth-title">
          <form className="auth-form" onSubmit={submit}>
            <div className="auth-heading">
              <p className="auth-kicker">{isCompany ? 'COMPANY WORKSPACE' : isAdmin ? 'ADMINISTRATOR' : 'AGENT WORKSPACE'}</p>
              <h2 id="auth-title">{isRegister ? 'Create your account' : isAdmin ? 'Admin sign in' : `Welcome to the ${isCompany ? 'company' : 'agent'} portal`}</h2>
              <p className="muted">{isRegister ? 'Your account is created for this portal only.' : 'Sign in to continue to your workspace.'}</p>
            </div>
            <div className="tabs" role="tablist" aria-label="Account access">
              <Link role="tab" aria-selected={!isRegister} className={!isRegister ? 'active' : ''} to={signInPath}>Sign in</Link>
              {!isAdmin && <Link role="tab" aria-selected={isRegister} className={isRegister ? 'active' : ''} to={registerPath}>Create account</Link>}
            </div>
            {error && <div className="alert" role="alert">{error}</div>}
            <div className="auth-fields">
              {isRegister && <>
                <div className="auth-field"><label htmlFor="auth-name">Full name</label><input id="auth-name" type="text" value={fields.name} onChange={setField('name')} required minLength={2} maxLength={80} autoComplete="name" /></div>
                {isCompany && <div className="auth-field"><label htmlFor="auth-company">Company name</label><input id="auth-company" type="text" value={fields.company} onChange={setField('company')} required maxLength={120} autoComplete="organization" /></div>}
              </>}
              <div className="auth-field"><label htmlFor="auth-email">Email address</label><input id="auth-email" type="email" value={fields.email} onChange={setField('email')} required maxLength={254} autoComplete="email" /></div>
              <div className="auth-field">
                <label htmlFor="auth-password">Password</label>
                <div className="auth-password">
                  <input id="auth-password" type={showPassword ? 'text' : 'password'} value={fields.password} onChange={setField('password')} required minLength={isRegister ? 10 : 1} maxLength={72} autoComplete={isRegister ? 'new-password' : 'current-password'} aria-describedby={isRegister ? 'auth-password-hint' : undefined} />
                  <button className="auth-reveal" type="button" onClick={() => setShowPassword((current) => !current)} aria-pressed={showPassword} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
                </div>
                {isRegister && <p id="auth-password-hint" className="auth-hint">Use at least 10 characters. Avoid common passwords and your email address.</p>}
              </div>
            </div>
            {isRegister && <div className="auth-consent"><input id="auth-privacy" type="checkbox" checked={acceptPrivacy} onChange={(event) => setAcceptPrivacy(event.target.checked)} required /><label htmlFor="auth-privacy">I have read the <Link to="/privacy" target="_blank" rel="noreferrer">Privacy Notice</Link> and agree to how my data is processed.</label></div>}
            <button className="primary auth-submit" type="submit" disabled={busy || (isRegister && !acceptPrivacy)}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}</button>
            {isRegister && role === 'agent' && <p className="auth-hint auth-note">Your profile requires admin verification before clients can match with you.</p>}
            {isAdmin && <p className="auth-hint auth-note">Admin accounts are provisioned by the service administrator.</p>}
            <p className="auth-privacy"><Link to="/">Choose another portal</Link><span aria-hidden="true"> · </span><Link to="/privacy">Privacy Notice</Link></p>
          </form>
        </section>
      </div>
    </main>
  );
}