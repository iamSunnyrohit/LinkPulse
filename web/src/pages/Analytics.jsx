import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api.js';
import Breakdown from '../components/Breakdown.jsx';

const RANGES = {
  '24h': { ms: 864e5, interval: 'hour' },
  '7d': { ms: 7 * 864e5, interval: 'day' },
  '30d': { ms: 30 * 864e5, interval: 'day' },
};
const n = v => Number(v ?? 0).toLocaleString();

export default function Analytics() {
  const [range, setRange] = useState('7d');
  const [linkId, setLinkId] = useState('');
  const links = useQuery({ queryKey: ['links'], queryFn: () => api('/links') });
  const { data, isLoading, error } = useQuery({
    queryKey: ['account-analytics', range, linkId],
    queryFn: () => {
      const { ms, interval } = RANGES[range];
      const qs = new URLSearchParams({
        from: new Date(Date.now() - ms).toISOString(), to: new Date().toISOString(), interval,
      });
      if (linkId) qs.set('link_id', linkId);
      return api(`/analytics?${qs}`);
    },
    refetchInterval: 30_000,
  });

  const fmt = t => new Date(t).toLocaleString([], RANGES[range].interval === 'hour'
    ? { hour: 'numeric' } : { month: 'short', day: 'numeric' });

  return (
    <>
      <div className="row between">
        <h1 style={{ margin: 0 }}>Analytics</h1>
        <div className="row" style={{ margin: 0 }}>
          <select value={linkId} onChange={e => setLinkId(e.target.value)}>
            <option value="">All links</option>
            {links.data?.map(l => <option key={l.id} value={l.id}>/{l.short_code}</option>)}
          </select>
          <div className="tabs">
            {Object.keys(RANGES).map(r =>
              <button key={r} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>)}
          </div>
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
  const lag = last ? (Date.now() - last) / 1000 : null;
  const bots = data.breakdowns.bot.find(r => r.value === 'known_bot')?.clicks ?? 0;

  return (
    <>
      <div className="cards" style={{ marginTop: 16 }}>
        <div className="card"><div className="k">Total clicks</div><div className="big">{n(data.total_clicks)}</div>
          <span className="muted">Successful redirects, not verified humans</span></div>
        <div className="card"><div className="k">Est. unique visitors</div><div className="big">~{n(data.estimated_unique_visitors)}</div>
          <span className="muted">Pseudonymous, approximate</span></div>
        <div className="card"><div className="k">Known bot clicks</div><div className="big">{n(bots)}</div>
          <span className="muted">Shown separately when identifiable</span></div>
        <div className="card"><div className="k">Freshness</div>
          <div className="big" style={{ fontSize: 18 }}>{last ? last.toLocaleTimeString() : '—'}</div>
          <span className={lag > 60 ? 'down' : 'muted'}>
            {last ? (lag > 60 ? 'Processing may be delayed' : 'Last event processed') : 'No events processed yet'}</span></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Click volume</h3>
        {data.total_clicks === 0 ? <p className="muted">No clicks in this period yet.</p> : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eadfc7" />
              <XAxis dataKey="t" tickFormatter={fmt} />
              <YAxis allowDecimals={false} />
              <Tooltip labelFormatter={fmt} />
              <Area dataKey="clicks" stroke="#4f7fa3" fill="#6b9bbf" fillOpacity={0.25} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <div className="grid" style={{ marginTop: 0 }}>
          {[['referrer', 'Top referrers'], ['country', 'Countries'], ['device', 'Devices'], ['browser', 'Browsers']].map(([k, t]) =>
            <Breakdown key={k} title={t} rows={data.breakdowns[k]} />)}
        </div>
      </div>

      <div className="card">
        <Breakdown title="Top links" rows={data.top_links.map(l => ({ value: `/${l.short_code}`, clicks: l.clicks }))} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <h3 style={{ padding: '16px 16px 0', margin: 0 }}>Recent clicks</h3>
        {data.recent.length === 0 ? <p className="muted" style={{ padding: 16 }}>No clicks yet.</p> : (
          <table>
            <thead><tr><th>Time</th><th>Link</th><th>Country</th><th>Referrer</th><th>Device / OS / Browser</th></tr></thead>
            <tbody>{data.recent.map((r, i) => (
              <tr key={i}>
                <td className="muted">{new Date(r.occurred_at).toLocaleTimeString()}</td>
                <td className="code">/{r.short_code}</td>
                <td>{r.country === 'unknown' ? '—' : r.country}</td>
                <td>{r.referrer_host === 'unknown' ? 'Direct' : r.referrer_host}</td>
                <td>{[r.device, r.os, r.browser].map(v => v === 'unknown' ? '—' : v).join(' · ')}
                  {r.bot_classification === 'known_bot' && <span className="pill inactive" style={{ marginLeft: 8 }}>bot</span>}</td>
              </tr>))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}