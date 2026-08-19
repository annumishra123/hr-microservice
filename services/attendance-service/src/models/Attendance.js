const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true }, // 'YYYY-MM-DD' — fast range queries ke liye
    checkIn: { type: Date },
    checkOut: { type: Date },
    checkInLocation: { type: String, default: '' },
    checkOutLocation: { type: String, default: '' },
    status: { type: String, enum: ['present', 'half-day', 'absent', 'on-leave'], default: 'present' },
  },
  { timestamps: true }
);

attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
