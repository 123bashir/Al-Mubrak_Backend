import express from 'express';
import { verifyToken } from '../middlewares/verifyToken.js';
import * as cartController from '../controllers/cart.controller.js';

const router = express.Router();

// All cart routes require authentication 
router.use(verifyToken);

router.post('/add', cartController.addToCart);
router.get('/', cartController.getCart);
router.put('/update/:itemId', cartController.updateCartItem);
router.delete('/remove/:itemId', cartController.removeFromCart);

export default router;
