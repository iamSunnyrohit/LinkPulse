import { monitorEventLoopDelay } from 'node:perf_hooks';
import { pool } from '../db.js';
import { redis } from '../cache.js';
import { channel } from '../queue.js';
import { register } from '../lib/metrics.js';
import { summarize } from '../lib/stats.js';

const err = (code, message) => ({ error: { code, message } });
const WINDOWS = { '15m': 15, '1h': 60, '24h': 1440 };

const loop = monitorEventLoopDelay({ resolution: 20 });
loop.enable();

async function counterTotal(name) {
  const m = register.getSingleMetric(name);
  if (!m) return 0;
  return (await m.get()).values.reduce((s, v) => s + v.value, 0);
}
async function timed(fn) {
  const t = performance.now();
  try { await fn(); return { ok: true, ms: Math.round((performance.now() - t) * 10) / 10 }; }
  catch { return { ok: false, ms: null }; }
}
async function queueInfo(name) {
  try {
    const q = await channel.checkQueue(name);
    return { ok: true, messages: q.messageCount, consumers: q.consumerCount };
  } catch { return { ok: false, messages: null, consumers: null }; }
}
const requireAdmin = async (req, reply) => {
  if (req.user.role !== 'admin') return reply.code(403).send(err('FORBIDDEN', 'Administrator access required'));
};

export default async function (app) {
  app.get('/', { preHandler: [app.authenticate, requireAdmin] }, async (req) => {
    const range = WINDOWS[req.query.range] ? req.query.range : '1h';
    const [database, cache, clicks, dlq, ev, totals, stream] = await Promise.all([
      timed(() => pool.query('SELECT 1')),
      timed(() => redis.ping()),
      queueInfo('clicks'),
      queueInfo('clicks.dlq'),
      pool.query(`SELECT COUNT(*) FILTER (WHERE occurred_at >= now() - interval '1 hour')::int AS last_hour,
                         COUNT(*)::int AS stored, MAX(occurred_at) AS last FROM click_events`),
      pool.query(`SELECT (SELECT COUNT(*) FROM users)::int AS users, (SELECT COUNT(*) FROM links)::int AS links,
                         (SELECT COUNT(*) FROM links WHERE blocked_at IS NOT NULL)::int AS blocked`),
      // coarse fields only: no visitor hash
      pool.query(`SELECT e.occurred_at, l.short_code, e.country, e.device, e.browser, e.referrer_host, e.bot_classification
                  FROM click_events e JOIN links l ON l.id = e.link_id ORDER BY e.occurred_at DESC LIMIT 20`),
    ]);
    const mem = process.memoryUsage();
    return {
      range,
      traffic: summarize(WINDOWS[range]),
      services: { database, redis: cache, broker: { ok: clicks.ok } },
      queues: { clicks, dlq },
      counters: {
        cache_hits: await counterTotal('cache_hits_total'),
        cache_misses: await counterTotal('cache_misses_total'),
        events_dropped: await counterTotal('events_dropped_total'),
      },
      events: { ...ev.rows[0] },
      totals: totals.rows[0],
      db_pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      runtime: {
        uptime_s: Math.round(process.uptime()),
        heap_used_mb: Math.round(mem.heapUsed / 1048576),
        heap_total_mb: Math.round(mem.heapTotal / 1048576),
        rss_mb: Math.round(mem.rss / 1048576),
        loop_p99_ms: Math.round(loop.percentile(99) / 1e4) / 100,
        loop_mean_ms: Math.round(loop.mean / 1e4) / 100,
      },
      stream: stream.rows,
    };
  });

  app.post('/purge-cache', { preHandler: [app.authenticate, requireAdmin] }, async (req) => {
    let deleted = 0, cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'link:*', 'COUNT', 200);
      cursor = next;
      if (keys.length) deleted += await redis.del(...keys);
    } while (cursor !== '0');
    await pool.query(`INSERT INTO audit_logs(actor, action, target, meta) VALUES($1,'cache.purge','link:*',$2)`,
      [req.user.sub, JSON.stringify({ deleted })]);
    return { deleted };
  });
}