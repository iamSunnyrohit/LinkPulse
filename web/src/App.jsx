import { Routes, Route, Navigate, Link, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import AuthForm from './pages/AuthForm.jsx';
import Overview from './pages/Overview.jsx';
import LinkList from './pages/LinkList.jsx';
import CreateLink from './pages/CreateLink.jsx';
import LinkDetail from './pages/LinkDetail.jsx';
import Analytics from './pages/Analytics.jsx';
import RoutingRules from './pages/RoutingRules.jsx';
import Telemetry from './pages/Telemetry.jsx';
import Settings from './pages/Settings.jsx';

function Guard({ children }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: me, isLoading, error } = useQuery({ queryKey: ['me'], queryFn: () => api('/me'), retry: false });
  if (isLoading) return <p className="center">Loading…</p>;
  if (error) return <Navigate to="/login" replace />;

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    qc.clear(); nav('/login');
  }
  const cls = ({ isActive }) => (isActive ? 'on' : '');
  return (
    <div className="shell">
      <header className="top">
        <Link to="/" className="brand">LinkPulse</Link>
        <div className="row" style={{ margin: 0 }}>
          <Link to="/new" className="btn primary">New short link</Link>
          <Link to="/settings" className="btn">{me.display_name || me.email}</Link>
          <button onClick={logout}>Sign out</button>
        </div>
      </header>
      <nav className="side">
        <small>PLATFORM NAVIGATION</small>
        <NavLink to="/" end className={cls}>Overview</NavLink>
        <NavLink to="/links" className={cls}>Links</NavLink>
        <NavLink to="/analytics" className={cls}>Analytics</NavLink>
        <NavLink to="/routing" className={cls}>Routing Rules</NavLink>
        {me.role === 'admin' && <NavLink to="/telemetry" className={cls}>Edge Telemetry</NavLink>}
        <NavLink to="/settings" className={cls}>Settings</NavLink>
      </nav>
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  const g = el => <Guard>{el}</Guard>;
  return (
    <Routes>
      <Route path="/login" element={<AuthForm mode="login" />} />
      <Route path="/register" element={<AuthForm mode="register" />} />
      <Route path="/" element={g(<Overview />)} />
      <Route path="/links" element={g(<LinkList />)} />
      <Route path="/new" element={g(<CreateLink />)} />
      <Route path="/links/:id" element={g(<LinkDetail />)} />
      <Route path="/analytics" element={g(<Analytics />)} />
      <Route path="/routing" element={g(<RoutingRules />)} />
      <Route path="/telemetry" element={g(<Telemetry />)} />
      <Route path="/settings" element={g(<Settings />)} />
      <Route path="/profile" element={<Navigate to="/settings" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}