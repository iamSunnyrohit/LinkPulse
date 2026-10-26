import amqp from 'amqplib';
export let channel;
export async function initQueue() {
  const conn = await amqp.connect(process.env.AMQP_URL);
  channel = await conn.createConfirmChannel();   // publisher confirms
  await channel.assertQueue('clicks.dlq', { durable: true });
  await channel.assertQueue('clicks', {
    durable: true,
    deadLetterExchange: '', deadLetterRoutingKey: 'clicks.dlq',
  });
}
