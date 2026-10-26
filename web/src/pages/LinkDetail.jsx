import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api.js';

const RANGES = {
  '24h': { ms: 864e5, interval: 'hour' },
  '7d': { ms: 7 * 864e5, interval: 'day' },
  '30d': { ms: 30 * 864e5, interval: 'day' },
};

export default function LinkDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: link, isLoading, error } = useQuery({ queryKey: ['link', id], queryFn: () => api(`/links/${id}`) });
  const [dest, setDest] = useState('');
  const [msg, setMsg] = useState('');

  const patch = useMutation({
    mutationFn: body => api(`/links/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['link', id] }); qc.invalidateQueries({ queryKey: ['links'] }); setMsg('Saved'); },
    onError: e => setMsg(e.details?.fieldErrors?.destination_url?.[0] || e.message),
  });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p role="alert" className="err">Link not found.</p>;

  return (
    <>
      <div className="card">
        <h1>{link.title || link.short_code} <span className={`pill ${link.status}`}>{link.status}</span></h1>
        <p><a href={link.short_url} target="_blank" rel="noreferrer">{link.short_url}</a>{' '}
          <button onClick={() => navigator.clipboard.writeText(link.short_url)}>Copy</button></p>
        <div className="row">
          <input defaultValue={link.destination_url} onChange={e => setDest(e.target.value)} />
          <button disabled={!dest} onClick={() => patch.mutate({ destination_url: dest })}>Update destination</button>
        </div>
        <div className="row">
          {link.status === 'blocked'
            ? <p className="muted">This link was blocked by an administrator.</p>
            : <button onClick={() => patch.mutate({ is_active: link.status === 'inactive' })}>
                {link.status === 'inactive' ? 'Reactivate' : 'Deactivate'}</button>}
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
    <div className="card">
      <div className="row between">
        <h2>Analytics</h2>
        <div>{Object.keys(RANGES).map(r =>
          <button key={r} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>)}</div>
      </div>
      {isLoading && <p>Loading…</p>}
      {error && <p role="alert" className="err">Couldn't load analytics.</p>}
      {data && <Body data={data} fmt={fmt} />}
    </div>
  );
}

function Body({ data, fmt }) {
  const last = data.last_processed_at ? new Date(data.last_processed_at) : null;
  const lagSec = last ? (Date.now() - last) / 1000 : null;
  return (
    <>
      <div className="stats">
        <div><b>{data.total_clicks}</b><span>Total clicks</span></div>
        <div><b>~{data.estimated_unique_visitors}</b><span>Est. unique visitors</span></div>
      </div>
      {data.total_clicks === 0 ? <p className="muted">No clicks in this period yet.</p> : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data.series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" tickFormatter={fmt} />
            <YAxis allowDecimals={false} />
            <Tooltip labelFormatter={fmt} />
            <Line dataKey="clicks" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
      <div className="grid">
        {[['country', 'Countries'], ['device', 'Devices'], ['browser', 'Browsers'], ['referrer', 'Referrers']].map(([k, title]) =>
          <Breakdown key={k} title={title} rows={data.breakdowns[k]} />)}
      </div>
      <h3>Traffic classification</h3>
      <Breakdown title="" rows={data.breakdowns.bot.map(r => ({
        value: r.value === 'known_bot' ? 'Known bots' : 'Not identified as a bot', clicks: r.clicks }))} />
      <small className="muted">
        {last ? `Last processed: ${last.toLocaleString()}` : 'No events processed yet'}
        {lagSec > 60 && ' · processing may be delayed'}
      </small>
    </>
  );
}

function Breakdown({ title, rows }) {
  return (
    <div>
      {title && <h3>{title}</h3>}
      {rows.length === 0 ? <p className="muted">No data</p> : (
        <table><tbody>{rows.map(r =>
          <tr key={r.value}><td>{r.value === 'unknown' ? 'Unknown / direct' : r.value}</td><td>{r.clicks}</td></tr>)}</tbody></table>
      )}
    </div>
  );
}