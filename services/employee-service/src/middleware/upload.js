const multer = require('multer');

// ✅ memoryStorage — file disk pe save nahi hogi, buffer mein aayegi (req.file.buffer)
// Cloudinary jaisi cloud services ke liye ye zaroori hai
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|pdf|webp/;
  const extOk = allowed.test(file.originalname.split('.').pop().toLowerCase());
  const mimeOk = allowed.test(file.mimetype);
  if (extOk && mimeOk) return cb(null, true);
  cb(new Error('Only images (jpg, png, webp) and PDF files are allowed'), false);
};

const maxSizeMb = Number(process.env.MAX_FILE_SIZE_MB || 10);

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSizeMb * 1024 * 1024 },
});

module.exports = upload;