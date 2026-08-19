const mongoose = require('mongoose');

// Ek User ke multiple Devices ho sakte hain — har device ka apna refresh
// token, isliye ek device se logout hone se doosre devices affect nahi hote.
const deviceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceId: { type: String, required: true },
    name: { type: String, default: 'Unknown Device' },
    type: { type: String, default: 'android' },
    location: { type: String, default: 'Unknown' },
    ip: { type: String },
    refreshToken: { type: String, select: false },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

deviceSchema.index({ user: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model('Device', deviceSchema);
