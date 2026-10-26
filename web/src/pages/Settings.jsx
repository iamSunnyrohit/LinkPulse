import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';

export default function Settings() {
  const [tab, setTab] = useState('profile');
  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: () => api('/me') });
  if (isLoading) return <p>Loading…</p>;

  return (
    <>
      <h1 style={{ marginTop: 0 }}>Account settings <span className="pill active">{me.role}</span></h1>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>Profile</button>
        <button className={tab === 'security' ? 'on' : ''} onClick={() => setTab('security')}>Security</button>
        <button disabled title="Phase 2">API keys</button>
      </div>
      {tab === 'profile' ? <Profile me={me} /> : <Security />}
    </>
  );
}

function Profile({ me }) {
  const qc = useQueryClient();
  const [name, setName] = useState(me.display_name ?? '');
  const [msg, setMsg] = useState('');
  const save = useMutation({
    mutationFn: () => api('/me', { method: 'PATCH', body: { display_name: name } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['me'] }); setMsg('Profile saved'); },
    onError: e => setMsg(e.message),
  });
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ marginTop: 0 }}>Identity</h3>
      <label>Display name
        <input value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Your name" />
      </label>
      <label style={{ marginTop: 12 }}>Email
        <input value={me.email} disabled />
      </label>
      <div className="kv" style={{ marginTop: 16 }}><span>Member since</span><b>{new Date(me.created_at).toLocaleDateString()}</b></div>
      <div className="kv"><span>Account ID</span><code>{me.id}</code></div>
      <div className="row"><button className="primary" disabled={save.isPending} onClick={() => save.mutate()}>Save profile</button>
        {msg && <span className="muted">{msg}</span>}</div>
    </div>
  );
}

function Security() {
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const change = useMutation({
    mutationFn: () => api('/me/password', { method: 'POST', body: { current_password: f.current, new_password: f.next } }),
    onSuccess: () => { setF({ current: '', next: '', confirm: '' }); setMsg({ text: 'Password updated', bad: false }); },
    onError: e => setMsg({ text: e.status === 422 ? 'New password must be 8 to 128 characters.' : e.message, bad: true }),
  });

  function submit(e) {
    e.preventDefault();
    if (f.next !== f.confirm) return setMsg({ text: 'New passwords do not match.', bad: true });
    change.mutate();
  }
  return (
    <form className="card" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={submit}>
      <h3 style={{ margin: 0 }}>Change password</h3>
      <label>Current password<input type="password" value={f.current} onChange={set('current')} required /></label>
      <label>New password<input type="password" minLength={8} value={f.next} onChange={set('next')} required /></label>
      <label>Confirm new password<input type="password" value={f.confirm} onChange={set('confirm')} required /></label>
      {msg.text && <p className={msg.bad ? 'err' : 'muted'} role="alert">{msg.text}</p>}
      <button className="primary" disabled={change.isPending}>Update password</button>
      <p className="muted">Sessions last 7 days and use a secure, HTTP-only cookie.</p>
    </form>
  );
}