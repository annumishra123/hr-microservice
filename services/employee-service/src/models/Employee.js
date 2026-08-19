const mongoose = require('mongoose');
const Counter = require('./Counter');

// Ye employee-service ka apna document hai — auth-service ke User document
// se ALAG hai (database-per-service). Ye "user.registered" event consume
// hone par create hota hai, event me diya hua auth `userId` reference ke
// roop me store hota hai.
const employeeSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true }, // auth-service ka User._id
    employeeId: { type: String, unique: true, index: true }, // e.g. EMP00125
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    role: { type: String, default: 'employee' },
    designation: { type: String, default: 'Software Developer' },
    department: { type: String, default: 'Engineering' },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    dateOfJoining: { type: Date, default: Date.now },
    profilePhoto: { type: String, default: '' },
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    aadhaarNumber: { type: String, trim: true, default: '', select: false },
    panNumber: { type: String, trim: true, uppercase: true, default: '' },
    emergencyContacts: [
      { name: { type: String, required: true }, relation: String, phone: { type: String, required: true } },
    ],
    leaveBalance: {
      casual: { type: Number, default: 12 },
      earned: { type: Number, default: 18 },
      sick: { type: Number, default: 6 },
      privilege: { type: Number, default: 3 },
    },
    salary: {
      basic: { type: Number, default: 0 },
      hra: { type: Number, default: 0 },
      specialAllowance: { type: Number, default: 0 },
      otherAllowance: { type: Number, default: 0 },
      pf: { type: Number, default: 0 },
      professionalTax: { type: Number, default: 0 },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

employeeSchema.pre('save', async function (next) {
  try {
    if (this.employeeId) return next();
    const counter = await Counter.findOneAndUpdate(
      { _id: 'employeeId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.employeeId = `EMP${String(counter.seq).padStart(5, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

employeeSchema.methods.netSalary = function () {
  const s = this.salary;
  const gross = (s.basic || 0) + (s.hra || 0) + (s.specialAllowance || 0) + (s.otherAllowance || 0);
  const deductions = (s.pf || 0) + (s.professionalTax || 0);
  return gross - deductions;
};

module.exports = mongoose.model('Employee', employeeSchema);
