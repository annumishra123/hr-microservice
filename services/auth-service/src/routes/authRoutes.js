const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/refresh-token', ctrl.refreshToken);
router.post('/otp/request', ctrl.requestOtp);
router.post('/otp/verify', ctrl.verifyOtp);
router.get('/me', protect, ctrl.getMe);
router.post('/logout', protect, ctrl.logout);
router.post('/change-password', protect, ctrl.changePassword);

module.exports = router;
