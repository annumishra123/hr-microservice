const RegularizeRequest = require('../models/RegularizeRequest');
const Attendance = require('../models/Attendance');
const EmployeeSnapshot = require('../models/EmployeeSnapshot'); 
const { publishCheckIn, publishCheckOut } = require('../events/publisher');
const { publishEvent } = require('../../shared/eventBus');


// ==================== EMPLOYEE SIDE ====================

// POST /regularize — naya request submit karo
async function submitRegularizeRequest(req, res) {
    try {
        const employeeId = req.userId;
        const { date, reason, requestedCheckInTime, requestedCheckOutTime, note } = req.body;

        if (!date || !reason || !note) {
            return res.status(400).json({ success: false, message: 'Date, reason aur note zaroori hain' });
        }

        const existingPending = await RegularizeRequest.findOne({
            employee: employeeId,
            date,
            status: {$in: ["pending", "approved"]}
        });

        if (existingPending) {
            return res.status(400).json({
                success: false,
                message: existingPending.status === "approved" ?
                 "Regularization is already approved for this date."
                 : "There is already a request pending for this date"
            });
        }

        const request = await RegularizeRequest.create({
            employee: employeeId,
            date,
            reason,
            requestedCheckInTime: requestedCheckInTime || null,
            requestedCheckOutTime: requestedCheckOutTime || null,
            note,
        });

        await publishEvent('regularize.requested', {
            requestId: request._id,
            employeeId,
            date,
            reason
        });

        res.status(201).json({ success: true, data: request });

    } catch (err) {
        console.error('submitRegularizeRequest error:', err);
        res.status(500).json({ success: false, message: 'The request could not be submitted.' });
    }
}


// GET /regularize/my — apni saari requests dekho (history tab ke liye)
async function getMyRegularizeRequests(req, res) {
    try {
        const employeeId = req.userId;
        const requests = await RegularizeRequest.find({ employee: employeeId }).sort({ createdAt: -1 });
        res.json({ success: true, data: requests });
    } catch (err) {
        console.error('getMyRegularizeRequests error:', err);
        res.status(500).json({ success: false, message: 'The requests could not be loaded.' });
    }
}

// GET /attendance/date/:date — us din ka actual attendance record dikhane ke liye
async function getAttendanceByDate(req, res) {
    try {
        const employeeId = req.userId;
        const { date } = req.params;
        const record = await Attendance.findOne({ userId: employeeId, date });
        res.json({ success: true, data: record || null });
    } catch (err) {
        console.error('getAttendanceByDate error:', err);
        res.status(500).json({ success: false, message: 'The attendance requests could not be loaded.' });
    }
}

// ==================== ADMIN/MANAGER SIDE ====================

// 🔴 NAYA helper — ek list of requests ko EmployeeSnapshot data se enrich karta hai
async function enrichWithEmployee(requests) {
  const employeeIds = [...new Set(requests.map(r => r.employee.toString()))];
  const snapshots = await EmployeeSnapshot.find({ _id: { $in: employeeIds } });

  const map = {};
  snapshots.forEach(s => { map[s._id.toString()] = s; });

  return requests.map(r => {
    const obj = r.toObject ? r.toObject() : r;
    obj.employee = map[r.employee.toString()] || null;
    return obj;
  });
}

// GET /regularize/pending — admin ke liye requests (status filter optional, default = pending)
async function getPendingRequests(req, res) {
    try {
      const filter = req.query.status ? { status: req.query.status } : { status: 'pending' };
      const requests = await RegularizeRequest.find(filter).sort({ createdAt: -1 });
      const enriched = await enrichWithEmployee(requests); // 🔴 NAYA
      res.json({ success: true, data: enriched });
    } catch (err) {
      console.error('getPendingRequests error:', err);
      res.status(500).json({ success: false, message: 'Pending requests load nahi ho sakin' });
    }
}

