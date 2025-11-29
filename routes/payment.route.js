import express from 'express';
import { 
  confirmPayment, 
  createPaymentMethod, 
  deletePaymentMethod,
  getPaymentMethods,
  updatePaymentMethod,
  getPaymentTransactions,
  updatePaymentTransactionStatus
} from '../controllers/payment.controller.js';
import { verifyAdmin } from '../middlewares/verifyToken.js';

const router = express.Router();

// Get all payment methods (public endpoint)
router.get('/methods', getPaymentMethods);

// Create payment method (admin only)
router.post('/methods', verifyAdmin, createPaymentMethod);

// Update payment method (admin only)
router.put('/methods/:id', verifyAdmin, updatePaymentMethod);

// Delete payment method (admin only)
router.delete('/methods/:id', verifyAdmin, deletePaymentMethod);

// Transactions management (admin only)
router.get('/transactions', verifyAdmin, getPaymentTransactions);
router.patch('/transactions/:id/status', verifyAdmin, updatePaymentTransactionStatus);

// Submit payment confirmation (public endpoint)
router.post('/confirm', confirmPayment);

export default router;