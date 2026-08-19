const mongoose = require('mongoose');
const logger = require('../../shared/logger')('employee-service');

module.exports = async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('MongoDB connected', { db: 'hrms_employee' });
};
