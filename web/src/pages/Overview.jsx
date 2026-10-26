import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api.js';

const n = v => Number(v ?? 0).toLocaleString();

export default function Overview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['overview'], queryFn: () => api('/overview'), refetchInterval: 30_000,
  });
  if (isLoading) return <p>Loading…</p>;
  if (error) return <p role="alert" className="err">Couldn't load the overview.</p>;

  const delta = data.clicks_prev_30d
    ? ((data.clicks_30d - data.clicks_prev_30d) / data.clicks_prev_30d) * 100 : null;
  const last = data.last_processed_at ? new Date(data.last_processed_at) : null;
  const max = Math.max(1, ...data.top_links.map(l => l.clicks));

  return (
    <>
      <h1 style={{ marginTop: 0 }}>System overview</h1>
      <div className="cards">
        <div className="card">
          <div className="k">Total clicks (30d)</div>
          <div className="big">{n(data.clicks_30d)}</div>
          {delta === null ? <span className="muted">No previous period</span>
            : <span className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% vs previous 30 days</span>}
        </div>
        <div className="card">
          <div className="k">Active links</div>
          <div className="big">{n(data.links.active)}</div>
          <span className="muted">of {n(data.links.total)} total</span>
        </div>
        <div className="card">
          <div className="k">Estimated unique visitors</div>
          <div className="big">~{n(data.unique_visitors_30d)}</div>
          <span className="muted">Pseudonymous, approximate</span>
        </div>
        <div className="card">
          <div className="k">Expiring &lt; 7 days</div>
          <div className="big">{data.links.expiring}</div>
          <span className="muted">{last ? `Last event processed ${last.toLocaleTimeString()}` : 'No events processed yet'}</span>
        </div>
      </div>

      <div className="card">
        <h2 style={{ margin: '0 0 4px' }}>Clicks over the last 30 days</h2>
        <p className="muted" style={{ marginTop: 0 }}>Successful redirect requests, not verified human visits.</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.series}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eadfc7" />
            <XAxis dataKey="t" tickFormatter={t => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })} />
            <YAxis allowDecimals={false} />
            <Tooltip labelFormatter={t => new Date(t).toLocaleDateString()} />
            <Bar dataKey="clicks" fill="#6b9bbf" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="row between"><h2 style={{ margin: 0 }}>Top performing links</h2><Link to="/links">View all links →</Link></div>
        {data.top_links.length === 0 ? <p className="muted">No clicks yet.</p> : (
          <table>
            <thead><tr><th>Short link</th><th>Destination</th><th>Clicks (30d)</th></tr></thead>
            <tbody>
              {data.top_links.map(l => (
                <tr key={l.id}>
                  <td><Link className="code" to={`/links/${l.id}`}>/{l.short_code}</Link></td>
                  <td><div className="trunc">{l.destination_url}</div></td>
                  <td style={{ width: 220 }}><span className="num">{n(l.clicks)}</span><div className="bar"><i style={{ width: `${(l.clicks / max) * 100}%` }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}