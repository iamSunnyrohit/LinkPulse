import { pool } from '../db.js';

export default async function (app) {
  app.get('/', { preHandler: app.authenticate }, async (req) => {
    const owner = req.user.sub;
    const [clicks, series, top, uniques, links, fresh] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(a.count) FILTER (WHERE a.bucket_start >= now() - interval '30 days'), 0)::int AS cur,
                COALESCE(SUM(a.count) FILTER (WHERE a.bucket_start <  now() - interval '30 days'), 0)::int AS prev
         FROM click_aggregates a JOIN links l ON l.id = a.link_id
         WHERE l.owner_id = $1 AND a.dimension_type = 'total' AND a.bucket_start >= now() - interval '60 days'`, [owner]),
      pool.query(
        `SELECT g.t, COALESCE(SUM(a.count), 0)::int AS clicks
         FROM generate_series(date_trunc('day', now() - interval '29 days'), date_trunc('day', now()), interval '1 day') g(t)
         LEFT JOIN (SELECT a.* FROM click_aggregates a JOIN links l ON l.id = a.link_id
                    WHERE l.owner_id = $1 AND a.dimension_type = 'total') a
           ON date_trunc('day', a.bucket_start) = g.t
         GROUP BY g.t ORDER BY g.t`, [owner]),
      pool.query(
        `SELECT l.id, l.short_code, l.destination_url, SUM(a.count)::int AS clicks
         FROM click_aggregates a JOIN links l ON l.id = a.link_id
         WHERE l.owner_id = $1 AND a.dimension_type = 'total' AND a.bucket_start >= now() - interval '30 days'
         GROUP BY l.id ORDER BY clicks DESC LIMIT 5`, [owner]),
      pool.query(
        `SELECT COUNT(DISTINCT e.visitor_hash)::int AS n
         FROM click_events e JOIN links l ON l.id = e.link_id
         WHERE l.owner_id = $1 AND e.occurred_at >= now() - interval '30 days'`, [owner]),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE is_active AND blocked_at IS NULL AND (expires_at IS NULL OR expires_at > now()))::int AS active,
                COUNT(*) FILTER (WHERE expires_at > now() AND expires_at < now() + interval '7 days')::int AS expiring
         FROM links WHERE owner_id = $1`, [owner]),
      pool.query(
        `SELECT MAX(e.occurred_at) AS last FROM click_events e JOIN links l ON l.id = e.link_id WHERE l.owner_id = $1`, [owner]),
    ]);
    return {
      clicks_30d: clicks.rows[0].cur,
      clicks_prev_30d: clicks.rows[0].prev,
      unique_visitors_30d: uniques.rows[0].n,
      links: links.rows[0],
      series: series.rows,
      top_links: top.rows,
      last_processed_at: fresh.rows[0].last,
    };
  });
}