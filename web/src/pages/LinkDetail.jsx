import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api.js';
import Breakdown from '../components/Breakdown.jsx';

const RANGES = {
  '24h': { ms: 864e5, interval: 'hour' },
  '7d': { ms: 7 * 864e5, interval: 'day' },
  '30d': { ms: 30 * 864e5, interval: 'day' },
};
const n = v => Number(v ?? 0).toLocaleString();

export default function LinkDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: link, isLoading, error } = useQuery({ queryKey: ['link', id], queryFn: () => api(`/links/${id}`) });
  const [dest, setDest] = useState('');
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const patch = useMutation({
    mutationFn: body => api(`/links/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      ['link', 'links', 'overview', 'account-analytics'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      setMsg('Saved');
    },
    onError: e => setMsg(e.details?.fieldErrors?.destination_url?.[0] || e.message),
  });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p role="alert" className="err">Link not found.</p>;

  async function copy() {
    await navigator.clipboard.writeText(link.short_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <p className="muted" style={{ margin: '0 0 8px' }}><Link to="/links">← All links</Link></p>
      <div className="card">
        <div className="row between" style={{ margin: 0 }}>
          <h1 style={{ margin: 0 }}>
            {link.title || link.short_code} <span className={`pill ${link.status}`}>{link.status}</span>
          </h1>
          <div className="row" style={{ margin: 0 }}>
            <Link className="btn" to={`/routing?link=${link.id}`}>Configure</Link>
            <button onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
          </div>
        </div>
        <p>
          <a className="code" href={link.short_url} target="_blank" rel="noreferrer">{link.short_url}</a>
          <span className="muted">
            {' · '}created {new Date(link.created_at).toLocaleDateString()}
            {' · '}{link.expires_at ? `expires ${new Date(link.expires_at).toLocaleString()}` : 'no expiration'}
          </span>
        </p>
        <div className="row">
          <input defaultValue={link.destination_url} onChange={e => setDest(e.target.value)} />
          <button className="primary" disabled={!dest} onClick={() => patch.mutate({ destination_url: dest })}>
            Update destination
          </button>
        </div>
        <div className="row">
          {link.status === 'blocked'
            ? <p className="muted">This link was blocked by an administrator.</p>
            : <button onClick={() => patch.mutate({ is_active: link.status === 'inactive' })}>
                {link.status === 'inactive' ? 'Reactivate' : 'Deactivate'}
              </button>}
          {link.expires_at && <button onClick={() => patch.mutate({ expires_at: null })}>Remove expiration</button>}
        </div>
        {msg && <p className="muted">{msg}</p>}
      </div>
      <Analytics id={id} />
    </>
  );
}

function Analytics({ id }) {
  const [range, setRange] = useState('7d');
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', id, range],
    queryFn: () => {
      const { ms, interval } = RANGES[range];
      const to = new Date().toISOString();
      const from = new Date(Date.now() - ms).toISOString();
      return api(`/links/${id}/analytics?from=${from}&to=${to}&interval=${interval}`);
    },
    refetchInterval: 30_000,
  });

  const fmt = t => new Date(t).toLocaleString([], RANGES[range].interval === 'hour'
    ? { hour: 'numeric' } : { month: 'short', day: 'numeric' });

  return (
    <>
      <div className="row between">
        <h2 style={{ margin: 0 }}>Analytics</h2>
        <div className="tabs">
          {Object.keys(RANGES).map(r =>
            <button key={r} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>)}
        </div>
      </div>
      {isLoading && <p>Loading…</p>}
      {error && <p role="alert" className="err">Couldn't load analytics.</p>}
      {data && <Body data={data} fmt={fmt} />}
    </>
  );
}

function Body({ data, fmt }) {
  const last = data.last_processed_at ? new Date(data.last_processed_at) : null;
  const lagSec = last ? (Date.now() - last) / 1000 : null;
  const bots = data.breakdowns.bot.find(r => r.value === 'known_bot')?.clicks ?? 0;

  return (
    <>
      <div className="cards">
        <div className="card"><div className="k">Total clicks</div><div className="big">{n(data.total_clicks)}</div>
          <span className="muted">Successful redirects, not verified humans</span></div>
        <div className="card"><div className="k">Est. unique visitors</div><div className="big">~{n(data.estimated_unique_visitors)}</div>
          <span className="muted">Pseudonymous, approximate</span></div>
        <div className="card"><div className="k">Known bot clicks</div><div className="big">{n(bots)}</div>
          <span className="muted">Shown separately when identifiable</span></div>
        <div className="card"><div className="k">Freshness</div>
          <div className="big" style={{ fontSize: 18 }}>{last ? last.toLocaleTimeString() : '—'}</div>
          <span className={lagSec > 60 ? 'down' : 'muted'}>
            {last ? (lagSec > 60 ? 'Processing may be delayed' : 'Last event processed') : 'No events processed yet'}
          </span></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Clicks over time</h3>
        {data.total_clicks === 0 ? <p className="muted">No clicks in this period yet.</p> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eadfc7" />
              <XAxis dataKey="t" tickFormatter={fmt} />
              <YAxis allowDecimals={false} />
              <Tooltip labelFormatter={fmt} />
              <Line dataKey="clicks" dot={false} strokeWidth={2} stroke="#6b9bbf" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <div className="grid" style={{ marginTop: 0 }}>
          {[['referrer', 'Top referrers'], ['country', 'Countries'], ['device', 'Devices'], ['browser', 'Browsers']].map(([k, title]) =>
            <Breakdown key={k} title={title} rows={data.breakdowns[k]} />)}
        </div>
      </div>

      <div className="card">
        <Breakdown title="Traffic classification" rows={data.breakdowns.bot.map(r => ({
          value: r.value === 'known_bot' ? 'Known bots' : 'Not identified as a bot', clicks: r.clicks }))} />
      </div>
    </>
  );
}