import express from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validation.js';
import {
  createPickUp,
  getPickUp,
  updatePickUp,
  deletePickUp,
  getAllPickUps,
  getMyPickUps
} from '../controllers/pick-up.controller.js';

import { verifyToken, verifyAdmin } from '../middlewares/verifyToken.js';

const router = express.Router();

// Get customer's own pickups (authenticated users)
router.get('/my-pickups', verifyToken, getMyPickUps);

// Create a new pick-up
router.post('/', createPickUp);

// Get all pick-ups
router.get(
  '/',
  [
    // Pagination parameters
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    // Filter parameters
    query('status').optional().isIn(['pending', 'picked_up', 'expired'])
      .withMessage('Invalid status value'),
    query('customerId').optional().isInt({ min: 1 }).withMessage('Customer ID must be a positive integer'),
    query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
    query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO date'),
    validate
  ],
  getAllPickUps
);

// Get a single pick-up by ID
router.get(
  '/:id',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Pick-up ID must be a positive integer'),
    validate
  ],
  getPickUp
);

// Update a pick-up by ID
router.put(
  '/:id',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Pick-up ID must be a positive integer')
      .toInt(),
    body('status')
      .optional()
      .isIn(['pending', 'picked_up', 'expired'])
      .withMessage('Invalid status'),
    body('scheduledDate')
      .optional()
      .isISO8601()
      .withMessage('Valid scheduled date is required (ISO format)'),
    validate
  ],
  updatePickUp
);

// Delete a pick-up by ID (authenticated users, ownership checked in controller)
router.delete('/:id', verifyToken, deletePickUp);

export default router;