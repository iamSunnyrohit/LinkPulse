import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api.js';

const n = v => (v == null ? '—' : Number(v).toLocaleString());
const ms = v => (v == null ? '—' : `${v} ms`);
const Dot = ({ s }) => <span className={`dot ${s}`} />;

export default function Telemetry() {
  const [range, setRange] = useState('1h');
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['system', range], queryFn: () => api(`/system?range=${range}`),
    refetchInterval: 5000, retry: false,
  });
  const purge = useMutation({
    mutationFn: () => api('/system/purge-cache', { method: 'POST' }),
    onSuccess: r => setMsg(`Purged ${r.deleted} cached link${r.deleted === 1 ? '' : 's'}. Next requests refill from PostgreSQL.`),
    onError: e => setMsg(e.message),
  });

  if (isLoading) return <p>Loading…</p>;
  if (error?.status === 403)
    return <div className="card"><h2 style={{ marginTop: 0 }}>Administrator access required</h2>
      <p className="muted">System telemetry is restricted to admin accounts.</p></div>;
  if (error) return <p role="alert" className="err">Couldn't load telemetry.</p>;

  const { traffic: t, services, queues, counters, events, totals, db_pool, runtime, stream } = data;
  const lookups = counters.cache_hits + counters.cache_misses;
  const hit = lookups ? (counters.cache_hits / lookups) * 100 : null;
  const last = events.last ? new Date(events.last) : null;
  const lag = last ? Math.round((Date.now() - last) / 1000) : null;
  const limited = t.statuses[429] ?? 0;

  const warnings = [];
  if (!services.database.ok) warnings.push('Database is unreachable.');
  if (!services.redis.ok) warnings.push('Redis is down; redirects are falling back to the database.');
  if (!services.broker.ok) warnings.push('RabbitMQ is unreachable; click events are being dropped.');
  if (services.broker.ok && queues.clicks.consumers === 0) warnings.push('No worker is connected; queued clicks will not be processed.');
  if (queues.dlq.messages > 0) warnings.push(`${queues.dlq.messages} event(s) in the dead-letter queue need inspection.`);
  if (counters.events_dropped > 0) warnings.push(`${counters.events_dropped} click event(s) dropped since the API started.`);

  const rows = stream.filter(r => !filter || `${r.short_code} ${r.country} ${r.browser} ${r.referrer_host}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <div className="row between">
        <div>
          <div className="k">Platform / Edge telemetry</div>
          <h1 style={{ margin: '4px 0' }}>System telemetry</h1>
        </div>
        <div className="row" style={{ margin: 0 }}>
          <div className="tabs">
            {['15m', '1h', '24h'].map(r => <button key={r} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>)}
          </div>
          <span className="pill active"><Dot s={isFetching ? 'warn' : 'ok'} />Live · 5s</span>
          <button className="danger" disabled={purge.isPending}
            onClick={() => window.confirm('Purge the whole Redis link cache? Redirects will briefly hit PostgreSQL.') && purge.mutate()}>
            Purge link cache</button>
        </div>
      </div>
      {msg && <div className="warnbox" style={{ background: 'var(--teal-bg)', color: 'var(--teal)' }}>{msg}</div>}
      {warnings.map(w => <div key={w} className="warnbox">{w}</div>)}

      <div className="strip">
        <span><Dot s="ok" />{n(totals.links)} links</span>
        <span>{hit == null ? 'cache n/a' : `${hit.toFixed(1)}% cache hit`}</span>
        <span>p99 {t.p99 == null ? '—' : `≤ ${t.p99} ms`}</span>
      </div>

      <div className="cards">
        <div className="card">
          <div className="k">Redirect throughput</div>
          <div className="big">{t.rps_avg.toFixed(2)}<small> req/s</small></div>
          <ResponsiveContainer width="100%" height={50}>
            <AreaChart data={t.series}><Area dataKey="n" stroke="#4f7fa3" fill="#6b9bbf" fillOpacity={0.25} /></AreaChart>
          </ResponsiveContainer>
          <span className="muted">{n(t.count)} requests · peak {n(t.peak_rpm)}/min</span>
        </div>
        <div className="card">
          <div className="k">Redirect latency</div>
          <div className="big">{t.p50 ?? '—'}<small> / </small>{t.p95 ?? '—'}<small> / </small>{t.p99 ?? '—'}<small> ms</small></div>
          <div className="tiles3"><div><span>p50</span><b>{ms(t.p50)}</b></div><div><span>p95</span><b>{ms(t.p95)}</b></div><div><span>p99</span><b>{ms(t.p99)}</b></div></div>
          <span className="muted">PRD target: cached p95 ≤ 50 ms. Bucket upper bounds.</span>
        </div>
        <div className="card">
          <div className="k">Cache</div>
          <div className="big">{hit == null ? '—' : `${hit.toFixed(1)}%`}</div>
          <span className="muted">{n(counters.cache_hits)} hits · {n(counters.cache_misses)} misses since API start</span>
          <div className="bar" style={{ marginTop: 10 }}><i style={{ width: `${hit ?? 0}%` }} /></div>
          <span className="muted">PRD target ≥ 95% in steady state</span>
        </div>
        <div className="card">
          <div className="k">Ingest queue</div>
          <div className="big">{n(queues.clicks.messages)}<small> waiting</small></div>
          <span className="muted">{lag == null ? 'No events yet' : `Last event processed ${lag}s ago`}</span>
          <div className="kv"><span>Stored events (30d retention)</span><b>{n(events.stored)}</b></div>
          <div className="kv"><span>Events last hour</span><b>{n(events.last_hour)}</b></div>
        </div>
      </div>

      <div className="two" style={{ marginTop: 20 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Component health</h3>
          <div className="tiles2">
            <div className="tile"><div className="k"><Dot s={services.database.ok ? 'ok' : 'bad'} />PostgreSQL</div>
              <b>{ms(services.database.ms)}</b><span className="muted">pool {db_pool.idle}/{db_pool.total} idle · {db_pool.waiting} waiting</span></div>
            <div className="tile"><div className="k"><Dot s={services.redis.ok ? 'ok' : 'bad'} />Redis</div>
              <b>{ms(services.redis.ms)}</b><span className="muted">link metadata cache, 60s TTL</span></div>
            <div className="tile"><div className="k"><Dot s={services.broker.ok ? 'ok' : 'bad'} />RabbitMQ</div>
              <b>{n(queues.clicks.messages)} queued</b><span className="muted">durable queue with dead-letter routing</span></div>
            <div className="tile"><div className="k"><Dot s={queues.clicks.consumers > 0 ? 'ok' : 'warn'} />Analytics worker</div>
              <b>{n(queues.clicks.consumers)} consumer{queues.clicks.consumers === 1 ? '' : 's'}</b><span className="muted">idempotent, retries with backoff</span></div>
          </div>
          <h3>Redirect latency distribution</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={t.histogram}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eadfc7" />
              <XAxis dataKey="bucket" /><YAxis allowDecimals={false} /><Tooltip />
              <Bar dataKey="count" fill="#6b9bbf" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <span className="muted">Milliseconds, measured from request received to response sent.</span>
        </div>

        <div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Node runtime</h3>
            <div className="kv"><span>Heap used</span><b>{runtime.heap_used_mb} / {runtime.heap_total_mb} MB</b></div>
            <div className="bar"><i style={{ width: `${(runtime.heap_used_mb / runtime.heap_total_mb) * 100}%` }} /></div>
            <div className="kv"><span>Resident memory</span><b>{runtime.rss_mb} MB</b></div>
            <div className="kv"><span>Event-loop delay (mean / p99)</span><b>{runtime.loop_mean_ms} / {runtime.loop_p99_ms} ms</b></div>
            <div className="kv"><span>API uptime</span><b>{Math.floor(runtime.uptime_s / 60)} min</b></div>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Abuse and loss</h3>
            <div className="kv"><span><Dot s={counters.events_dropped > 0 ? 'warn' : 'ok'} />Dropped events</span><b>{n(counters.events_dropped)}</b></div>
            <div className="kv"><span><Dot s={queues.dlq.messages > 0 ? 'warn' : 'ok'} />Dead-letter queue</span><b>{n(queues.dlq.messages)}</b></div>
            <div className="kv"><span>Rate-limited (429)</span><b>{n(limited)}</b></div>
            <div className="kv"><span>Admin-blocked links</span><b>{n(totals.blocked)}</b></div>
            <p className="muted" style={{ marginBottom: 0 }}>The PRD targets high completeness, not zero loss. Drops are counted, never hidden.</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="row between" style={{ padding: '16px 16px 0' }}>
          <div><h3 style={{ margin: 0 }}>Live click ingestion</h3><span className="muted">Latest processed events. Coarse fields only, no visitor hashes.</span></div>
          <input placeholder="Filter by slug, country, browser or referrer" value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: 320 }} />
        </div>
        {rows.length === 0 ? <p className="muted" style={{ padding: 16 }}>No events match.</p> : (
          <table className="mono">
            <thead><tr><th>Time</th><th>Slug</th><th>Country</th><th>Device</th><th>Browser</th><th>Referrer</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}>
                <td>{new Date(r.occurred_at).toLocaleTimeString()}</td>
                <td className="code">/{r.short_code}</td>
                <td>{r.country === 'unknown' ? '—' : r.country}</td>
                <td>{r.device === 'unknown' ? '—' : r.device}</td>
                <td>{r.browser === 'unknown' ? '—' : r.browser}{r.bot_classification === 'known_bot' && <span className="pill inactive" style={{ marginLeft: 8 }}>bot</span>}</td>
                <td>{r.referrer_host === 'unknown' ? 'Direct' : r.referrer_host}</td>
              </tr>))}
            </tbody>
          </table>
        )}
        <div className="foot muted">Queue: {n(queues.clicks.messages)} buffered · {n(counters.events_dropped)} dropped · {n(queues.dlq.messages)} dead-lettered</div>
      </div>
    </>
  );
}