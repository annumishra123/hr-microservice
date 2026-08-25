const mongoose = require('mongoose');

const employeeSnapshotSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId },
    name: { type: String, default: '' },
    employeeCode: { type: String, default: '' },
    department: { type: String, default: '' },
    profileImage: { type: String, default: null },
  },
  { timestamps: true, _id: false }
);

module.exports = mongoose.model('EmployeeSnapshot', employeeSnapshotSchema);