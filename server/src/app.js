import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import { pool } from './db.js';
import { redis } from './cache.js';
import { initQueue } from './queue.js';
import authRoutes from './routes/auth.js';
import linkRoutes from './routes/links.js';
import redirectRoutes from './redirect.js';
import { register } from './lib/metrics.js';
import analyticsRoutes from './routes/analytics.js';
import overviewRoutes from './routes/overview.js';
import accountRoutes from './routes/account.js';
import accountAnalyticsRoutes from './routes/accountAnalytics.js';
import systemRoutes from './routes/system.js';


const app = Fastify({ logger: true, trustProxy: false });

await app.register(cors, { origin: 'http://localhost:5173', credentials: true });
await app.register(cookie);
await app.register(jwt, {
  secret: process.env.JWT_SECRET,
  cookie: { cookieName: 'token', signed: false },
});

app.decorate('authenticate', async (req, reply) => {
  try { await req.jwtVerify(); }
  catch {
    reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } });
  }
});

app.get('/health', async () => {
  await pool.query('SELECT 1');
  await redis.ping();
  return { ok: true };
});


app.get('/metrics', async (_, reply) =>
  reply.type(register.contentType).send(await register.metrics()));


await app.register(authRoutes, { prefix: '/api/v1/auth' });
await app.register(linkRoutes, { prefix: '/api/v1/links' });
await app.register(analyticsRoutes, { prefix: '/api/v1/links' });
await app.register(redirectRoutes); 
await app.register(overviewRoutes, { prefix: '/api/v1/overview' });
await app.register(accountRoutes, { prefix: '/api/v1/me' });
await app.register(accountAnalyticsRoutes, { prefix: '/api/v1/analytics' });
await app.register(systemRoutes, { prefix: '/api/v1/system' });


await initQueue();
await app.listen({ port: Number(process.env.PORT), host: '0.0.0.0' });