// routes/auth.js
import argon2 from 'argon2';
import { z } from 'zod';
import { pool } from '../db.js';

const creds = z.object({ email: z.string().email(), password: z.string().min(8) });

export default async function (app) {
  app.post('/register', async (req, reply) => {
    const { email, password } = creds.parse(req.body);
    const hash = await argon2.hash(password);
    try {
      const { rows } = await pool.query(
        'INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,role',
        [email.toLowerCase(), hash]);
      return setSession(reply, app, rows[0]);
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send(err('EMAIL_TAKEN', 'Email in use'));
      throw e;
    }
  });

  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { email, password } = creds.parse(req.body);
      const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
      const u = rows[0];
      if (!u || !(await argon2.verify(u.password_hash, password)) || u.status !== 'active')
        return reply.code(401).send(err('UNAUTHORIZED', 'Invalid credentials'));
      return setSession(reply, app, u);
    });

  app.post('/logout', async (_, reply) => reply.clearCookie('token', { path: '/' }).send({ ok: true }));
}

function setSession(reply, app, u) {
  const token = app.jwt.sign({ sub: u.id, role: u.role }, { expiresIn: '7d' });
  return reply.setCookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: 7 * 86400 }).send({ id: u.id });
}
export const err = (code, message, details) => ({ error: { code, message, details } });