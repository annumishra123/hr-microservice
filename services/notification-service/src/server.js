require('dotenv').config();
const express = require('express');
const http = require('http');
const connectDB = require('./config/db');
const { initSocket } = require('./sockets/io');
const { startConsumers } = require('./events/consumer');
const notificationRoutes = require('./routes/notificationRoutes');
const logger = require('../shared/logger')('notification-service');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ success: true, service: 'notification-service' }));
app.use('/api/notifications', notificationRoutes);

app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

const httpServer = http.createServer(app);
const PORT = process.env.PORT || 5004;

Promise.all([connectDB(), initSocket(httpServer)])
  .then(() => startConsumers())
  .then(() => httpServer.listen(PORT, () => logger.info(`notification-service listening on :${PORT}`)))
  .catch((err) => {
    logger.error('Failed to start notification-service', { error: err.message });
    process.exit(1);
  });
