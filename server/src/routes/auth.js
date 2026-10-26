import argon2 from 'argon2';
import { z } from 'zod';
import { pool } from '../db.js';

export const err = (code, message, details) => ({ error: { code, message, details } });

const creds = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });
const registerSchema = creds.extend({ display_name: z.string().trim().max(80).optional() });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });

export default async function (app) {
  app.post('/register', async (req, reply) => {
    const p = registerSchema.safeParse(req.body);
    if (!p.success)
      return reply.code(422).send(err('VALIDATION_ERROR', 'Invalid input', p.error.flatten()));

    const { email, password, display_name } = p.data;
    const hash = await argon2.hash(password);
    try {
      const { rows } = await pool.query(
        'INSERT INTO users(email, password_hash, display_name) VALUES($1,$2,$3) RETURNING id, role',
        [email.toLowerCase(), hash, display_name || null]);
      return setSession(reply, app, rows[0]);
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send(err('EMAIL_TAKEN', 'Email in use'));
      throw e;
    }
  });

  app.post('/login', async (req, reply) => {
    const p = loginSchema.safeParse(req.body);
    if (!p.success)
      return reply.code(422).send(err('VALIDATION_ERROR', 'Invalid input', p.error.flatten()));

    const { email, password } = p.data;
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    const u = rows[0];
    if (!u || u.status !== 'active' || !(await argon2.verify(u.password_hash, password)))
      return reply.code(401).send(err('UNAUTHORIZED', 'Invalid credentials'));
    return setSession(reply, app, u);
  });

  app.post('/logout', async (_, reply) =>
    reply.clearCookie('token', { path: '/' }).send({ ok: true }));
}

function setSession(reply, app, u) {
  const token = app.jwt.sign({ sub: u.id, role: u.role }, { expiresIn: '7d' });
  return reply.setCookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 86400,
  }).send({ id: u.id });
}