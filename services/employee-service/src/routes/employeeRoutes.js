const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/employeeController');
const { protect } = require('../middleware/auth');

router.get('/me', protect, ctrl.getMe);
router.patch('/me', protect, ctrl.updateMe);
router.get('/', protect, ctrl.listByDepartment);
router.put('/:id/salary', protect, ctrl.updateSalaryStructure);

module.exports = router;
