import crypto from 'node:crypto';
import { UAParser } from 'ua-parser-js';
import geoip from 'geoip-lite';

const dailyKey = () =>
  crypto.createHmac('sha256', process.env.HASH_SECRET)
    .update(new Date().toISOString().slice(0, 10)).digest();   

export function buildEvent(req, link) {
  const uaString = req.headers['user-agent'] || '';
  const ua = new UAParser(uaString).getResult();
  const ip = req.ip;

  let referrer = 'unknown';
  try { if (req.headers.referer) referrer = new URL(req.headers.referer).hostname || 'unknown'; } catch {}

  return {
    event_id: crypto.randomUUID(),
    schema_version: 1,
    link_id: link.id,
    occurred_at: new Date().toISOString(),
    country_code: geoip.lookup(ip)?.country || 'unknown',
    device_type: ua.device.type || 'desktop',
    browser_family: ua.browser.name || 'unknown',
    os_family: ua.os.name || 'unknown',
    referrer_host: referrer,
    visitor_hash: crypto.createHmac('sha256', dailyKey()).update(ip + uaString).digest('hex').slice(0, 32),
    bot_classification: /bot|crawl|spider|slurp|preview/i.test(uaString) ? 'known_bot' : 'unknown',
  };
}