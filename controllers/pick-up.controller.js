import { db } from '../db.js';

// Generate random alphanumeric order ID with AMC prefix
const generateOrderId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `AMC-${code}`;
};

export const createPickUp = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      customer_name,
      customer_email,
      customer_avatar,
      total_amount,
      products_count,
      scheduled_date,
      status = 'pending'
    } = req.body;

    // Generate order ID with AMC prefix
    const order_id = generateOrderId();

    // Generate a random pickup code
    const pickup_code = Math.random().toString(36).substring(2, 10).toUpperCase();

    // Check if pickup_orders table exists, create if not
    const [tables] = await connection.query("SHOW TABLES LIKE 'pickup_orders'");
    if (tables.length === 0) {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS pickup_orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id VARCHAR(20) UNIQUE,
          customer_name VARCHAR(150),
          customer_email VARCHAR(150),
          customer_avatar VARCHAR(8),
          total_amount DECIMAL(10,2),
          products_count INT UNSIGNED,
          pickup_code VARCHAR(16),
          scheduled_date DATETIME,
          status ENUM('pending','picked_up','expired') DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_order_id (order_id)
        )
      `);
    }

    // Insert pickup order
    const [result] = await connection.query(
      `INSERT INTO pickup_orders (
        order_id, customer_name, customer_email, customer_avatar, 
        total_amount, products_count, pickup_code, scheduled_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        order_id,
        customer_name,
        customer_email,
        customer_avatar || null,
        total_amount,
        products_count,
        pickup_code,
        scheduled_date,
        status
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Pickup order created successfully',
      data: {
        id: order_id,
        databaseId: result.insertId,
        pickup_code,
        scheduled_date
      }
    });

  } catch (error) {
    console.error('Error creating pickup order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create pickup order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const getAllPickUps = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const [pickups] = await connection.query('SELECT * FROM pickup_orders ORDER BY created_at DESC');
    res.status(200).json({ success: true, data: pickups });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch pickups' });
  } finally {
    connection.release();
  }
};

export const getPickUp = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const [pickups] = await connection.query('SELECT * FROM pickup_orders WHERE id = ?', [req.params.id]);
    if (pickups.length === 0) return res.status(404).json({ success: false, message: 'Pickup not found' });
    res.status(200).json({ success: true, data: pickups[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch pickup' });
  } finally {
    connection.release();
  }
};

export const updatePickUp = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { status, scheduledDate } = req.body;
    const updates = [];
    const params = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);
    }
    if (scheduledDate) {
      updates.push('scheduled_date = ?');
      params.push(scheduledDate);
    }

    if (updates.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

    params.push(req.params.id);
    await connection.query(`UPDATE pickup_orders SET ${updates.join(', ')} WHERE id = ?`, params);

    res.status(200).json({ success: true, message: 'Pickup updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update pickup' });
  } finally {
    connection.release();
  }
};

export const getMyPickUps = async (req, res) => {
  const connection = await db.getConnection();
  try {
    // Get pickups for the logged-in user based on email
    // req.user is set by verifyToken middleware
    const [pickups] = await connection.query(
      `SELECT 
        id,
        order_id,
        customer_name,
        customer_email,
        total_amount,
        products_count,
        pickup_code,
        scheduled_date,
        status,
        created_at,
        'pickup' as order_type,
        'pending' as payment_status
      FROM pickup_orders 
      WHERE customer_email = ? 
      ORDER BY created_at DESC`,
      [req.user.email]
    );

    res.status(200).json({ success: true, data: pickups });
  } catch (error) {
    console.error('Error fetching my pickups:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch your pickups' });
  } finally {
    connection.release();
  }
};

export const deletePickUp = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const pickupId = req.params.id;

    // Check if pickup exists
    const [pickups] = await connection.query('SELECT * FROM pickup_orders WHERE id = ?', [pickupId]);

    if (pickups.length === 0) {
      return res.status(404).json({ success: false, message: 'Pickup not found' });
    }

    const pickup = pickups[0];

    // Check ownership (Admin or Owner)
    // req.user is set by verifyToken middleware
    if (req.user.role !== 'admin' && pickup.customer_email !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this pickup order'
      });
    }

    await connection.query('DELETE FROM pickup_orders WHERE id = ?', [pickupId]);
    res.status(200).json({ success: true, message: 'Pickup deleted successfully' });
  } catch (error) {
    console.error('Error deleting pickup:', error);
    res.status(500).json({ success: false, message: 'Failed to delete pickup' });
  } finally {
    connection.release();
  }
};