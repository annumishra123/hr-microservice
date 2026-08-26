
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/employeeController');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/auth');

router.get('/me', protect, ctrl.getMe);

//  'profilePhoto' field-name multipart form-data me — frontend
// FormData.append('profilePhoto', file) isi naam se bhejni chahiye.
router.put('/me', protect, upload.single('profilePhoto'), ctrl.updateMe);

router.put('/:id/salary', ctrl.updateSalaryStructure);
router.get('/', ctrl.listByDepartment);

module.exports = router;