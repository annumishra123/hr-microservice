const Attendance = require('../models/Attendance');
const { publishCheckIn, publishCheckOut } = require('../events/publisher');

const todayStr = () => new Date().toISOString().slice(0, 10);

exports.checkIn = async (req, res) => {
  const date = todayStr();
  const existing = await Attendance.findOne({ userId: req.userId, date });
  if (existing?.checkIn) {
    return res.status(409).json({ success: false, message: 'Already checked in today' });
  }

  const record = await Attendance.findOneAndUpdate(
    { userId: req.userId, date },
    { checkIn: new Date(), checkInLocation: req.body.location || 'Unknown', status: 'present' },
    { upsert: true, new: true }
  );

  await publishCheckIn(record);
  res.json({ success: true, data: record });
};

exports.checkOut = async (req, res) => {
  const date = todayStr();
  const record = await Attendance.findOne({ userId: req.userId, date });
  if (!record || !record.checkIn) {
    return res.status(400).json({ success: false, message: 'You must check in before checking out' });
  }
  if (record.checkOut) {
    return res.status(409).json({ success: false, message: 'Already checked out today' });
  }

  record.checkOut = new Date();
  record.checkOutLocation = req.body.location || 'Unknown';
  await record.save();

  await publishCheckOut(record);
  res.json({ success: true, data: record });
};

exports.myHistory = async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 30, 90);

  const records = await Attendance.find({ userId: req.userId })
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.json({ success: true, data: records });
};
