const { subscribeEvent } = require('../../shared/eventBus');
const EmployeeSnapshot = require('../models/EmployeeSnapshot');
const logger = require('../../shared/logger')('attendance-service');

async function startEmployeeSyncConsumer() {
  await subscribeEvent(
    'attendance-service.employee-sync',
    ['employee.synced'],
    async (payload) => {
      try {
        await EmployeeSnapshot.findByIdAndUpdate(   
          payload.employeeId,
          {
            _id: payload.employeeId,
            name: payload.name,
            employeeCode: payload.employeeCode,
            department: payload.department,
            profileImage: payload.profileImage,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        logger.info('Employee snapshot synced', { employeeId: payload.employeeId });
      } catch (err) {
        logger.error('Employee snapshot sync failed', { error: err.message, payload });
      }
    }
  );
}

module.exports = { startEmployeeSyncConsumer };