const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/attendanceController');
const { protect } = require('../middleware/auth');

router.post('/checkin', protect, ctrl.checkIn);
router.post('/checkout', protect, ctrl.checkOut);
router.get('/me', protect, ctrl.myHistory);

module.exports = router;
