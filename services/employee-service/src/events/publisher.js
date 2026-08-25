// employee-service/events/publisher.js
const { publishEvent } = require('../../shared/eventBus');
const logger = require('../../shared/logger')('employee-service');

async function publishEmployeeSynced(employee) {
  await publishEvent('employee.synced', {
    employeeId: employee.userId.toString(),
    name: employee.name,
    employeeCode: employee.employeeId ? employee.employeeId.toString() : employee._id.toString(),
    department: employee.department,
    profileImage: employee.profileImage || null,
  });
  logger.info('employee.synced event published', { employeeId: employee.userId });
}

module.exports = { publishEmployeeSynced };