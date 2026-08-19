require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const attendanceRoutes = require('./routes/attendanceRoutes');
const logger = require('../shared/logger')('attendance-service');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ success: true, service: 'attendance-service' }));
app.use('/api/attendance', attendanceRoutes);

app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5003;

connectDB()
  .then(() => app.listen(PORT, () => logger.info(`attendance-service listening on :${PORT}`)))
  .catch((err) => {
    logger.error('Failed to start attendance-service', { error: err.message });
    process.exit(1);
  });
