import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  login,
  verifyToken,
  protect,
  getProfile,
  updateProfile,
  updatePassword,
  logout
} from '../controllers/admin.controller.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const avatarUploadsDir = path.join(__dirname, '..', 'uploads', 'admins');

fs.mkdirSync(avatarUploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarUploadsDir),
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const extension = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, extension).replace(/\s+/g, '_');
    cb(null, `${timestamp}_${baseName}${extension}`);
  }
});

const fileFilter = (_req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image uploads are allowed'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 } // 3MB
});

// Public routes
router.post('/login', login);
router.get('/verify-token', verifyToken);

// Protected routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, upload.single('avatarImage'), updateProfile);
router.put('/password', protect, updatePassword);
router.post('/logout', protect, logout);

export default router;
