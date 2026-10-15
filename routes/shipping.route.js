import express from 'express';
import {
  getShippingCompanies,
  createShippingCompany,
  updateShippingCompany,
  deleteShippingCompany,
} from '../controllers/shipping.controller.js';
import { verifyAdmin } from '../middlewares/verifyToken.js';

const router = express.Router();

router.get('/', verifyAdmin, getShippingCompanies);
router.post('/', verifyAdmin, createShippingCompany);
router.put('/:id', verifyAdmin, updateShippingCompany);
router.delete('/:id', verifyAdmin, deleteShippingCompany);

export default router;

