
const Employee = require('../models/Employee');
const cache = require('../config/cache');
const cloudinary = require('../config/cloudinary');

/**
 * Helper: Buffer ko Cloudinary pe upload karta hai (stream ke through)
 */
const uploadToCloudinary = async (buffer, folder) => {
  if (!buffer) {
    throw new Error('No file buffer received for upload');
  }

  const base64 = buffer.toString('base64');
  const dataURI = `data:image/jpeg;base64,${base64}`;

  return await cloudinary.uploader.upload(dataURI, {
    folder,
    resource_type: 'image',
    transformation: [
      {
        width: 500,
        height: 500,
        crop: 'fill',
        gravity: 'face',
      },
    ],
  });
};

// @desc Get own profile (cached)
exports.getMe = async (req, res) => {
  const cacheKey = `employee:${req.userId}`;
  const cached = await cache.getCached(cacheKey);
  if (cached) return res.json({ success: true, data: cached, cached: true });

  const employee = await Employee.findOne({ userId: req.userId }).select('+aadhaarNumber');
  if (!employee) return res.status(404).json({ success: false, message: 'Employee profile not found' });

  await cache.setCached(cacheKey, employee);
  res.json({ success: true, data: employee });
};

// @desc Update own profile (personal info + optionally profile photo via Cloudinary)
exports.updateMe = async (req, res) => {
  try {
    const userId = req.userId;

    console.log('---- updateMe called ----');
    console.log('Body:', req.body);
    console.log('File:', req.file ? { fieldname: req.file.fieldname, mimetype: req.file.mimetype, size: req.file.size } : 'No file');

    const employee = await Employee.findOne({ userId }).select('+profilePhotoId');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee profile not found' });
    }

    const {
      phone,
      dateOfBirth,
      gender,
      address,
      city,
      pincode,
      aadhaarNumber,
      panNumber,
      emergencyContacts,
    } = req.body;

    // ---------- Validation ----------
    if (phone !== undefined && phone !== '' && phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ success: false, message: 'Phone number must be at least 10 digits' });
    }

    if (aadhaarNumber !== undefined && aadhaarNumber !== '' && !/^\d{12}$/.test(aadhaarNumber)) {
      return res.status(400).json({ success: false, message: 'Aadhaar number must be exactly 12 digits' });
    }

    if (panNumber !== undefined && panNumber !== '' && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.toUpperCase())) {
      return res.status(400).json({ success: false, message: 'Invalid PAN format (e.g. ABCDE1234F)' });
    }

    // ---------- Update text fields ----------
    if (phone !== undefined) employee.phone = phone;

    if (dateOfBirth !== undefined) {
      if (dateOfBirth === '') {
        employee.dateOfBirth = null;
      } else {
        const parsedDate = new Date(dateOfBirth);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid date of birth format' });
        }
        employee.dateOfBirth = parsedDate;
      }
    }

    if (gender !== undefined) employee.gender = gender;
    if (address !== undefined) employee.address = address;
    if (city !== undefined) employee.city = city;
    if (pincode !== undefined) employee.pincode = pincode;
    if (aadhaarNumber !== undefined) employee.aadhaarNumber = aadhaarNumber;
    if (panNumber !== undefined) employee.panNumber = panNumber.toUpperCase();
    if (emergencyContacts !== undefined) employee.emergencyContacts = emergencyContacts;

    // ---------- Profile Photo Upload (Cloudinary) ----------
    if (req.file) {
      try {
        // Purani Cloudinary image delete karo (agar hai)
        if (employee.profilePhotoId) {
          try {
            await cloudinary.uploader.destroy(employee.profilePhotoId);
          } catch (delErr) {
            console.warn('Old Cloudinary image delete failed:', delErr.message);
          }
        }

        const result = await uploadToCloudinary(req.file.buffer, 'hrms/profile-photos');

        employee.profilePhoto = result.secure_url;
        employee.profilePhotoId = result.public_id;
      } catch (uploadErr) {
        console.error('Cloudinary upload error:', uploadErr);
        return res.status(500).json({
          success: false,
          message: 'Photo upload failed. Please try again.',
          error: uploadErr.message,
        });
      }
    }

    await employee.save();
    await cache.invalidate(`employee:${userId}`); // stale cache hata do

    const updatedEmployee = await Employee.findOne({ userId }).select('+aadhaarNumber');

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedEmployee,
    });
  } catch (err) {
    console.error('Update profile error:', err);

    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'This email/phone already exists' });
    }

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }

    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// @desc Update salary structure (HR/Admin)
exports.updateSalaryStructure = async (req, res) => {
  const employee = await Employee.findOneAndUpdate(
    { _id: req.params.id },
    { salary: req.body },
    { new: true, runValidators: true }
  );

  if (!employee) return res.status(404).json({ success: false, message: 'Employee profile not found' });
  res.json({ success: true, data: employee });
};

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



// @desc Add emergency contact
// POST /api/profile/emergency-contacts
exports.addEmergencyContact = async (req, res) => {
  try {
    const { name, relation, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' });
    }

    const employee = await Employee.findOne({ userId: req.userId });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee profile not found' });
    }

    employee.emergencyContacts.push({ name, relation, phone });
    await employee.save();

    await cache.invalidate(`employee:${req.userId}`); // stale cache hata do

    return res.status(201).json({
      success: true,
      message: 'Emergency contact added',
      data: employee.emergencyContacts,
    });
  } catch (err) {
    console.error('Add emergency contact error:', err);

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }

    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// @desc Get own emergency contacts
// GET /api/profile/emergency-contacts
exports.getEmergencyContacts = async (req, res) => {
  try {
    const employee = await Employee.findOne({ userId: req.userId }).select('emergencyContacts');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee profile not found' });
    }

    return res.status(200).json({
      success: true,
      data: employee.emergencyContacts,
    });
  } catch (err) {
    console.error('Get emergency contacts error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// @desc Delete an emergency contact
// DELETE /api/profile/emergency-contacts/:contactId
exports.deleteEmergencyContact = async (req, res) => {
  try {
    const { contactId } = req.params;

    const employee = await Employee.findOne({ userId: req.userId });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee profile not found' });
    }

    const contact = employee.emergencyContacts.id(contactId);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Emergency contact not found' });
    }

    contact.deleteOne(); // subdocument ko array se remove karta hai
    await employee.save();

    await cache.invalidate(`employee:${req.userId}`); // stale cache hata do

    return res.status(200).json({
      success: true,
      message: 'Emergency contact deleted',
      data: employee.emergencyContacts,
    });
  } catch (err) {
    console.error('Delete emergency contact error:', err);

    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid contact ID' });
    }

    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};