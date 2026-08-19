const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.get('/', protect, ctrl.list);
router.patch('/:id/read', protect, ctrl.markRead);

module.exports = router;
