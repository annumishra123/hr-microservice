const Employee = require('../models/Employee');
const cache = require('../config/cache');

// @desc Get own profile (cached)
exports.getMe = async (req, res) => {
  const cacheKey = `employee:${req.userId}`;
  const cached = await cache.getCached(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  const employee = await Employee.findOne({ userId: req.userId });
  if (!employee) return res.status(404).json({ success: false, message: 'Employee profile not found' });

  await cache.setCached(cacheKey, employee);
  res.json({ success: true, data: employee });
};

// @desc Update own profile
exports.updateMe = async (req, res) => {
  const allowed = ['phone', 'address', 'city', 'pincode', 'profilePhoto', 'emergencyContacts'];
  const updates = {};
  for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];

  const employee = await Employee.findOneAndUpdate({ userId: req.userId }, updates, { new: true });
  if (!employee) return res.status(404).json({ success: false, message: 'Employee profile not found' });

  await cache.invalidate(`employee:${req.userId}`); // stale cache hata do
  res.json({ success: true, data: employee });
};


// @desc Update salary structure (HR/Admin)
exports.updateSalaryStructure =  async (req, res) => {
  const employee = await Employee.findOneAndUpdate(req.params.id, {salary: req.body},{new: true, runValidators: true}).select('-password -refreshToken')
  console.log(employee,"kakakakakakakakakaka");
  
  if (!employee) return res.status(404).json({ success: false, message: 'Employee profile not found' });
  res.json({ success: true, data: employee });
}




// @desc List employees by department (HR/manager use, paginated for scale)
exports.listByDepartment = async (req, res) => {
  const { department } = req.query;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const filter = department ? { department, isActive: true } : { isActive: true };
  const [items, total] = await Promise.all([
    Employee.find(filter).select('-aadhaarNumber -salary').skip((page - 1) * limit).limit(limit),
    Employee.countDocuments(filter),
  ]);

  res.json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};
