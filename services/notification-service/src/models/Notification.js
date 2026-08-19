const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true }, // recipient
    type: { type: String, required: true }, // e.g. 'welcome', 'otp', 'attendance.checkin'
    title: { type: String, required: true },
    body: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
