import { pool } from './db.js';
import { redis } from './cache.js';
import { channel } from './queue.js';
import { buildEvent } from './lib/event.js';
import { metrics } from './lib/metrics.js';
import { record } from './lib/stats.js';

const TTL = 60;
const NEG_TTL = 10;
const PUBLISH_BUDGET_MS = 20;
const inflight = new Map();   

async function getLink(code) {
  try {
    const hit = await redis.get(`link:${code}`);
    if (hit) {
      metrics.cacheHits.inc();
      return hit === 'null' ? null : JSON.parse(hit);
    }
  } catch { /* Redis down: fall through to the database */ }

  metrics.cacheMisses.inc();
  if (inflight.has(code)) return inflight.get(code);

  const p = (async () => {
    const { rows } = await pool.query(
      `SELECT id, short_code, destination_url, is_active, blocked_at, expires_at, version
       FROM links WHERE short_code = $1`, [code]);
    const link = rows[0] || null;
    redis.set(`link:${code}`, JSON.stringify(link), 'EX', link ? TTL : NEG_TTL).catch(() => {});
    return link;
  })().finally(() => inflight.delete(code));

  inflight.set(code, p);
  return p;
}

function publishWithBudget(evt) {
  const send = new Promise((resolve, reject) =>
    channel.sendToQueue('clicks', Buffer.from(JSON.stringify(evt)), { persistent: true },
      (e) => (e ? reject(e) : resolve())));
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('publish timeout')), PUBLISH_BUDGET_MS));
  return Promise.race([send, timeout]);
}

export default async function (app) {
  app.addHook('onResponse', async (req, reply) => { record(reply.elapsedTime, reply.statusCode); });
  app.get('/:code', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { code } = req.params;

    if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) return reply.code(404).send('Link not found');

    let link;
    try { link = await getLink(code); }
    catch (e) {
      req.log.error(e);
      return reply.code(503).send('Service unavailable');  
    }

    if (!link) return reply.code(404).send('Link not found');
    if (link.blocked_at || !link.is_active) return reply.code(403).send('This link is unavailable');
    if (link.expires_at && new Date(link.expires_at) <= new Date()) return reply.code(410).send('This link has expired');

    // HEAD requests (Fastify auto-creates them from GET) are not counted as clicks
    if (req.method === 'GET') {
      try {
        publishWithBudget(buildEvent(req, link)).catch(() => metrics.droppedEvents.inc());
      } catch { metrics.droppedEvents.inc(); }
    }

    return reply.redirect(link.destination_url, 302);
  });
}