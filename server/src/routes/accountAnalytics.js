import { z } from 'zod';
import { pool } from '../db.js';

const err = (code, message, details) => ({ error: { code, message, details } });

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  interval: z.enum(['hour', 'day']).default('day'),
  link_id: z.string().uuid().optional(),
});
const MAX_RANGE_MS = 90 * 86400 * 1000;

export default async function (app) {
  app.get('/', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success)
      return reply.code(422).send(err('VALIDATION_ERROR', 'Invalid query', parsed.error.flatten()));

    const owner = req.user.sub;
    const to = parsed.data.to ?? new Date().toISOString();
    const from = parsed.data.from ?? new Date(Date.now() - 7 * 864e5).toISOString();
    const { interval } = parsed.data;
    const linkId = parsed.data.link_id ?? null;

    if (new Date(from) >= new Date(to) || new Date(to) - new Date(from) > MAX_RANGE_MS)
      return reply.code(422).send(err('INVALID_RANGE', 'from must be before to, and the range at most 90 days'));

    if (linkId) {
      const { rowCount } = await pool.query('SELECT 1 FROM links WHERE id=$1 AND owner_id=$2', [linkId, owner]);
      if (!rowCount) return reply.code(404).send(err('LINK_NOT_FOUND', 'Link not found'));
    }

    const scope = `l.owner_id = $1 AND ($4::uuid IS NULL OR l.id = $4::uuid)`;
    const args = [owner, from, to, linkId];
    const step = interval === 'hour' ? '1 hour' : '1 day';

    const [series, breakdowns, uniques, top, recent, last] = await Promise.all([
      pool.query(
        `SELECT g.t, COALESCE(SUM(x.count), 0)::int AS clicks
         FROM generate_series(date_trunc($5::text, $2::timestamptz),
                              $3::timestamptz - interval '1 microsecond', $6::interval) AS g(t)
         LEFT JOIN (
           SELECT a.bucket_start, a.count FROM click_aggregates a JOIN links l ON l.id = a.link_id
           WHERE ${scope} AND a.dimension_type = 'total'
             AND a.bucket_start >= $2 AND a.bucket_start < $3
         ) x ON date_trunc($5::text, x.bucket_start) = g.t
         GROUP BY g.t ORDER BY g.t`,
        [...args, interval, step]),
      pool.query(
        `SELECT a.dimension_type AS type, a.dimension_value AS value, SUM(a.count)::int AS clicks
         FROM click_aggregates a JOIN links l ON l.id = a.link_id
         WHERE ${scope} AND a.dimension_type <> 'total'
           AND a.bucket_start >= $2 AND a.bucket_start < $3
         GROUP BY 1, 2 ORDER BY clicks DESC`, args),
      pool.query(
        `SELECT COUNT(DISTINCT e.visitor_hash)::int AS n
         FROM click_events e JOIN links l ON l.id = e.link_id
         WHERE ${scope.replace(/a\./g, 'e.')} AND e.occurred_at >= $2 AND e.occurred_at < $3`, args),
      pool.query(
        `SELECT l.id, l.short_code, SUM(a.count)::int AS clicks
         FROM click_aggregates a JOIN links l ON l.id = a.link_id
         WHERE ${scope} AND a.dimension_type = 'total'
           AND a.bucket_start >= $2 AND a.bucket_start < $3
         GROUP BY l.id ORDER BY clicks DESC LIMIT 5`, args),
      // coarse fields only: no visitor hash, no raw referrer path
      pool.query(
        `SELECT e.occurred_at, l.short_code, e.country, e.device, e.browser, e.os,
                e.referrer_host, e.bot_classification
         FROM click_events e JOIN links l ON l.id = e.link_id
         WHERE l.owner_id = $1 AND ($2::uuid IS NULL OR l.id = $2::uuid)
         ORDER BY e.occurred_at DESC LIMIT 15`, [owner, linkId]),
      pool.query(
        `SELECT MAX(e.occurred_at) AS last
         FROM click_events e JOIN links l ON l.id = e.link_id
         WHERE l.owner_id = $1 AND ($2::uuid IS NULL OR l.id = $2::uuid)`, [owner, linkId]),
    ]);

    const grouped = {};
    for (const r of breakdowns.rows) {
      (grouped[r.type] ||= []);
      if (grouped[r.type].length < 10) grouped[r.type].push({ value: r.value, clicks: r.clicks });
    }

    return {
      range: { from, to, interval },
      total_clicks: series.rows.reduce((s, r) => s + r.clicks, 0),
      estimated_unique_visitors: uniques.rows[0].n,
      series: series.rows,
      breakdowns: {
        country: grouped.country ?? [], device: grouped.device ?? [], browser: grouped.browser ?? [],
        referrer: grouped.referrer ?? [], bot: grouped.bot ?? [],
      },
      top_links: top.rows,
      recent: recent.rows,
      last_processed_at: last.rows[0].last,
    };
  });
}