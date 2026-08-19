// ==========================================================================
// EVENT CONSUMER — employee-service ye events SUNTA hai aur react karta hai.
// Ye "event-driven data replication" ka core hai: auth-service se koi
// direct DB call nahi, sirf events.
// ==========================================================================
const { subscribeEvent } = require('../../shared/eventBus');
const Employee = require('../models/Employee');
const logger = require('../../shared/logger')('employee-service');

async function startConsumers() {
  await subscribeEvent(
    'employee-service.user-events',           // stable queue name for this service
    ['user.registered', 'user.deactivated'],  // routing keys ye service sunta hai
    async (payload, routingKey) => {
      if (routingKey === 'user.registered') {
        const exists = await Employee.findOne({ userId: payload.id });
        if (exists) return; // idempotency — duplicate event se dobara create na ho
        await Employee.create({
          userId: payload.id,
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          role: payload.role,
          designation: payload.designation,
          department: payload.department,
        });
        logger.info('Employee profile created from user.registered event', { userId: payload.id });
      }

      if (routingKey === 'user.deactivated') {
        await Employee.updateOne({ userId: payload.id }, { isActive: false });
        logger.info('Employee marked inactive', { userId: payload.id });
      }
    }
  );
}

module.exports = { startConsumers };
