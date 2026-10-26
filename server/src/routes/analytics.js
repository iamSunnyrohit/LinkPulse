import { z } from 'zod';
import { pool } from '../db.js';

const err = (code, message, details) => ({ error: { code, message, details } });

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  interval: z.enum(['hour', 'day']).default('day'),
});

const MAX_RANGE_MS = 90 * 86400 * 1000;

export default async function (app) {
  app.get('/:id/analytics', { preHandler: app.authenticate }, async (req, reply) => {
    const q = querySchema.safeParse(req.query);
    if (!q.success)
      return reply.code(422).send(err('VALIDATION_ERROR', 'Invalid query', q.error.flatten()));

    const to = q.data.to ?? new Date().toISOString();
    const from = q.data.from ?? new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const { interval } = q.data;
    if (new Date(from) >= new Date(to) || new Date(to) - new Date(from) > MAX_RANGE_MS)
      return reply.code(422).send(err('INVALID_RANGE', 'from must be before to, and the range at most 90 days'));

    // Owner or admin only; anyone else gets 404 so existence is not revealed
    const { rows: [link] } = await pool.query(
      `SELECT id, short_code FROM links WHERE id=$1 AND (owner_id=$2 OR $3='admin')`,
      [req.params.id, req.user.sub, req.user.role]);
    if (!link) return reply.code(404).send(err('LINK_NOT_FOUND', 'Link not found'));

    const step = interval === 'hour' ? '1 hour' : '1 day';

    const [series, breakdowns, uniques, last] = await Promise.all([
      // zero-filled so the chart has no gaps; from is inclusive, to is exclusive
      pool.query(
        `SELECT g.t, COALESCE(SUM(a.count), 0)::int AS clicks
         FROM generate_series(date_trunc($4::text, $2::timestamptz),
                              $3::timestamptz - interval '1 microsecond',
                              $5::interval) AS g(t)
         LEFT JOIN click_aggregates a
           ON a.link_id = $1 AND a.dimension_type = 'total'
          AND a.bucket_start >= $2 AND a.bucket_start < $3
          AND date_trunc($4::text, a.bucket_start) = g.t
         GROUP BY g.t ORDER BY g.t`,
        [link.id, from, to, interval, step]),
      pool.query(
        `SELECT dimension_type AS type, dimension_value AS value, SUM(count)::int AS clicks
         FROM click_aggregates
         WHERE link_id=$1 AND dimension_type <> 'total'
           AND bucket_start >= $2 AND bucket_start < $3
         GROUP BY 1, 2 ORDER BY clicks DESC`,
        [link.id, from, to]),
      // distinct over the whole period, never a sum of per-day uniques
      pool.query(
        `SELECT COUNT(DISTINCT visitor_hash)::int AS n FROM click_events
         WHERE link_id=$1 AND occurred_at >= $2 AND occurred_at < $3`,
        [link.id, from, to]),
      pool.query(`SELECT MAX(occurred_at) AS last FROM click_events WHERE link_id=$1`, [link.id]),
    ]);

    const grouped = {};
    for (const r of breakdowns.rows) {
      (grouped[r.type] ||= []);
      if (grouped[r.type].length < 10) grouped[r.type].push({ value: r.value, clicks: r.clicks });
    }

    return {
      link_id: link.id,
      range: { from, to, interval },
      total_clicks: series.rows.reduce((s, r) => s + r.clicks, 0),
      estimated_unique_visitors: uniques.rows[0].n,
      series: series.rows.map(r => ({ t: r.t, clicks: r.clicks })),
      breakdowns: {
        country: grouped.country ?? [],
        device: grouped.device ?? [],
        browser: grouped.browser ?? [],
        referrer: grouped.referrer ?? [],
        bot: grouped.bot ?? [],
      },
      last_processed_at: last.rows[0].last,
    };
  });
}
