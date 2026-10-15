import express from 'express';
import { 
  getSentEmails,
  getReceivedEmails,
  getEmailTemplates, 
  archiveEmail,
  sendEmail,
  getCustomerInbox,
  markCustomerEmailRead
} from '../controllers/email.controller.js';
import { verifyAdmin, verifyToken } from '../middlewares/verifyToken.js';

const router = express.Router();

// Get sent emails (admin only)
router.get('/sent', verifyAdmin, getSentEmails);

// Get received emails (admin only)
router.get('/received', verifyAdmin, getReceivedEmails);

// Get email templates (admin only)
router.get('/templates', verifyAdmin, getEmailTemplates);

// Send a new email (admin only)
router.post('/send', verifyAdmin, sendEmail);

// Archive an email (admin only)
router.post('/archive', verifyAdmin, archiveEmail);

// Customer inbox / notifications
router.get('/customer/inbox', verifyToken, getCustomerInbox);
router.patch('/customer/inbox/:id/read', verifyToken, markCustomerEmailRead);

export default router;