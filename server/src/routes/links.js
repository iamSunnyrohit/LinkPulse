import { pool } from '../db.js';
import { redis } from '../cache.js';
import { encode } from '../lib/base62.js';
import { createSchema } from '../lib/validate.js';
import { updateSchema } from '../lib/validate.js';

const err = (code, message, details) => ({ error: { code, message, details } });

export function toDto(r) {
  let status = 'active';
  if (r.blocked_at) status = 'blocked';
  else if (!r.is_active) status = 'inactive';
  else if (r.expires_at && new Date(r.expires_at) <= new Date()) status = 'expired';
  return {
    id: r.id,
    short_code: r.short_code,
    short_url: `${process.env.BASE_URL}/${r.short_code}`,
    destination_url: r.destination_url,
    title: r.title,
    status,
    expires_at: r.expires_at,
    created_at: r.created_at,
  };
}

export default async function (app) {
  app.post('/', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(422).send(err('VALIDATION_ERROR', 'Invalid input', parsed.error.flatten()));

    const { destination_url, custom_alias, title, expires_at } = parsed.data;
    const owner = req.user.sub;

    const idemKey = req.headers['idempotency-key'];
    if (idemKey) {
      try {
        const cached = await redis.get(`idem:${owner}:${idemKey}`);
        if (cached) return reply.code(201).send(JSON.parse(cached));
      } catch {}
    }

    let row;
    if (custom_alias) {
      try {
        row = (await pool.query(
          `INSERT INTO links(owner_id, short_code, destination_url, title, expires_at)
           VALUES($1,$2,$3,$4,$5) RETURNING *`,
          [owner, custom_alias, destination_url, title ?? null, expires_at ?? null])).rows[0];
      } catch (e) {
        if (e.code === '23505')
          return reply.code(409).send(err('ALIAS_UNAVAILABLE', 'This alias is already in use.', { field: 'custom_alias' }));
        throw e;
      }
    } else {
      for (let i = 0; i < 5 && !row; i++) {
        const { rows: [{ n }] } = await pool.query("SELECT nextval('link_seq') AS n");
        try {
          row = (await pool.query(
            `INSERT INTO links(sequence_id, owner_id, short_code, destination_url, title, expires_at)
             VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
            [n, owner, encode(n), destination_url, title ?? null, expires_at ?? null])).rows[0];
        } catch (e) { if (e.code !== '23505') throw e; }
      }
      if (!row) return reply.code(503).send(err('CODE_ALLOCATION_FAILED', 'Please retry'));
    }

    const out = toDto(row);
    if (idemKey) redis.set(`idem:${owner}:${idemKey}`, JSON.stringify(out), 'EX', 86400).catch(() => {});
    return reply.code(201).send(out);
  });

  app.get('/', { preHandler: app.authenticate }, async (req) => {
    const { rows } = await pool.query(
      'SELECT * FROM links WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.sub]);
    return rows.map(toDto);
  });
  
  app.get('/:id', { preHandler: app.authenticate }, async (req, reply) => {
    const { rows: [row] } = await pool.query(
      'SELECT * FROM links WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.sub]);
    if (!row) return reply.code(404).send(err('LINK_NOT_FOUND', 'Link not found'));
    return toDto(row);
  });

  app.patch('/:id', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(422).send(err('VALIDATION_ERROR', 'Invalid input', parsed.error.flatten()));

    const { rows: [cur] } = await pool.query(
      'SELECT * FROM links WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.sub]);
    if (!cur) return reply.code(404).send(err('LINK_NOT_FOUND', 'Link not found'));  // never reveal other users' links

    const next = { ...cur, ...parsed.data };
    const { rows: [row] } = await pool.query(
      `UPDATE links
         SET destination_url=$1, title=$2, expires_at=$3, is_active=$4,
             version=version+1, updated_at=now()
       WHERE id=$5 RETURNING *`,
      [next.destination_url, next.title, next.expires_at, next.is_active, cur.id]);

    await redis.del(`link:${row.short_code}`).catch(() => {});   // invalidate immediately
    return toDto(row);
  });
}