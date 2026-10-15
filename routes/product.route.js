import express from 'express';
import { body, param, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as productController from '../controllers/product.controller.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'uploads', 'products');

fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
        const timestamp = Date.now();
        const sanitizedOriginal = file.originalname.replace(/\s+/g, '_');
        cb(null, `${timestamp}_${sanitizedOriginal}`);
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
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Validation middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
        return next();
    }
    return res.status(400).json({
        success: false,
        errors: errors.array()
    });
};

// Create a new product
router.post('/addNewProduct',
    [
        // Required fields
        body('nameEn').trim().notEmpty().withMessage('Product name in English is required'),
        body('price')
            .isFloat({ gt: 0 }).withMessage('Price must be a positive number')
            .toFloat(),
        body('categoryId')
            .isInt({ gt: 0 }).withMessage('Valid category ID is required')
            .toInt(),
        body('categoryName')
            .notEmpty().withMessage('Category name is required')
            .trim(),
        body('branch')
            .optional()
            .trim()
            .isIn(['medile branch', 'bakin asibit branch']).withMessage('Branch must be either "medile branch" or "bakin asibit branch"'),

        // Optional fields with validation
        body('shortDescEn')
            .optional()
            .trim()
            .isLength({ max: 500 }).withMessage('Short description must be less than 500 characters'),
        body('status')
            .optional()
            .isIn(['active', 'inactive']).withMessage('Status must be either active or inactive'),
        body('is_popular')
            .optional()
            .isBoolean().withMessage('is_popular must be a boolean'),
        body('rating')
            .optional()
            .isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5')
            .toFloat(),
        body('images')
            .optional()
            .isArray().withMessage('Images must be an array')
            .custom((images) => {
                if (!Array.isArray(images)) return true;
                return images.every(img => typeof img === 'string');
            }).withMessage('Images must be an array of strings (URLs)'),
        body('colors')
            .optional()
            .isArray().withMessage('Colors must be an array')
            .custom((colors) => {
                if (!Array.isArray(colors)) return true;
                return colors.every(color => typeof color === 'string');
            }).withMessage('Colors must be an array of strings (color codes)'),
        validate
    ],
    productController.createProduct
);

// Upload product image
router.post(
    '/upload-image',
    upload.single('image'),
    (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image provided'
            });
        }

        const relativePath = path.join('uploads', 'products', req.file.filename).replace(/\\/g, '/');
        const fileUrl = `${req.protocol}://${req.get('host')}/${relativePath}`;

        return res.status(201).json({
            success: true,
            message: 'Image uploaded successfully',
            url: fileUrl,
            path: `/${relativePath}`
        });
    }
);

// Get total number of products
router.get('/total', productController.getTotalProducts);

// Get total product cost (sum of all product prices)
router.get('/totalCost', productController.getTotalProductCost);

// Get all products
router.get('/totalProduct', productController.getProducts);

// Get single product
router.get(
    '/product/:id',
    [
        param('id')
            .isInt({ min: 1 }).withMessage('Product ID must be a positive integer')
            .toInt(),
        validate
    ],
    productController.getProduct
);

// Update a product
router.put(
    '/updateProduct/:id',
    [
        param('id')
            .isInt({ min: 1 }).withMessage('Product ID must be a positive integer')
            .toInt(),
        // Optional validation for update fields
        body('nameEn').optional().trim().notEmpty().withMessage('Product name cannot be empty'),
        body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
        body('categoryId').optional().isInt({ min: 1 }).withMessage('Category ID must be a positive integer'),
        body('categoryName').optional().trim().notEmpty().withMessage('Category name cannot be empty'),
        body('branch').optional().trim().isIn(['medile branch', 'bakin asibit branch']).withMessage('Branch must be either "medile branch" or "bakin asibit branch"'),
        body('shortDescEn').optional().trim().isLength({ max: 500 }).withMessage('Short description must be less than 500 characters'),
        body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be either active or inactive'),
        body('is_popular').optional().isBoolean().withMessage('is_popular must be a boolean'),
        body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
        body('images').optional().isArray().withMessage('Images must be an array'),
        body('colors').optional().isArray().withMessage('Colors must be an array'),
        validate
    ],
    productController.updateProduct
);

// Delete a product
router.delete(
    '/deleteProduct/:id',
    [
        param('id')
            .isInt({ min: 1 }).withMessage('Product ID must be a positive integer')
            .toInt(),
        validate
    ],
    productController.deleteProduct
);

export default router;