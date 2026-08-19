require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const cache = require('./config/cache');
const employeeRoutes = require('./routes/employeeRoutes');
const { startConsumers } = require('./events/consumer');
const logger = require('../shared/logger')('employee-service');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ success: true, service: 'employee-service' }));
app.use('/api/employees', employeeRoutes);

app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5002;

Promise.all([connectDB(), cache.connect(), startConsumers()])
  .then(() => app.listen(PORT, () => logger.info(`employee-service listening on :${PORT}`)))
  .catch((err) => {
    logger.error('Failed to start employee-service', { error: err.message });
    process.exit(1);
  });
