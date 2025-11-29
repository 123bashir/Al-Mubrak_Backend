import { db } from '../db.js';
import { sendEmailMessage } from '../services/gmailService.js';

const VALID_EMAIL_TYPES = ['transactional', 'promotional', 'newsletter'];

const sanitizeRecipients = (recipients = []) => {
  if (!Array.isArray(recipients)) return [];
  return recipients
    .map((recipient) => ({
      email: (recipient?.email || '').trim(),
      name: (recipient?.name || '').trim(),
    }))
    .filter((recipient) => recipient.email.length > 3 && recipient.email.includes('@'));
};

const buildEmailHtml = (content, recipientName = '') => {
  const safeContent = (content || '').replace(/\n/g, '<br />');
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hello,';
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; padding: 16px; background:#f8fafc;">
      <div style="max-width: 640px; margin: 0 auto; background:#ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);">
        <div style="text-align:center; margin-bottom: 24px;">
          <div style="font-size: 18px; font-weight: 600; color:#312e81;">Al-Mubarak Cosmetics</div>
          <div style="font-size: 14px; color:#64748b;">Delivering nationwide from Medile & Bakin Asibiti branches</div>
        </div>
        <p style="color:#111827; font-size:15px;">${greeting}</p>
        <p style="color:#1f2937; font-size:15px;">${safeContent}</p>
        <p style="margin-top:32px; color:#4c1d95; font-weight:600;">With love, <br/>Al-Mubarak Cosmetics</p>
      </div>
    </div>
  `;
};

const syncInboxWithServer = async (limit = 25) => {
  // IMAP inbox syncing disabled - Gmail API doesn't support this feature
  // If you need inbox syncing, you'll need to implement Gmail API's message fetching
  return 0;
};

export const sendEmail = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // Ensure content column can handle large base64 images
    try {
      await connection.query(`
        ALTER TABLE emails_sent 
        MODIFY COLUMN content LONGTEXT
      `);
    } catch (alterError) {
      // Column might already be LONGTEXT, ignore error
      console.log('[Email] Content column already LONGTEXT or migration not needed');
    }

    const { subject, content, type, template, recipients } = req.body || {};

    const normalizedRecipients = sanitizeRecipients(recipients);
    const missingFields = [];

    if (!subject || typeof subject !== 'string') {
      missingFields.push('subject');
    }
    if (!content || typeof content !== 'string') {
      missingFields.push('content');
    }
    if (!type || !VALID_EMAIL_TYPES.includes(type)) {
      missingFields.push(`type (allowed: ${VALID_EMAIL_TYPES.join(', ')})`);
    }
    if (normalizedRecipients.length === 0) {
      missingFields.push('recipients');
    }

    if (missingFields.length) {
      return res.status(422).json({
        success: false,
        message: `Missing or invalid fields: ${missingFields.join(', ')}`,
      });
    }

    const templateId = template && template.trim() !== '' ? template : null;
    let delivered = 0;
    let failed = 0;
    const failures = [];

    for (const recipient of normalizedRecipients) {
      let status = 'failed';
      try {
        await sendEmailMessage({
          to: recipient.email,
          subject,
          html: buildEmailHtml(content, recipient.name),
          text: content,
        });
        status = 'delivered';
        delivered++;
      } catch (error) {
        failed++;
        failures.push({ recipient: recipient.email, reason: error.message });
        console.error(`SMTP send failed for ${recipient.email}:`, error.message);
      }

      await connection.query(
        `INSERT INTO emails_sent
          (subject, content, type, template_id, status, sent_at, recipient_email, recipient_name)
         VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
        [
          subject.trim(),
          content.trim(),
          type,
          templateId,
          status,
          recipient.email,
          recipient.name || null,
        ]
      );
    }

    res.status(200).json({
      success: true,
      message: 'Emails processed',
      data: {
        delivered,
        failed,
        failures,
      },
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    connection.release();
  }
};

