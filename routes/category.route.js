import express from 'express';
import { 
  createCategory, 
  deleteCategory, 
  getCategories,
  updateCategory,
} from '../controllers/category.controller.js';
import { verifyAdmin } from '../middlewares/verifyToken.js';

const router = express.Router();

// All routes in this file are protected and require admin privileges

// Get all categories (public)
router.get('/categories', getCategories);

// Get sub-categories (admin only, optional category_id filter)

// Create a new category (admin only)
router.post('/create_categories', verifyAdmin, createCategory);

// Update a category (admin only)
router.put('/categories/:id', verifyAdmin, updateCategory);

// Create a new sub-category (admin only)


// Delete a category (admin only)
router.delete('/categories/:id', verifyAdmin, deleteCategory);


export default router;