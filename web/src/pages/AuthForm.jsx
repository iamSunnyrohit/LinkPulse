import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';

export default function AuthForm({ mode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await api(`/auth/${mode}`, { method: 'POST', body: { email, password } });
      await qc.resetQueries({ queryKey: ['me'] });
      nav('/');
    } catch (err) {
      setError(err.status === 422 ? 'Enter a valid email and a password of at least 8 characters.' : err.message);
    } finally { setBusy(false); }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p role="alert" className="err">{error}</p>}
      <button disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}</button>
      <p>{mode === 'login'
        ? <>No account? <Link to="/register">Register</Link></>
        : <>Have an account? <Link to="/login">Sign in</Link></>}</p>
    </form>
  );
}