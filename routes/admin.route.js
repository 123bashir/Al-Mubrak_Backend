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
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configure Cloudinary (pulls from environment variables or defaults)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "du4laiwmj",
  api_key: process.env.CLOUDINARY_API_KEY || "567859429173318",
  api_secret: process.env.CLOUDINARY_API_SECRET || "csPinc3oHfZcXzyEU0rHNrQD9z4",
});

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'almubarak_avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  },
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
