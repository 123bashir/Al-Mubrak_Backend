import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsPath = path.join(__dirname, '../../uploads');
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
        folder: 'almubarak_uploads',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    },
});

const upload = multer({ storage });

const router = express.Router();

// Single file upload (field name 'image')
router.post('/', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const fileUrl = `${req.protocol}://${req.get('host')}/api/uploads/${req.file.filename}`;
    res.json({ success: true, fileUrl, fileName: req.file.filename });
});

export default router;
