import { Routes, Route, Navigate, Link, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import AuthForm from './pages/AuthForm.jsx';
import LinkList from './pages/LinkList.jsx';
import CreateLink from './pages/CreateLink.jsx';
import LinkDetail from './pages/LinkDetail.jsx';
import Overview from './pages/Overview.jsx';


function Guard({ children }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { isLoading, error } = useQuery({ queryKey: ['me'], queryFn: () => api('/me'), retry: false });
  if (isLoading) return <p className="center">Loading…</p>;
  if (error) return <Navigate to="/login" replace />;

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    qc.clear();
    nav('/login');
  }
  const cls = ({ isActive }) => (isActive ? 'on' : '');
  return (
    <div className="shell">
      <header className="top">
        <Link to="/" className="brand">LinkPulse</Link>
        <div className="row" style={{ margin: 0 }}>
          <Link to="/new" className="btn primary">New short link</Link>
          <button onClick={logout}>Sign out</button>
        </div>
      </header>
      <nav className="side">
        <small>PLATFORM NAVIGATION</small>
        <NavLink to="/" end className={cls}>Overview</NavLink>
        <NavLink to="/links" className={cls}>Links</NavLink>
      </nav>
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
    <Route path="/login" element={<AuthForm mode="login" />} />
    <Route path="/register" element={<AuthForm mode="register" />} />
    <Route path="/" element={<Guard><Overview /></Guard>} />
    <Route path="/links" element={<Guard><LinkList /></Guard>} />
    <Route path="/new" element={<Guard><CreateLink /></Guard>} />
    <Route path="/links/:id" element={<Guard><LinkDetail /></Guard>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
  );
}
