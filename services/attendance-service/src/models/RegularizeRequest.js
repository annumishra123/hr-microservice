const mongoose = require('mongoose');

const regularizeRequestSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    date: {
      type: String, // "YYYY-MM-DD"
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      enum: ['forgot_checkin', 'forgot_checkout', 'wrong_time', 'wfh_not_marked', 'other'],
    },
    requestedCheckInTime: {
      type: String, // "HH:MM"
      default: null,
    },
    requestedCheckOutTime: {
      type: String, // "HH:MM"
      default: null,
    },
    note: {
      type: String,
      required: true,
      maxlength: 300,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    managerComment: {
      type: String,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

regularizeRequestSchema.index({ employee: 1, date: 1 }, { unique: false });

module.exports = mongoose.model('RegularizeRequest', regularizeRequestSchema);