import express from 'express';
import { 
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff
} from '../controllers/staff.controller.js';
import { verifyAdmin } from '../middlewares/verifyToken.js';

const router = express.Router();

// All routes require admin authentication
router.get('/staff', verifyAdmin, getStaff);
router.post('/staff', verifyAdmin, createStaff);
router.put('/staff/:id', verifyAdmin, updateStaff);
router.delete('/staff/:id', verifyAdmin, deleteStaff);

export default router;

