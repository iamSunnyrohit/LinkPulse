import { pool } from './db.js';
import { initQueue, channel } from './queue.js';
import { eventSchema } from './lib/validate.js';

const MAX_RETRIES = 5;

async function processEvent(evt) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO click_events
         (event_id, link_id, occurred_at, country, device, browser, os,
          referrer_host, visitor_hash, bot_classification)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (event_id) DO NOTHING`,
      [evt.event_id, evt.link_id, evt.occurred_at, evt.country_code, evt.device_type,
       evt.browser_family, evt.os_family, evt.referrer_host, evt.visitor_hash,
       evt.bot_classification]);

    if (ins.rowCount === 1) {   // only count events we have not seen before
      const dims = [
        ['total', 'all'],
        ['country', evt.country_code],
        ['device', evt.device_type],
        ['browser', evt.browser_family],
        ['referrer', evt.referrer_host],
        ['bot', evt.bot_classification],
      ];
      for (const [type, value] of dims) {
        await client.query(
          `INSERT INTO click_aggregates
             (link_id, bucket_start, granularity, dimension_type, dimension_value, count)
           VALUES ($1, date_trunc('hour', $2::timestamptz), 'hour', $3, $4, 1)
           ON CONFLICT (link_id, bucket_start, granularity, dimension_type, dimension_value)
           DO UPDATE SET count = click_aggregates.count + 1`,
          [evt.link_id, evt.occurred_at, type, value]);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

await initQueue();
await channel.prefetch(50);
console.log('worker: waiting for click events');

channel.consume('clicks', async (msg) => {
  if (!msg) return;

  let evt;
  try { evt = eventSchema.parse(JSON.parse(msg.content.toString())); }
  catch {
    return channel.nack(msg, false, false);   // invalid event goes to clicks.dlq
  }

  try {
    await processEvent(evt);
    channel.ack(msg);
  } catch (e) {
    const retries = (msg.properties.headers?.['x-retries'] || 0) + 1;
    console.error(`worker: attempt ${retries} failed:`, e.message);
    if (retries >= MAX_RETRIES) {
      channel.nack(msg, false, false);        // dead-letter after too many failures
    } else {
      setTimeout(() => {
        channel.sendToQueue('clicks', msg.content,
          { persistent: true, headers: { 'x-retries': retries } });
        channel.ack(msg);
      }, 2 ** retries * 1000);                // exponential backoff
    }
  }
});