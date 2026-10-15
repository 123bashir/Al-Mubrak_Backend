import express from 'express';
import {
    getAllInventory,
    adjustStock,
    getHistory,
    updateInventorySettings,
    adjustStockBulk,
    updatePaymentStatus
} from '../controllers/inventory.controller.js';
import { protect } from '../controllers/admin.controller.js';

const router = express.Router();

// All inventory routes are protected (Admin only)
router.use(protect);

router.get('/', getAllInventory);
router.post('/adjust', adjustStock);
router.post('/adjust-bulk', adjustStockBulk);
router.get('/history', getHistory);
router.put('/settings', updateInventorySettings);
router.put('/history/:log_id/payment-status', updatePaymentStatus);

export default router;
