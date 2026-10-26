import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';

export default function LinkList() {
  const { data, isLoading, error } = useQuery({ queryKey: ['links'], queryFn: () => api('/links') });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [copied, setCopied] = useState(null);

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p role="alert" className="err">Couldn't load links.</p>;

  const rows = data.filter(l =>
    (status === 'all' || l.status === status) &&
    `${l.title ?? ''} ${l.short_code} ${l.destination_url}`.toLowerCase().includes(q.toLowerCase()));

  async function copy(l) {
    await navigator.clipboard.writeText(l.short_url);
    setCopied(l.id); setTimeout(() => setCopied(null), 1500);
  }

  return (
    <>
      <div className="row">
        <input placeholder="Search title, code or destination" value={q} onChange={e => setQ(e.target.value)} />
        <select value={status} onChange={e => setStatus(e.target.value)}>
          {['all', 'active', 'inactive', 'expired', 'blocked'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      {rows.length === 0 ? <p>No links yet. <Link to="/new">Create one</Link>.</p> : (
        <table>
          <thead><tr><th>Title / code</th><th>Destination</th><th>Status</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {rows.map(l => (
              <tr key={l.id}>
                <td><Link to={`/links/${l.id}`}>{l.title || l.short_code}</Link><br /><small>{l.short_url}</small></td>
                <td className="trunc" title={l.destination_url}>{l.destination_url}</td>
                <td><span className={`pill ${l.status}`}>{l.status}</span></td>
                <td>{new Date(l.created_at).toLocaleDateString()}</td>
                <td><button onClick={() => copy(l)}>{copied === l.id ? 'Copied' : 'Copy'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}