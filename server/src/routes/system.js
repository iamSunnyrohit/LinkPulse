import { pool } from '../db.js';
import { redis } from '../cache.js';
import { channel } from '../queue.js';
import { register } from '../lib/metrics.js';

const err = (code, message) => ({ error: { code, message } });

async function counterTotal(name) {
  const m = register.getSingleMetric(name);
  if (!m) return 0;
  const { values } = await m.get();
  return values.reduce((s, v) => s + v.value, 0);
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

export default async function (app) {
  app.get('/', { preHandler: app.authenticate }, async (req, reply) => {
    if (req.user.role !== 'admin')
      return reply.code(403).send(err('FORBIDDEN', 'Administrator access required'));

    const [database, cache, clicks, dlq, ev, totals] = await Promise.all([
      timed(() => pool.query('SELECT 1')),
      timed(() => redis.ping()),
      queueInfo('clicks'),
      queueInfo('clicks.dlq'),
      pool.query(`SELECT COUNT(*) FILTER (WHERE occurred_at >= now() - interval '1 hour')::int AS last_hour,
                         MAX(occurred_at) AS last FROM click_events`),
      pool.query(`SELECT (SELECT COUNT(*) FROM users)::int AS users, (SELECT COUNT(*) FROM links)::int AS links`),
    ]);

    return {
      services: { database, redis: cache, broker: { ok: clicks.ok } },
      queues: { clicks, dlq },
      counters: {
        cache_hits: await counterTotal('cache_hits_total'),
        cache_misses: await counterTotal('cache_misses_total'),
        events_dropped: await counterTotal('events_dropped_total'),
      },
      events: { last_hour: ev.rows[0].last_hour, last_processed_at: ev.rows[0].last },
      totals: totals.rows[0],
      db_pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      process: { uptime_s: Math.round(process.uptime()), rss_mb: Math.round(process.memoryUsage().rss / 1048576) },
    };
  });
}