// ==========================================================================
// SOCKET.IO SETUP — real-time delivery ka core.
//
// Redis Adapter kyu zaroori hai: notification-service, K8s me multiple pods
// (replicas) me chalega (HPA se auto-scale hoke 3-4-10 pods tak). Agar
// User-A pod-1 se connected hai, aur ek event pod-2 pe process hota hai
// (RabbitMQ consumer kisi bhi pod pe land kar sakta hai), to pod-2 ko
// User-A ka socket seedha nahi milega — kyunki wo pod-1 pe hai.
// @socket.io/redis-adapter isko solve karta hai: jab bhi koi pod
// `io.to(room).emit(...)` karta hai, adapter Redis Pub/Sub ke through wo
// message SAARE pods tak broadcast kar deta hai, jisme se jis pod pe wo
// socket actually connected hai wahi use deliver kar dega.
// ==========================================================================
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const jwt = require('jsonwebtoken');
const { makeRedisClient } = require('../../shared/redisClient');
const logger = require('../../shared/logger')('notification-service');

let io;

async function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN?.split(',') || '*' },
  });

  const pubClient = makeRedisClient('socket-pub');
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  // Auth handshake: client JWT bhejta hai, hum verify karke user ko uske
  // "personal room" me join karte hain (room name = userId). Isse
  // io.to(userId).emit(...) karke SEEDHA usi user ko target kar sakte hain,
  // chahe wo kisi bhi pod pe connected ho.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(socket.userId);
    logger.info('socket connected', { userId: socket.userId, socketId: socket.id });

    socket.on('disconnect', () => {
      logger.info('socket disconnected', { userId: socket.userId });
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized yet');
  return io;
}

module.exports = { initSocket, getIO };
