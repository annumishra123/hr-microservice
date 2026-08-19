// ==========================================================================
// GATEWAY-LEVEL JWT VERIFICATION
// Gateway hi JWT verify karta hai (ek jagah), taaki har downstream service
// baar baar jsonwebtoken import na kare. Verify hone ke baad gateway,
// req.userId ko naye header "X-User-Id" me set karke downstream service ko
// forward karta hai. Downstream service isi header pe TRUST karta hai
// (kyunki wo sirf gateway se hi traffic accept karta hai — internal
// network me, K8s NetworkPolicy se services directly public-facing nahi
// hote). Ye "trusted subsystem" pattern hai, common microservices me.
// ==========================================================================
const jwt = require('jsonwebtoken');

module.exports = function verifyAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization token missing' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};


