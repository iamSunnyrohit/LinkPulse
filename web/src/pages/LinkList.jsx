import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';

const n = v => Number(v ?? 0).toLocaleString();
const soon = l => l.expires_at && new Date(l.expires_at) > new Date() &&
  new Date(l.expires_at) < new Date(Date.now() + 7 * 864e5);

export default function LinkList() {
  const { data, isLoading, error } = useQuery({ queryKey: ['links'], queryFn: () => api('/links') });
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('clicks');
  const [copied, setCopied] = useState(null);

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p role="alert" className="err">Couldn't load links.</p>;

  const tabs = {
    all: () => true,
    active: l => l.status === 'active',
    expiring: soon,
    deactivated: l => l.status === 'inactive' || l.status === 'expired',
  };
  const rows = data
    .filter(tabs[tab])
    .filter(l => `${l.title ?? ''} ${l.short_code} ${l.destination_url}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === 'clicks' ? b.clicks_7d - a.clicks_7d : new Date(b.created_at) - new Date(a.created_at));

  async function copy(l) {
    await navigator.clipboard.writeText(l.short_url);
    setCopied(l.id); setTimeout(() => setCopied(null), 1500);
  }

  return (
    <>
      <div className="cards">
        <div className="card"><div className="k">Total links</div><div className="big">{n(data.length)}</div></div>
        <div className="card"><div className="k">Redirects (7 days)</div><div className="big">{n(data.reduce((s, l) => s + l.clicks_7d, 0))}</div></div>
        <div className="card"><div className="k">Expiring &lt; 7 days</div><div className="big">{data.filter(soon).length}</div></div>
      </div>

      <div className="card">
        <div className="row">
          <input placeholder="Filter by alias, destination or title" value={q} onChange={e => setQ(e.target.value)} />
          <select value={sort} onChange={e => setSort(e.target.value)}>
            <option value="clicks">Sort: Most clicked (7d)</option>
            <option value="new">Sort: Newest</option>
          </select>
        </div>
        <div className="tabs">
          {[['all', 'All'], ['active', 'Active'], ['expiring', 'Expiring soon'], ['deactivated', 'Inactive / expired']].map(([k, label]) =>
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {label} {data.filter(tabs[k]).length}
            </button>)}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {rows.length === 0 ? <p style={{ padding: 20 }}>No links match. <Link to="/new">Create one</Link>.</p> : (
          <table>
            <thead><tr><th>Short link &amp; destination</th><th>Status</th><th>Clicks (7d)</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.id}>
                  <td>
                    <Link to={`/links/${l.id}`} className={`code ${l.status !== 'active' ? 'dim' : ''}`}>{l.short_url.replace(/^https?:\/\//, '')}</Link>
                    <div className="trunc" title={l.destination_url}>↳ {l.destination_url}</div>
                  </td>
                  <td><span className={`pill ${l.status}`}>{l.status}</span></td>
                  <td className="num">{n(l.clicks_7d)}</td>
                  <td className="muted">{l.expires_at ? new Date(l.expires_at).toLocaleDateString() : 'Never'}</td>
                  <td><button onClick={() => copy(l)}>{copied === l.id ? 'Copied' : 'Copy'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}