/* eslint-disable no-undef */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// NOTE: Microservices architecture me har service ka apna DB hota hai
// (database-per-service pattern). auth-service sirf authentication ke
// liye zaroori fields rakhta hai. Baaki HR data (salary, leave, personal
// info, aadhaar, etc) employee-service ke apne DB me rehta hai — jab
// employee-service ko user record chahiye hota hai, wo naya "user.registered"
// event consume karke apna khud ka Employee document banata hai (event-driven
// data replication — isse services ek doosre ke DB ko directly query nahi
// karte, jo tight-coupling create karta).
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    phone: { type: String, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ['employee', 'manager', 'hr', 'admin'], default: 'employee' },
    designation: { type: String, default: 'Software Developer' },
    department: { type: String, default: 'Engineering' },
    isActive: { type: Boolean, default: true },
    mfaEnabled: { type: Boolean, default: false },
    otp: { type: String, select: false },
    otpExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
