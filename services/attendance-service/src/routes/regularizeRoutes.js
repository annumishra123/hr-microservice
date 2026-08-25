const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/regularizeController');
const { protect } = require('../middleware/auth');


// // ---- Employee routes ----

router.post('/', protect, ctrl.submitRegularizeRequest);
router.get('/my', protect, ctrl.getMyRegularizeRequests);
router.get('/pending',protect,  ctrl.getPendingRequests);
router.patch('/:id/approve', protect, ctrl.approveRequest);
router.patch('/:id/reject', protect, ctrl.rejectRequest);



module.exports = router;
