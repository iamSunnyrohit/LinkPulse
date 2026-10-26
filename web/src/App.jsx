import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import AuthForm from './pages/AuthForm.jsx';
import LinkList from './pages/LinkList.jsx';
import CreateLink from './pages/CreateLink.jsx';
import LinkDetail from './pages/LinkDetail.jsx';

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
  return (
    <>
      <header className="bar">
        <Link to="/" className="brand">LinkPulse</Link>
        <nav><Link to="/new">+ New link</Link> <button onClick={logout}>Sign out</button></nav>
      </header>
      <main>{children}</main>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthForm mode="login" />} />
      <Route path="/register" element={<AuthForm mode="register" />} />
      <Route path="/" element={<Guard><LinkList /></Guard>} />
      <Route path="/new" element={<Guard><CreateLink /></Guard>} />
      <Route path="/links/:id" element={<Guard><LinkDetail /></Guard>} />
    </Routes>
  );
}