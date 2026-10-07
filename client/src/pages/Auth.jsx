import { Link } from 'react-router-dom';

export default function Auth() {
  return (
    <main className="auth-page">
      <div className="auth-layout">
        <aside className="auth-aside">
          <div className="auth-brand">Lingo<span>Hub</span></div>
          <div className="auth-aside-copy">
            <p className="auth-kicker">CUSTOMER SUPPORT, WITHOUT BORDERS</p>
            <h1>Every customer deserves to be understood.</h1>
            <p>Connect your support requirements with verified multilingual agents.</p>
          </div>
          <div className="auth-aside-foot">Multilingual support, made practical.</div>
        </aside>
        <section className="auth-content" aria-labelledby="portal-title">
          <div className="auth-form portal-chooser">
            <div className="auth-heading">
              <p className="auth-kicker">LINGOHUB PORTALS</p>
              <h2 id="portal-title">Choose your workspace</h2>
              <p className="muted">Sign in or create an account for your role.</p>
            </div>
            <div className="portal-options">
              <Link className="portal-option" to="/company/login"><span><strong>Company</strong><small>Create support requirements and invite agents.</small></span><b aria-hidden="true">→</b></Link>
              <Link className="portal-option" to="/agent/login"><span><strong>Support agent</strong><small>Manage your skills, availability, and invitations.</small></span><b aria-hidden="true">→</b></Link>
            </div>
            <p className="auth-privacy"><Link to="/admin/login">Admin sign in</Link><span aria-hidden="true"> · </span><Link to="/privacy">Privacy Notice</Link></p>
          </div>
        </section>
      </div>
    </main>
  );
}
