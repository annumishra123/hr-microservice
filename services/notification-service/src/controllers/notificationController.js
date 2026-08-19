const Notification = require('../models/Notification');

exports.list = async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  const [items, total, unread] = await Promise.all([
    Notification.find({ userId: req.userId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Notification.countDocuments({ userId: req.userId }),
    Notification.countDocuments({ userId: req.userId, read: false }),
  ]);

  res.json({ success: true, data: items, unread, pagination: { page, limit, total } });
};

exports.markRead = async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, userId: req.userId }, { read: true });
  res.json({ success: true });
};