// 🔴 NAYA — GET /regularize/:id — single request ka detail (modal ke liye)
async function getRegularizeRequestById(req, res) {
  try {
    const { id } = req.params;
    const request = await RegularizeRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request nahi mili' });
    }

    const employee = await EmployeeSnapshot.findById(request.employee);
    const currentAttendance = await Attendance.findOne({ userId: request.employee, date: request.date });

    const requestObj = request.toObject();
    requestObj.employee = employee || null;

    res.json({ success: true, data: { request: requestObj, currentAttendance } });
  } catch (err) {
    console.error('getRegularizeRequestById error:', err);
    res.status(500).json({ success: false, message: 'Could not load request.' });
  }
}

// PATCH /regularize/:id/approve
async function approveRequest(req, res) {
    try {
      const managerId = req.userId;
      const { id } = req.params;
      const { managerComment } = req.body;

      const request = await RegularizeRequest.findById(id);
      if (!request) {
        return res.status(404).json({ success: false, message: 'Request nahi mili' });
      }
      if (request.status !== 'pending') {
        return res.status(400).json({ success: false, message: 'Ye request pehle hi review ho chuki hai' });
      }

      let attendance = await Attendance.findOne({ userId: request.employee, date: request.date });
      if (!attendance) {
        attendance = new Attendance({ userId: request.employee, date: request.date });
      }

      if (request.requestedCheckInTime) {
        attendance.checkIn = combineDateAndTime(request.date, request.requestedCheckInTime);
        attendance.checkInLocation = attendance.checkInLocation || 'Regularized';
      }
      if (request.requestedCheckOutTime) {
        attendance.checkOut = combineDateAndTime(request.date, request.requestedCheckOutTime);
        attendance.checkOutLocation = attendance.checkOutLocation || 'Regularized';
      }
      attendance.status = 'present';
      await attendance.save();

      request.status = 'approved';
      request.managerComment = managerComment || null;
      request.reviewedBy = managerId;
      request.reviewedAt = new Date();
      await request.save();

      await publishEvent('regularize.approved', {
        requestId: request._id,
        employeeId: request.employee,
        date: request.date,
        managerComment: request.managerComment,
      });

      // 🔴 response ko bhi enrich karo taaki frontend ko turant employee name mile
      const [enriched] = await enrichWithEmployee([request]);
      res.json({ success: true, data: enriched });
    } catch (err) {
      console.error('approveRequest error:', err);
      res.status(500).json({ success: false, message: 'Request approve nahi ho saki' });
    }
}

// PATCH /regularize/:id/reject
async function rejectRequest(req, res) {
    try {
      const managerId = req.userId;
      const { id } = req.params;
      const { managerComment } = req.body;

      const request = await RegularizeRequest.findById(id);
      if (!request) {
        return res.status(404).json({ success: false, message: 'Request nahi mili' });
      }
      if (request.status !== 'pending') {
        return res.status(400).json({ success: false, message: 'Ye request pehle hi review ho chuki hai' });
      }

      request.status = 'rejected';
      request.managerComment = managerComment || null;
      request.reviewedBy = managerId;
      request.reviewedAt = new Date();
      await request.save();

      await publishEvent('regularize.rejected', {
        requestId: request._id,
        employeeId: request.employee,
        date: request.date,
        managerComment: request.managerComment,
      });

      const [enriched] = await enrichWithEmployee([request]); 
      res.json({ success: true, data: enriched });
    } catch (err) {
      console.error('rejectRequest error:', err);
      res.status(500).json({ success: false, message: 'Request reject nahi ho saki' });
    }
}

function combineDateAndTime(dateStr, timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const combined = new Date(dateStr);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
}

module.exports = {
    submitRegularizeRequest,
    getMyRegularizeRequests,
    getAttendanceByDate,
    getPendingRequests,
    getRegularizeRequestById, 
    approveRequest,
    rejectRequest
};