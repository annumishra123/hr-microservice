/* eslint-disable no-undef */
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Device = require('../models/Device');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { publishUserRegistered, publishUserLoggedIn } = require('../events/publisher');

const signAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

const signRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });

// Device-per-token pattern: login/register ke time device create/update karta hai,
// aur USI device pe refresh token save karta hai (User document pe nahi) —
// isse multi-device login sahi se track hota hai, aur ek device logout hone
// se doosre devices affect nahi hote.
async function upsertDevice(req, userId, refreshToken) {
  const deviceId = req.headers['x-device-id'] || req.body.deviceId;
  const name = req.headers['x-device-name'] || req.body.deviceName || 'Unknown Device';
  const type = req.headers['x-device-type'] || req.body.deviceType || 'android';
  const location = req.body.location || 'Unknown';
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

  if (!deviceId) return null;

  return Device.findOneAndUpdate(
    { user: userId, deviceId },
    { user: userId, deviceId, name, type, location, ip, refreshToken, lastActiveAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// @desc Register new employee
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role, designation, department } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw new ApiError(409, 'An account with this email already exists');

  const user = await User.create({ name, email, password, phone, role, designation, department });

  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  await upsertDevice(req, user._id, refreshToken);

  // EVENT: employee-service isko consume karke apna Employee profile banata
  // hai, notification-service isko consume karke "welcome" notification bhejta
  // hai. Auth-service ko in dono services ke baare me kuch pata nahi hota —
  // wo bas event fire karta hai (loose coupling).
  await publishUserRegistered(user);

  res.status(201).json({
    success: true,
    message: 'Employee registered successfully',
    data: { user: sanitize(user), accessToken, refreshToken },
  });
});

// @desc Login with email/password
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email and password are required');

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  if (!user.isActive) throw new ApiError(403, 'Account has been deactivated. Contact HR.');

  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  const device = await upsertDevice(req, user._id, refreshToken);
  await publishUserLoggedIn(user, device?.deviceId);

  res.json({
    success: true,
    message: 'Login successful',
    data: { user: sanitize(user), accessToken, refreshToken },
  });
});

// @desc Refresh access token using refresh token
exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new ApiError(400, 'Refresh token is required');

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const device = await Device.findOne({ user: decoded.id, refreshToken }).select('+refreshToken');
  if (!device) {
    throw new ApiError(401, 'Refresh token does not match or device was removed');
  }

  const user = await User.findById(decoded.id);
  if (!user) throw new ApiError(401, 'User not found');

  const accessToken = signAccessToken(user._id);

  device.lastActiveAt = new Date();
  await device.save();

  res.json({ success: true, data: { accessToken } });
});

// @desc Request OTP for 2FA (mock generation - integrate SMS/WhatsApp gateway here)
exports.requestOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, 'No account found with this email');

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  user.otp = otp;
  user.otpExpires = Date.now() + 5 * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  // EVENT: notification-service OTP ko SMS/WhatsApp/push ke through deliver
  // karega. Auth-service khud SMS gateway se baat nahi karta — separation of
  // concerns.
  const { publishEvent } = require('../../shared/eventBus');
  await publishEvent('otp.requested', { userId: user._id.toString(), email: user.email, otp });

  res.json({
    success: true,
    message: 'OTP generated. In production this is sent via SMS/WhatsApp, not returned in response.',
    devOnlyOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
  });
});

// @desc Verify OTP
exports.verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email }).select('+otp +otpExpires');
  if (!user || user.otp !== otp || user.otpExpires < Date.now()) {
    throw new ApiError(400, 'Invalid or expired OTP');
  }
  user.otp = undefined;
  user.otpExpires = undefined;
  user.mfaEnabled = true;
  await user.save({ validateBeforeSave: false });

  res.json({ success: true, message: 'OTP verified successfully' });
});

// @desc Get logged-in user profile
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ success: true, data: sanitize(user) });
});

// @desc Logout - is device ka refresh token revoke karo
exports.logout = asyncHandler(async (req, res) => {
  const deviceId = req.headers['x-device-id'];

  if (deviceId) {
    await Device.deleteOne({ user: req.userId, deviceId });
  }

  res.json({ success: true, message: 'Logged out successfully' });
});

function sanitize(user) {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.password;
  delete obj.refreshToken;
  delete obj.otp;
  delete obj.otpExpires;
  return obj;
}

// @desc Change password (logged-in user)
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Current and new password are required');
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters');
  }

  const user = await User.findById(req.userId).select('+password');
  if (!user) throw new ApiError(404, 'User not found');

  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) throw new ApiError(401, 'Current password is incorrect');

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: 'Password updated successfully' });
});
