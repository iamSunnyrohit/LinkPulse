import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';

export default function AuthForm({ mode }) {
  const isLogin = mode === 'login';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();

  const checks = [
    ['8+ characters', password.length >= 8],
    ['Upper and lower case', /[a-z]/.test(password) && /[A-Z]/.test(password)],
    ['Digit or symbol', /[\d\W_]/.test(password)],
  ];

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!isLogin && !agree) return setError('Please accept the terms to create an account.');
    setBusy(true);
    try {
      const body = { email, password };
      if (!isLogin && name.trim()) body.display_name = name.trim();
      await api(`/auth/${mode}`, { method: 'POST', body });
      await qc.resetQueries({ queryKey: ['me'] });
      nav('/');
    } catch (err) {
      setError(err.status === 422
        ? 'Enter a valid email and a password of at least 8 characters.'
        : err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <span className="logo">⛓</span>
        <span>LinkPulse</span>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <h1>{isLogin ? 'Sign in to LinkPulse' : 'Create your account'}</h1>
        <p className="muted">
          {isLogin
            ? 'Enter your credentials to manage your short links and view click analytics.'
            : 'Create short links and see where your traffic comes from.'}
        </p>

        {!isLogin && (
          <label>Full name <span className="hint">optional</span>
            <input value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Alex Chen" />
          </label>
        )}

        <label>Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="alex@company.io" autoComplete="email" required />
        </label>

        <label>Password
          <div className="pw">
            <input type={show ? 'text' : 'password'} minLength={8} value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={isLogin ? 'current-password' : 'new-password'} required />
            <button type="button" className="eye" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
        </label>

        {!isLogin && (
          <>
            <div className="meter">
              {checks.map(([label, ok]) => <div key={label} className={ok ? 'ok' : ''}><i />{label}</div>)}
            </div>
            <label className="check">
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
              <span>I agree to the terms of service and privacy notice.</span>
            </label>
          </>
        )}

        {error && <p role="alert" className="err">{error}</p>}

        <button className="primary wide" disabled={busy}>
          {busy ? 'Please wait…' : isLogin ? 'Sign in to dashboard' : 'Create account'}
        </button>

        <p className="swap">
          {isLogin
            ? <>Don't have an account? <Link to="/register">Create an account</Link></>
            : <>Already have an account? <Link to="/login">Sign in</Link></>}
        </p>
      </form>
    </div>
  );
}