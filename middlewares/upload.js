import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configure Cloudinary (it will automatically pull from your environment variables or fallback values)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "du4laiwmj",
    api_key: process.env.CLOUDINARY_API_KEY || "567859429173318",
    api_secret: process.env.CLOUDINARY_API_SECRET || "csPinc3oHfZcXzyEU0rHNrQD9z4",
});

// Configure Cloudinary storage for avatars
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'almubarak_avatars',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        public_id_prefix: 'avatar-',
    },
});

const fileFilter = (req, file, cb) => {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

export const uploadAvatar = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});