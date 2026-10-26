import argon2 from 'argon2';
import { z } from 'zod';
import { pool } from '../db.js';

const err = (code, message, details) => ({ error: { code, message, details } });

const profileSchema = z.object({ display_name: z.string().trim().max(80).nullable() });
const passwordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(128),
});

export default async function (app) {
  app.get('/', { preHandler: app.authenticate }, async (req, reply) => {
    const { rows: [u] } = await pool.query(
      'SELECT id, email, display_name, role, created_at FROM users WHERE id=$1', [req.user.sub]);
    if (!u) return reply.code(401).send(err('UNAUTHORIZED', 'Sign in required'));
    return u;
  });

  app.patch('/', { preHandler: app.authenticate }, async (req, reply) => {
    const p = profileSchema.safeParse(req.body);
    if (!p.success) return reply.code(422).send(err('VALIDATION_ERROR', 'Invalid input', p.error.flatten()));
    const { rows: [u] } = await pool.query(
      `UPDATE users SET display_name=$1 WHERE id=$2
       RETURNING id, email, display_name, role, created_at`,
      [p.data.display_name || null, req.user.sub]);
    return u;
  });

  app.post('/password', { preHandler: app.authenticate }, async (req, reply) => {
    const p = passwordSchema.safeParse(req.body);
    if (!p.success) return reply.code(422).send(err('VALIDATION_ERROR', 'Invalid input', p.error.flatten()));
    const { rows: [u] } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.sub]);
    if (!u || !(await argon2.verify(u.password_hash, p.data.current_password)))
      return reply.code(400).send(err('WRONG_PASSWORD', 'Current password is incorrect'));
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',
      [await argon2.hash(p.data.new_password), req.user.sub]);
    return { ok: true };
  });
}