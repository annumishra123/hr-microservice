const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/regularizeController');
const { protect } = require('../middleware/auth');


// // ---- Employee routes ----

router.post('/', protect, ctrl.submitRegularizeRequest);
router.get('/my', protect, ctrl.getMyRegularizeRequests);



module.exports = router;
