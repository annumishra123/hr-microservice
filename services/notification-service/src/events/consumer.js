// // ==========================================================================
// // NOTIFICATION-SERVICE ka core kaam: RabbitMQ se events consume karo, DB me
// // notification save karo, aur agar user abhi online hai to Socket.IO se
// // REAL-TIME deliver karo (agar offline hai to wo login karne pe "unread"
// // list me dikhega — DB me already saved hai).
// // ==========================================================================
// const { subscribeEvent } = require('../../shared/eventBus');
// const Notification = require('../models/Notification');
// const { getIO } = require('../sockets/io');
// const logger = require('../../shared/logger')('notification-service');

// async function saveAndEmit(userId, type, title, body, meta = {}) {
//   const notif = await Notification.create({ userId, type, title, body, meta });
//   try {
//     getIO().to(userId).emit('notification', {
//       id: notif._id,
//       type,
//       title,
//       body,
//       meta,
//       createdAt: notif.createdAt,
//     });
//   } catch (e) {
//     logger.warn('Socket emit skipped (io not ready)', { error: e.message });
//   }
// }

// async function startConsumers() {
//   await subscribeEvent(
//     'notification-service.all-events',
//     ['user.registered', 'otp.requested', 'attendance.checkin', 'attendance.checkout'],
//     async (payload, routingKey) => {
//       switch (routingKey) {
//         case 'user.registered':
//           await saveAndEmit(
//             payload.id,
//             'welcome',
//             'Welcome to the company! 🎉',
//             `Hi ${payload.name}, your employee account has been created.`,
//             { role: payload.role }
//           );
//           break;

//         case 'otp.requested':
//           // Real production me yahan SMS/WhatsApp gateway (Twilio/Gupshup)
//           // call hota. Hum yahan sirf in-app socket event bhej rahe hain,
//           // taaki demo me end-to-end flow dikh sake.
//           await saveAndEmit(
//             payload.userId,
//             'otp',
//             'Your OTP code',
//             `Your verification code is ${payload.otp}. Valid for 5 minutes.`,
//             { email: payload.email }
//           );
//           break;

//         case 'attendance.checkin':
//           await saveAndEmit(
//             payload.userId,
//             'attendance.checkin',
//             'Checked in',
//             `Checked in at ${new Date(payload.checkIn).toLocaleTimeString()}`,
//             { date: payload.date, location: payload.location }
//           );
//           break;

//         case 'attendance.checkout':
//           await saveAndEmit(
//             payload.userId,
//             'attendance.checkout',
//             'Checked out',
//             `Checked out at ${new Date(payload.checkOut).toLocaleTimeString()}`,
//             { date: payload.date, location: payload.location }
//           );
//           break;
//       }
//     }
//   );
// }

// module.exports = { startConsumers };






// ==========================================================================
// NOTIFICATION-SERVICE ka core kaam: RabbitMQ se events consume karo, DB me
// notification save karo, aur agar user abhi online hai to Socket.IO se
// REAL-TIME deliver karo (agar offline hai to wo login karne pe "unread"
// list me dikhega — DB me already saved hai).
// ==========================================================================
const { subscribeEvent } = require('../../shared/eventBus');
const Notification = require('../models/Notification');
const { getIO } = require('../sockets/io');
const logger = require('../../shared/logger')('notification-service');

async function saveAndEmit(userId, type, title, body, meta = {}) {
  const notif = await Notification.create({ userId, type, title, body, meta });
  try {
    getIO().to(userId).emit('notification', {
      id: notif._id,
      type,
      title,
      body,
      meta,
      createdAt: notif.createdAt,
    });
  } catch (e) {
    logger.warn('Socket emit skipped (io not ready)', { error: e.message });
  }
  return notif;
}

// 🔴 NAYA: approve/reject hone par EMPLOYEE ko notify karo
// (Priority #1 — pehle ye pakka kaam karna chahiye)
async function notifyEmployeeOfReview(routingKey, payload) {
  const { requestId, employeeId, date, managerComment } = payload;
  const isApproved = routingKey === 'regularize.approved';

  const title = isApproved ? 'Regularization Approved' : 'Regularization Rejected';
  const body = isApproved
    ? `Aapki ${date} ki regularization request approve ho gayi hai.`
    : `Aapki ${date} ki regularization request reject ho gayi hai.${managerComment ? ' Reason: ' + managerComment : ''}`;

  await saveAndEmit(
    employeeId,
    routingKey, // 'regularize.approved' ya 'regularize.rejected'
    title,
    body,
    { requestId, date, status: isApproved ? 'approved' : 'rejected', managerComment: managerComment || null }
  );

  logger.info(`Employee notified: ${routingKey}`, { employeeId, requestId });
}

async function startConsumers() {
  await subscribeEvent(
    'notification-service.all-events',
    [
      'user.registered',
      'otp.requested',
      'attendance.checkin',
      'attendance.checkout',
      // 🔴 NAYE ROUTING KEYS (abhi ke liye sirf employee-facing):
      'regularize.approved',
      'regularize.rejected',
    ],
    async (payload, routingKey) => {
      switch (routingKey) {
        case 'user.registered':
          await saveAndEmit(
            payload.id,
            'welcome',
            'Welcome to the company! 🎉',
            `Hi ${payload.name}, your employee account has been created.`,
            { role: payload.role }
          );
          break;

        case 'otp.requested':
          await saveAndEmit(
            payload.userId,
            'otp',
            'Your OTP code',
            `Your verification code is ${payload.otp}. Valid for 5 minutes.`,
            { email: payload.email }
          );
          break;

        case 'attendance.checkin':
          await saveAndEmit(
            payload.userId,
            'attendance.checkin',
            'Checked in',
            `Checked in at ${new Date(payload.checkIn).toLocaleTimeString()}`,
            { date: payload.date, location: payload.location }
          );
          break;

        case 'attendance.checkout':
          await saveAndEmit(
            payload.userId,
            'attendance.checkout',
            'Checked out',
            `Checked out at ${new Date(payload.checkOut).toLocaleTimeString()}`,
            { date: payload.date, location: payload.location }
          );
          break;

        // 🔴 NAYA — abhi ke liye sirf employee ko approve/reject notify:
        case 'regularize.approved':
        case 'regularize.rejected':
          await notifyEmployeeOfReview(routingKey, payload);
          break;
      }
    }
  );
}

module.exports = { startConsumers };