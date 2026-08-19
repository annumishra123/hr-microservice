// ==========================================================================
// EVENT BUS (RabbitMQ wrapper) — ye poore microservices system ka "nervous
// system" hai. Har service isse import karke events PUBLISH ya CONSUME
// karta hai, bina ek doosre ko directly call kiye (loose coupling).
//
// Kyu RabbitMQ? Redis pub/sub bhi kaam karta lekin wo "fire and forget" hai —
// agar consumer down hai to message hamesha ke liye lost. RabbitMQ queues
// durable hoti hain (disk pe persist), so agar employee-service restart ho
// raha ho tab bhi "user.registered" event queue me safe rehta hai jab tak
// wo process nahi kar leta. Ye "at-least-once delivery" guarantee deta hai.
//
// Pattern: Topic Exchange "hrms.events"
//   - Publisher event ko a routing key ke saath bhejta hai (e.g. "user.registered")
//   - Har service apni khud ki durable queue banata hai aur us queue ko
//     specific routing key(s) se BIND karta hai.
//   - Isse "pub/sub with multiple independent consumers" milta hai.
// ==========================================================================
const amqp = require('amqplib');

const EXCHANGE = 'hrms.events';
let channelPromise = null;

async function getChannel() {
  if (channelPromise) return channelPromise;
  channelPromise = (async () => {
    const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
    const conn = await amqp.connect(url);
    conn.on('error', (e) => console.error('[eventBus] connection error', e.message));
    conn.on('close', () => {
      console.error('[eventBus] connection closed, retrying in 3s...');
      channelPromise = null;
      setTimeout(getChannel, 3000);
    });
    const ch = await conn.createChannel();
    await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
    return ch;
  })();
  return channelPromise;
}

async function publishEvent(routingKey, payload) {
  const ch = await getChannel();
  const body = Buffer.from(JSON.stringify({
    routingKey,
    payload,
    publishedAt: new Date().toISOString(),
  }));
  ch.publish(EXCHANGE, routingKey, body, { persistent: true, contentType: 'application/json' });
}

async function subscribeEvent(queueName, routingKeys, handler) {
  const ch = await getChannel();
  await ch.assertQueue(queueName, { durable: true });
  for (const key of routingKeys) {
    await ch.bindQueue(queueName, EXCHANGE, key);
  }
  await ch.prefetch(10);
  ch.consume(queueName, async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString());
      await handler(data.payload, data.routingKey);
      ch.ack(msg);
    } catch (err) {
      console.error(`[eventBus] handler failed for ${queueName}:`, err.message);
      ch.nack(msg, false, false);
    }
  });
  console.log(`[eventBus] ${queueName} listening on [${routingKeys.join(', ')}]`);
}

module.exports = { publishEvent, subscribeEvent };
