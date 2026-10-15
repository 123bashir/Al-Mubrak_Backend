import express from 'express';
import { getCustomer, deleteCustomer, getCustomers, updateCustomer, getTop10Buyers } from '../controllers/customer.controller.js';
import { verifyAdmin, verifyToken } from '../middlewares/verifyToken.js';
import { uploadAvatar } from '../middlewares/upload.js';

const router = express.Router();

// All routes in this file are protected

// Get top 10 buyers (admin only)
router.get('/top10buyers', verifyAdmin, getTop10Buyers);

// Get all customers with filtering and pagination (admin only)
router.get('/', verifyAdmin, getCustomers);

// Get customer by ID (admin only)
router.get('/:id', verifyAdmin, getCustomer);

// Update a customer (authenticated user can update their own profile)
router.put('/:id', verifyToken, uploadAvatar.single('profile_image'), updateCustomer);

// Delete a customer (admin only)
router.delete('/:id', verifyAdmin, deleteCustomer);

export default router;