require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('../shared/logger')('auth-service');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ success: true, service: 'auth-service' }));
app.use('/api/auth', authRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

connectDB()
  .then(() => {
    app.listen(PORT, () => logger.info(`auth-service listening on :${PORT}`));
  })
  .catch((err) => {
    logger.error('Failed to start auth-service', { error: err.message });
    process.exit(1);
  });
