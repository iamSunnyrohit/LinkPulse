import { z } from 'zod';
import net from 'node:net';

const RESERVED = new Set(['api', 'admin', 'login', 'health', 'register', 'logout', 'static', 'metrics']);
const SHORT_HOST = new URL(process.env.BASE_URL).hostname;

function isPrivateHost(h) {
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return net.isIPv6(h.replace(/[\[\]]/g, ''));
}

export const destinationSchema = z.string().max(8192).superRefine((v, ctx) => {
  let u;
  try { u = new URL(v); }
  catch { return ctx.addIssue({ code: 'custom', message: 'Not a valid URL' }); }
  if (!['http:', 'https:'].includes(u.protocol)) ctx.addIssue({ code: 'custom', message: 'Only http and https are allowed' });
  if (u.username || u.password) ctx.addIssue({ code: 'custom', message: 'Credentials in URL are not allowed' });
  if (isPrivateHost(u.hostname)) ctx.addIssue({ code: 'custom', message: 'This host is not allowed' });
  if (u.hostname === SHORT_HOST) ctx.addIssue({ code: 'custom', message: 'Cannot point to the short-link domain' });
});

export const createSchema = z.object({
  destination_url: destinationSchema,
  custom_alias: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, '3-32 letters, numbers, - or _')
    .refine(a => !RESERVED.has(a.toLowerCase()), 'Reserved alias').optional(),
  title: z.string().max(120).optional(),
  expires_at: z.string().datetime({ offset: true })
    .refine(d => new Date(d) > new Date(), 'Must be in the future').optional(),
});

export const updateSchema = z.object({
  destination_url: destinationSchema.optional(),
  title: z.string().max(120).nullable().optional(),
  expires_at: z.string().datetime({ offset: true })
    .refine(d => new Date(d) > new Date(), 'Must be in the future').nullable().optional(),
  is_active: z.boolean().optional(),
}).refine(o => Object.keys(o).length > 0, 'Nothing to update');


export const eventSchema = z.object({
  event_id: z.string().uuid(),
  schema_version: z.number().int(),
  link_id: z.string().uuid(),
  occurred_at: z.string().datetime(),
  country_code: z.string().max(16),
  device_type: z.string().max(32),
  browser_family: z.string().max(64),
  os_family: z.string().max(64),
  referrer_host: z.string().max(255),
  visitor_hash: z.string().max(64),
  bot_classification: z.string().max(32),
});