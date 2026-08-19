// Downstream services khud JWT verify NAHI karte — wo gateway pe TRUST
// karte hain. Gateway JWT verify karke "X-User-Id" header set karta hai
// aur tabhi request yahan tak pahunchti hai. Ye header hi humara "protect"
// middleware ka source of truth hai.
//
// Security note: production me isko aur harden karo — e.g. mTLS ya ek
// shared internal-only network (K8s NetworkPolicy) se ensure karo ki
// services SIRF gateway se hi traffic accept karein, public internet se
// directly nahi (varna koi bhi X-User-Id header fake karke bypass kar sakta).
exports.protect = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authorized, no user context from gateway' });
  }
  req.userId = userId;
  next();
};
