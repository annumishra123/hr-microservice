
// Auth-service ke events publish karne ke liye thin wrapper.
const { publishEvent } = require('../../shared/eventBus');

async function publishUserRegistered(user) {
  await publishEvent('user.registered', {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    designation: user.designation,
    department: user.department,
  });
}

async function publishUserLoggedIn(user, deviceId) {
  await publishEvent('user.logged_in', {
    id: user._id.toString(),
    deviceId,
    at: new Date().toISOString(),
  });
}

module.exports = { publishUserRegistered, publishUserLoggedIn };
