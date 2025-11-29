import express from 'express';
import { createOrder, getOrders, getOrdersStats, deleteOrder, getRecentOrders, getLast30DaysOrders, getTodayTransactions, verifyOrder, cancelOrder, markDelivered, getMyOrders } from '../controllers/orders.controller.js';
import { verifyAdmin, verifyToken } from '../middlewares/verifyToken.js';

const router = express.Router();

// Get customer's own orders (authenticated users)
router.get('/my-orders', verifyToken, getMyOrders);

// Create a new order (accessible to authenticated users)
router.post('/', verifyToken, createOrder);

// Get order statistics (admin only)
router.get('/getOrdersStats', verifyAdmin, getOrdersStats);

// Get recent orders (last 20)
router.get('/recent', verifyAdmin, getRecentOrders);

// Get last 30 days orders data for charts
router.get('/last30days', verifyAdmin, getLast30DaysOrders);

// Get today's successful transactions (admin only)
router.get('/todayTransactions', verifyAdmin, getTodayTransactions);

// Get orders with optional filtering (admin only)
router.get('/', verifyAdmin, getOrders);

// Delete an order (authenticated users, ownership checked in controller)
router.delete('/:id', verifyToken, deleteOrder);

// Verify an order (admin only)
router.patch('/:id/verify', verifyAdmin, verifyOrder);

// Cancel an order (admin only)
router.patch('/:id/cancel', verifyAdmin, cancelOrder);

// Mark order as delivered (admin only)
router.patch('/:id/delivered', verifyAdmin, markDelivered);

export default router;