export const getSentEmails = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // Get query parameters with defaults
    const { search = '', limit = 100, offset = 0 } = req.query;

    // Validate and sanitize inputs
    const limitValue = Math.min(parseInt(limit) || 100, 200); // Max 200 items per page
    const offsetValue = Math.max(0, parseInt(offset) || 0);

    // Build the base query
    let query = `
      SELECT 
        s.id,
        s.subject,
        s.content,
        s.type,
        s.status,
        s.sent_at as sentAt,
        s.recipient_email as recipient,
        s.recipient_name as recipientName,
        s.template_id as template
      FROM emails_sent s
      WHERE 1=1
    `;

    const params = [];

    // Add search condition if provided
    if (search) {
      query += ' AND (s.subject LIKE ? OR s.content LIKE ? OR s.recipient_email LIKE ? OR s.recipient_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Add sorting and pagination
    query += ' ORDER BY s.sent_at DESC LIMIT ? OFFSET ?';
    params.push(limitValue, offsetValue);

    // Execute the query
    const [emails] = await connection.query(query, params);

    res.status(200).json({
      success: true,
      message: 'Sent emails fetched successfully',
      data: {
        items: emails,
        count: emails.length
      }
    });

  } catch (error) {
    console.error('Error fetching sent emails:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sent emails',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const getReceivedEmails = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await syncInboxWithServer(40);
    // Get query parameters with defaults
    const { search = '', limit = 100, offset = 0 } = req.query;

    // Validate and sanitize inputs
    const limitValue = Math.min(parseInt(limit) || 100, 200); // Max 200 items per page
    const offsetValue = Math.max(0, parseInt(offset) || 0);

    // Build the base query
    let query = `
      SELECT 
        i.id,
        i.sender_email as sender,
        i.sender_name as senderName,
        i.subject,
        i.content,
        i.status,
        i.priority,
        i.category,
        i.received_at as receivedAt
      FROM emails_inbox i
      WHERE i.is_archived = 0
    `;

    const params = [];

    // Add search condition if provided
    if (search) {
      query += ' AND (i.subject LIKE ? OR i.content LIKE ? OR i.sender_email LIKE ? OR i.sender_name LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Add sorting and pagination
    query += ' ORDER BY i.received_at DESC LIMIT ? OFFSET ?';
    params.push(limitValue, offsetValue);

    // Execute the query
    const [emails] = await connection.query(query, params);

    res.status(200).json({
      success: true,
      message: 'Inbox emails fetched successfully',
      data: {
        items: emails,
        count: emails.length
      }
    });

  } catch (error) {
    console.error('Error fetching received emails:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch received emails',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const getEmailTemplates = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // First try to get templates from the database
    let templates = [];
    let error = null;

    // Check if email_templates table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'email_templates'");

    if (tables.length > 0) {
      try {
        // Get templates from the database
        const [dbTemplates] = await connection.query(
          'SELECT id, name, subject, content FROM email_templates ORDER BY id DESC'
        );

        templates = dbTemplates.map(template => ({
          id: String(template.id),
          name: template.name,
          subject: template.subject,
          content: template.content
        }));
      } catch (dbError) {
        error = dbError.message;
      }
    }

    // If no templates found in database or error occurred, use default templates
    if (templates.length === 0) {
      templates = [
        {
          id: 'welcome',
          name: 'Welcome Email',
          subject: 'Welcome to Our Store!',
          content: 'Thank you for joining our store. We have exciting offers waiting for you!',
        },
        {
          id: 'order_confirmation',
          name: 'Order Confirmation',
          subject: 'Order Confirmation #{orderId}',
          content: 'Your order has been confirmed and is being processed. We will notify you when it ships.',
        },
        {
          id: 'pickup_ready',
          name: 'Pickup Ready',
          subject: 'Your Order is Ready for Pickup',
          content: 'Your order is ready for pickup. Please visit our store at your convenience.',
        },
        {
          id: 'promotion',
          name: 'Special Promotion',
          subject: 'Special Offer - {discount}% Off!',
          content: 'Don\'t miss our limited-time offer. Get {discount}% off on all items!',
        },
        {
          id: 'newsletter',
          name: 'Newsletter',
          subject: 'Newsletter - {month} {year}',
          content: 'Check out our latest products and updates in this month\'s newsletter.',
        }
      ];
    }

    res.status(200).json({
      success: true,
      message: 'Templates fetched successfully',
      data: { items: templates }
    });

  } catch (error) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch email templates',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const archiveEmail = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.body;

    // Validate input
    if (!id) {
      return res.status(422).json({
        success: false,
        message: 'Email ID is required'
      });
    }

    const emailId = parseInt(id);
    if (isNaN(emailId) || emailId <= 0) {
      return res.status(422).json({
        success: false,
        message: 'Invalid email ID'
      });
    }

    // Update the email as archived
    const [result] = await connection.query(
      'UPDATE emails_inbox SET is_archived = 1 WHERE id = ?',
      [emailId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Email not found or already archived'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Email archived successfully'
    });
  } catch (error) {
    console.error('Error archiving email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to archive email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const getCustomerInbox = async (req, res) => {
  const userEmail = req.user?.email;

  if (!userEmail) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  const connection = await db.getConnection();

  try {
    const { limit = 20, offset = 0 } = req.query;
    const limitValue = Math.min(parseInt(limit, 10) || 20, 100);
    const offsetValue = Math.max(parseInt(offset, 10) || 0, 0);

    const [items] = await connection.query(
      `SELECT 
        id,
        subject,
        content,
        type,
        status,
        sent_at AS sentAt,
        template_id AS templateId
       FROM emails_sent
       WHERE recipient_email = ?
       ORDER BY sent_at DESC
       LIMIT ? OFFSET ?`,
      [userEmail, limitValue, offsetValue]
    );

    const [[counts]] = await connection.query(
      `SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'opened' THEN 0 ELSE 1 END) AS unread
       FROM emails_sent
       WHERE recipient_email = ?`,
      [userEmail]
    );

    res.status(200).json({
      success: true,
      message: 'Inbox loaded',
      data: {
        items,
        total: counts?.total || 0,
        unread: counts?.unread || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching customer inbox:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load inbox',
    });
  } finally {
    connection.release();
  }
};

export const markCustomerEmailRead = async (req, res) => {
  const userEmail = req.user?.email;

  if (!userEmail) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  const { id } = req.params;
  const emailId = parseInt(id, 10);

  if (Number.isNaN(emailId)) {
    return res.status(422).json({
      success: false,
      message: 'Invalid message id',
    });
  }

  const connection = await db.getConnection();

  try {
    const [result] = await connection.query(
      `UPDATE emails_sent
       SET status = 'opened'
       WHERE id = ? AND recipient_email = ?`,
      [emailId, userEmail]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Message marked as read',
    });
  } catch (error) {
    console.error('Error marking customer email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update message',
    });
  } finally {
    connection.release();
  }
};