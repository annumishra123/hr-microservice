const { publishEvent } = require('../../shared/eventBus');

async function publishCheckIn(record) {
  // notification-service isko consume karke manager ko real-time (Socket.IO)
  // "employee checked in" notification bhejega.
  await publishEvent('attendance.checkin', {
    userId: record.userId,
    date: record.date,
    checkIn: record.checkIn,
    location: record.checkInLocation,
  });
}

async function publishCheckOut(record) {
  await publishEvent('attendance.checkout', {
    userId: record.userId,
    date: record.date,
    checkOut: record.checkOut,
    location: record.checkOutLocation,
  });
}

module.exports = { publishCheckIn, publishCheckOut };
