import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useApp } from './context';
import Auth from './pages/Auth';
import ClientDashboard from './pages/ClientDashboard';
import Match from './pages/Match';
import Team from './pages/Team';
import Coverage from './pages/Coverage';
import Tickets from './pages/Tickets';
import Settings from './pages/Settings';
import AgentProfile from './pages/AgentProfile';
import AgentEngagements from './pages/AgentEngagements';
import Admin from './pages/Admin';
import Account from './pages/Account';
import Privacy from './pages/Privacy';
import Hubs from './pages/Hubs';
import { CompanyLogin, CompanyRegistration } from './pages/CompanyPortal';
import { AgentLogin, AgentRegistration } from './pages/AgentPortal';
import AdminPortal from './pages/AdminPortal';

const NAV = {
  client: [
    ['/', 'Dashboard'],
    ['/hubs', 'Support Hubs'],
    ['/match', 'Find agents'],
    ['/team', 'My team & billing'],
    ['/coverage', 'Coverage'],
    ['/tickets', 'Tickets'],
    ['/settings', 'Integration'],
    ['/account', 'Account'],
  ],
  agent: [
    ['/', 'My profile & shifts'],
    ['/engagements', 'Clients & earnings'],
    ['/tickets', 'Tickets'],
    ['/account', 'Account'],
  ],
  admin: [
    ['/', 'Admin'],
    ['/tickets', 'All tickets'],
    ['/account', 'Account'],
  ],
};

export default function App() {
  const { user, ready, logout } = useApp();
  if (!ready) return <div className="auth muted">Loading…</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/" element={<Auth />} />
        <Route path="/company/login" element={<CompanyLogin />} />
        <Route path="/company/register" element={<CompanyRegistration />} />
        <Route path="/agent/login" element={<AgentLogin />} />
        <Route path="/agent/register" element={<AgentRegistration />} />
        <Route path="/admin/login" element={<AdminPortal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  const home = { client: <ClientDashboard />, agent: <AgentProfile />, admin: <Admin /> }[user.role];
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <div className="shell">
      <nav className="side" aria-label="Main navigation">
        <Link className="side-brand" to="/" aria-label="LingoHub home">
          <span className="brand-symbol" aria-hidden="true">LH</span>
          <span className="side-brand-wordmark">Lingo<span>Hub</span></span>
        </Link>
        <div className="side-section-title">Workspace</div>
        <div className="side-links">
          {NAV[user.role].map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
              {label}
            </NavLink>
          ))}
        </div>
        <div className="who">
          <div className="profile-avatar" aria-hidden="true">{initials}</div>
          <div className="profile-details">
            <b title={user.name}>{user.name}</b>
            <div className="profile-role">{user.role === 'client' ? user.company : user.role}</div>
          </div>
          <button className="signout" onClick={logout}>Sign out</button>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={home} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/account" element={<Account />} />
          <Route path="/privacy" element={<Privacy />} />
          {user.role === 'client' && (
            <>
              <Route path="/match" element={<Match />} />
              <Route path="/hubs" element={<Hubs />} />
              <Route path="/team" element={<Team />} />
              <Route path="/coverage" element={<Coverage />} />
              <Route path="/settings" element={<Settings />} />
            </>
          )}
          {user.role === 'agent' && <Route path="/engagements" element={<AgentEngagements />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
