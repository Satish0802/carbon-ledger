const fs = require('fs');
const path = require('path');
const multer = require('multer');

const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${req.params.uid}_${Date.now()}${ext}`);
  },
});

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function fileFilter(req, file, cb) {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed'));
  }
  cb(null, true);
}

const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = { uploadAvatar, AVATAR_DIR };