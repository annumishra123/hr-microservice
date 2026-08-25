const RegularizeRequest = require('../models/RegularizeRequest');
const Attendance = require('../models/Attendance');
const { publishCheckIn, publishCheckOut } = require('../events/publisher');
const { publishEvent } = require('../../shared/eventBus');


// ==================== EMPLOYEE SIDE ====================

// POST /regularize — naya request submit karo

async function submitRegularizeRequest(req, res) {
    try {
        const employeeId = req.userId
        const { date, reason, requestedCheckInTime, requestedCheckOutTime, note } = req.body;

        if (!date || !reason || !note) {
            return res.status(400).json({ success: false, message: 'Date, reason aur note zaroori hain' });
        }

        const existingPending = await RegularizeRequest.findOne({
            employee: employeeId,
            date,
            status: "pending"
        })

        if (existingPending) {
            return res.status(400).json({
                status: false,
                message: "There is already a request pending for this date."
            })
        }

        const request = await RegularizeRequest.create({
            employee: employeeId,
            date,
            reason,
            requestedCheckInTime: requestedCheckInTime || null,
            requestedCheckOutTime: requestedCheckOutTime || null,
            note,
        })

        // Manager/admin ko notify karne ke liye event publish karo

        await publishEvent('regularize.requested', {
            requestId: request._id,
            employeeId,
            date,
            reason
        })

        res.status(201).json({ success: true, data: request });

    } catch (err) {
        console.error('submitRegularizeRequest error:', err);
        res.status(500).json({ success: false, message: 'The request could not be submitted.' });
    }
}


// GET /regularize/my — apni saari requests dekho (history tab ke liye)

async function getMyRegularizeRequests(req, res) {
    try {
        const employeeId = req.userId
        const requests = await RegularizeRequest.find({ employee: employeeId }).sort({ createdAt: -1 })
        res.json({ success: true, data: requests })
    } catch (err) {
        console.error('getMyRegularizeRequests error:', err);
        res.status(500).json({ success: false, message: 'The requests could not be loaded.' });
    }
}

// GET /attendance/date/:date — us din ka actual attendance record dikhane ke liye

async function getAttendanceByDate(req, res) {
    try {
        const employeeId = req.userId
        const { date } = req.params;
        const record = await Attendance.findOne({ userId: employeeId, date })
        res.json({ success: true, data: record || null });
    } catch (err) {
        console.error('getAttendanceByDate error:', err);
        res.status(500).json({ success: false, message: 'The attendance requests could not be loaded.' });
    }
}

// ==================== ADMIN/MANAGER SIDE ====================


// GET /regularize/pending — admin ke liye saari pending requests (across employees)

async function getPendingRequests(req, res) {
    try {
      const requests = await RegularizeRequest.find({ status: 'pending' }).sort({ createdAt: -1 });
      res.json({ success: true, data: requests });
    } catch (err) {
      console.error('getPendingRequests error:', err);
      res.status(500).json({ success: false, message: 'Pending requests load nahi ho sakin' });
    }
  }


  // PATCH /regularize/:id/approve

  

module.exports = {
    submitRegularizeRequest,
    getMyRegularizeRequests,
    getAttendanceByDate,
    getPendingRequests
};