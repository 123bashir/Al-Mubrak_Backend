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

export const createOrder = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      customer_id,
      customer_name,
      customer_email,
      total_amount,
      items_count,
      status = 'pending'
    } = req.body;

    // Validate required fields
    if (!customer_id || !total_amount) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID and total amount are required'
      });
    }

    // Generate unique order ID
    const orderId = generateOrderId();

    // Check if orders table exists, create if not
    const [tables] = await connection.query("SHOW TABLES LIKE 'orders'");
    if (tables.length === 0) {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id VARCHAR(20) UNIQUE,
          customer VARCHAR(150),
          total DECIMAL(10,2),
          status ENUM('pending','processing','completed','successful','delivered','canceled','returned','failed') DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          items_count INT UNSIGNED,
          customer_id INT,
          customer_email VARCHAR(255),
          INDEX idx_order_id (order_id)
        )
      `);
    } else {
      // Check if order_id column exists, add if not
      const [columns] = await connection.query("SHOW COLUMNS FROM orders LIKE 'order_id'");
      if (columns.length === 0) {
        await connection.query("ALTER TABLE orders ADD COLUMN order_id VARCHAR(20) UNIQUE AFTER id");
        await connection.query("CREATE INDEX idx_order_id ON orders(order_id)");
      }
    }

    // Insert order
    const [result] = await connection.query(
      `INSERT INTO orders (order_id, customer, total, status, items_count, customer_id, customer_email)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        customer_name || 'Guest',
        total_amount,
        status,
        items_count || 0,
        customer_id,
        customer_email || null
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        id: orderId,
        databaseId: result.insertId,
        customer: customer_name,
        total: total_amount,
        status,
        items_count,
        customer_id,
        customer_email
      }
    });

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

// Get customer's own orders
export const getMyOrders = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const customerId = req.user.id; // From verifyToken middleware

    // Check if orders table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'orders'");
    if (tables.length === 0) {
      connection.release();
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    // Get customer's orders
    const [orders] = await connection.query(
      `SELECT 
        id,
        customer as customer_name,
        customer_email,
        total as total_amount,
        status,
        items_count as products_count,
        created_at,
        'delivery' as order_type,
        'pending' as payment_status
      FROM orders
      WHERE customer_id = ?
      ORDER BY created_at DESC`,
      [customerId]
    );

    // Generate order IDs
    const ordersWithIds = orders.map(order => ({
      ...order,
      order_id: `ORD-${order.id}`,
      order_date: order.created_at
    }));

    connection.release();
    res.status(200).json({
      success: true,
      data: ordersWithIds
    });
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    connection.release();
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
};

export const getLast30DaysOrders = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // Check if orders table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'orders'");
    if (tables.length === 0) {
      // Return empty data structure if table doesn't exist
      const today = new Date();
      const result = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        result.push({
          date: date.toISOString().split('T')[0],
          total_orders: 0,
          total_revenue: 0,
          completed_orders: 0,
          pending_orders: 0,
          cancelled_orders: 0
        });
      }
      connection.release();
      return res.status(200).json({
        success: true,
        data: result
      });
    }

    // Check what columns exist in orders table
    const [columns] = await connection.query("SHOW COLUMNS FROM `orders`");
    const columnNames = columns.map(col => col.Field.toLowerCase());

    // Determine column names with fallbacks
    const createdAtCol = columnNames.find(c => c === 'created_at' || c === 'order_date' || c === 'date') || 'created_at';
    const amountCol = columnNames.find(c => c === 'total_amount' || c === 'total' || c === 'amount' || c === 'grand_total') || 'total_amount';
    const statusCol = columnNames.find(c => c === 'status' || c === 'order_status') || 'status';

    const [orders] = await connection.query(`
      SELECT 
        DATE(\`${createdAtCol}\`) as date,
        COUNT(*) as total_orders,
        COALESCE(SUM(\`${amountCol}\`), 0) as total_revenue,
        SUM(CASE WHEN \`${statusCol}\` = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN \`${statusCol}\` = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN \`${statusCol}\` = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders
      FROM \`orders\`
      WHERE \`${createdAtCol}\` >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(\`${createdAtCol}\`)
      ORDER BY date ASC
    `);

    // Format data for chart
    const labels = [];
    const data = {
      total_orders: [],
      total_revenue: [],
      completed_orders: [],
      pending_orders: [],
      cancelled_orders: []
    };

    // Fill in missing dates with zeros
    const today = new Date();
    const dateMap = new Map();

    // Initialize last 30 days with zeros
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dateMap.set(dateStr, {
        date: dateStr,
        total_orders: 0,
        total_revenue: 0,
        completed_orders: 0,
        pending_orders: 0,
        cancelled_orders: 0
      });
    }

    // Update with actual data
    orders.forEach(order => {
      if (dateMap.has(order.date)) {
        dateMap.set(order.date, {
          date: order.date,
          total_orders: parseInt(order.total_orders),
          total_revenue: parseFloat(order.total_revenue) || 0,
          completed_orders: parseInt(order.completed_orders),
          pending_orders: parseInt(order.pending_orders),
          cancelled_orders: parseInt(order.cancelled_orders)
        });
      }
    });

    // Convert map to arrays for response
    const result = Array.from(dateMap.values());

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching last 30 days orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching last 30 days orders',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

export const getRecentOrders = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const [orders] = await connection.query(
      `SELECT o.*, c.name as customer_name, c.email as customer_email 
       FROM orders o 
       LEFT JOIN customers c ON o.customer_id = c.id 
       ORDER BY o.created_at DESC 
       LIMIT 20`
    );

    res.status(200).json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching recent orders:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent orders',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

export const getOrdersStats = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // Check if orders table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'orders'");
    const tableExists = tables.length > 0;

    let completed = 0;
    let pendingProcessing = 0;
    let total = 0;

    if (tableExists) {
      // Check if status column exists
      const [statusColumn] = await connection.query(
        "SHOW COLUMNS FROM `orders` LIKE 'status'"
      );
      const statusExists = statusColumn.length > 0;

      if (statusExists) {
        // Get completed orders count
        const [completedResult] = await connection.query(
          "SELECT COUNT(*) AS count FROM `orders` WHERE `status` IN ('completed','successful','delivered')"
        );
        completed = completedResult[0].count || 0;

        // Get pending + processing orders count
        const [pendingResult] = await connection.query(
          "SELECT COUNT(*) AS count FROM `orders` WHERE `status` IN ('pending')"
        );
        pendingProcessing = pendingResult[0].count || 0;
      }

      // Always get total count
      const [totalResult] = await connection.query(
        "SELECT COUNT(*) AS count FROM `orders`"
      );
      total = totalResult[0].count || 0;
    }

    res.status(200).json({
      success: true,
      message: 'Orders stats fetched',
      data: {
        completed: parseInt(completed),
        pendingProcessing: parseInt(pendingProcessing),
        total: parseInt(total)
      }
    });

  } catch (error) {
    console.error('Error fetching order stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const getOrders = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // Get query parameters
    const { id, email, user_id: userId } = req.query;

    // Check if orders table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'orders'");
    const tableExists = tables.length > 0;

    if (!tableExists) {
      return res.status(200).json({
        success: true,
        message: 'Orders table does not exist',
        data: []
      });
    }

    // Get column information
    const [columns] = await connection.query("SHOW COLUMNS FROM `orders`");
    const cols = {};
    columns.forEach(col => {
      cols[col.Field.toLowerCase()] = true;
    });

    // Build SELECT with field mapping
    const selectParts = [];

    // Map fields with fallbacks
    if (cols['id']) selectParts.push('`id` AS _id');
    else if (cols['order_id']) selectParts.push('`order_id` AS _id');

    if (cols['customer']) selectParts.push('`customer` AS _customer');
    else if (cols['customer_name']) selectParts.push('`customer_name` AS _customer');
    else if (cols['name']) selectParts.push('`name` AS _customer');
    else if (cols['user_name']) selectParts.push('`user_name` AS _customer');
    else if (cols['email']) selectParts.push('`email` AS _customer');

    if (cols['customer_email']) selectParts.push('`customer_email` AS _email');
    else if (cols['email']) selectParts.push('`email` AS _email');

    if (cols['total']) selectParts.push('`total` AS _total');
    else if (cols['total_amount']) selectParts.push('`total_amount` AS _total');
    else if (cols['amount']) selectParts.push('`amount` AS _total');
    else if (cols['grand_total']) selectParts.push('`grand_total` AS _total');

    if (cols['status']) selectParts.push('`status` AS _status');
    else if (cols['order_status']) selectParts.push('`order_status` AS _status');

    if (cols['created_at']) selectParts.push('`created_at` AS _date');
    else if (cols['order_date']) selectParts.push('`order_date` AS _date');
    else if (cols['date']) selectParts.push('`date` AS _date');

    if (cols['items_count']) selectParts.push('`items_count` AS _items');
    else if (cols['items']) selectParts.push('`items` AS _items');
    else if (cols['quantity']) selectParts.push('`quantity` AS _items');

    // Optional fields
    if (cols['shipping_method']) selectParts.push('`shipping_method` AS _shipping_method');
    if (cols['shipping_address']) selectParts.push('`shipping_address` AS _shipping_address');
    if (cols['tracking_number']) selectParts.push('`tracking_number` AS _tracking_number');
    if (cols['payment_method']) selectParts.push('`payment_method` AS _payment_method');
    if (cols['subtotal']) selectParts.push('`subtotal` AS _subtotal');
    if (cols['tax']) selectParts.push('`tax` AS _tax');
    if (cols['shipping']) selectParts.push('`shipping` AS _shipping');
    if (cols['grand_total']) selectParts.push('`grand_total` AS _grand_total');

    const select = selectParts.length > 0 ? selectParts.join(', ') : '*';

    // Build WHERE conditions
    const where = [];
    const params = [];

    if (id) {
      if (cols['id']) where.push('`id` = ?');
      else if (cols['order_id']) where.push('`order_id` = ?');
      if (where.length > 0) params.push(parseInt(id));
    }

    if (email) {
      const emailConditions = [];
      if (cols['email']) emailConditions.push('`email` = ?');
      if (cols['customer_email']) emailConditions.push('`customer_email` = ?');
      if (cols['user_email']) emailConditions.push('`user_email` = ?');

      if (emailConditions.length > 0) {
        where.push('(' + emailConditions.join(' OR ') + ')');
        // Add the email parameter for each condition
        for (let i = 0; i < emailConditions.length; i++) {
          params.push(email);
        }
      }
    }

    if (userId) {
      const userIdConditions = [];
      if (cols['user_id']) userIdConditions.push('`user_id` = ?');
      if (cols['customer_id']) userIdConditions.push('`customer_id` = ?');

      if (userIdConditions.length > 0) {
        where.push('(' + userIdConditions.join(' OR ') + ')');
        // Add the userId parameter for each condition
        for (let i = 0; i < userIdConditions.length; i++) {
          params.push(userId);
        }
      }
    }

    // Build the query
    let query = `SELECT ${select} FROM \`orders\``;
    if (where.length > 0) {
      query += ' WHERE ' + where.join(' AND ');
    }

    // Add ordering
    if (cols['created_at']) query += ' ORDER BY `created_at` DESC';
    else if (cols['order_date']) query += ' ORDER BY `order_date` DESC';
    else if (cols['id']) query += ' ORDER BY `id` DESC';
    else query += ' ORDER BY 1 DESC';

    // Add limit
    if (id) {
      query += ' LIMIT 1';
    } else {
      query += ' LIMIT 500';
    }

    // Execute the query
    const [orders] = await connection.query(query, params);

    // Format the response
    const formattedOrders = orders.map(row => {
      const orderId = row._id || row.id || 0;
      const customer = row._customer || `Customer #${orderId || ''}`;
      const email = row._email || row.email || null;
      const total = row._total !== undefined ? parseFloat(row._total) : 0.0;
      const status = (row._status || 'pending').toLowerCase();
      const date = row._date || new Date().toISOString().split('T')[0];
      const items = row._items ? parseInt(row._items) : 1;

      return {
        id: orderId,
        customer,
        email,
        total,
        status,
        date,
        items,
        avatar: '👤',
        // Optional details
        shippingMethod: row._shipping_method || null,
        shippingAddress: row._shipping_address || null,
        trackingNumber: row._tracking_number || null,
        paymentMethod: row._payment_method || null,
        subtotal: row._subtotal ? parseFloat(row._subtotal) : null,
        tax: row._tax ? parseFloat(row._tax) : null,
        shipping: row._shipping ? parseFloat(row._shipping) : null,
        grandTotal: row._grand_total ? parseFloat(row._grand_total) : null,
      };
    });

    res.status(200).json({
      success: true,
      message: 'Orders fetched',
      data: formattedOrders
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const getTodayTransactions = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // Check if orders table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'orders'");
    const tableExists = tables.length > 0;

    let totalAmount = 0;

    if (tableExists) {
      // Check what columns exist in orders table
      const [columns] = await connection.query("SHOW COLUMNS FROM `orders`");
      const columnNames = columns.map(col => col.Field.toLowerCase());

      // Determine column names with fallbacks
      const createdAtCol = columnNames.find(c => c === 'created_at' || c === 'order_date' || c === 'date') || 'created_at';
      const amountCol = columnNames.find(c => c === 'total_amount' || c === 'total' || c === 'amount' || c === 'grand_total') || 'total_amount';
      const statusCol = columnNames.find(c => c === 'status' || c === 'order_status') || 'status';

      // Query for today's successful orders
      const [result] = await connection.query(`
        SELECT COALESCE(SUM(\`${amountCol}\`), 0) as total_amount
        FROM \`orders\`
        WHERE DATE(\`${createdAtCol}\`) = CURDATE()
        AND \`${statusCol}\` IN ('completed', 'successful', 'delivered')
      `);

      totalAmount = result[0]?.total_amount || 0;
    }

    res.status(200).json({
      success: true,
      message: 'Today\'s transactions fetched',
      data: {
        totalAmount: parseFloat(totalAmount)
      }
    });

  } catch (error) {
    console.error('Error fetching today\'s transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today\'s transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const deleteOrder = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const orderId = req.params.id; // Can be int ID or string order_id

    // Check if order exists and get ownership details
    const [orders] = await connection.query(
      'SELECT id, customer_id FROM orders WHERE id = ?',
      [orderId]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const order = orders[0];

    // Check ownership (Admin or Owner)
    // req.user is set by verifyToken middleware
    if (req.user.role !== 'admin' && order.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this order'
      });
    }

    // Delete the order
    const [result] = await connection.query(
      'DELETE FROM orders WHERE id = ?',
      [order.id]
    );

    res.status(200).json({
      success: true,
      message: 'Order deleted successfully',
      data: {
        affected: result.affectedRows,
        id: order.id
      }
    });

  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const verifyOrder = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const orderId = parseInt(req.params.id);

    // Validate order ID
    if (isNaN(orderId) || orderId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    // Check if orders table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'orders'");
    if (tables.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Orders table does not exist'
      });
    }

    // Check what columns exist
    const [columns] = await connection.query("SHOW COLUMNS FROM `orders`");
    const columnNames = columns.map(col => col.Field.toLowerCase());
    const statusCol = columnNames.find(c => c === 'status' || c === 'order_status') || 'status';
    const idCol = columnNames.find(c => c === 'id') || 'id';

    // Update order status to 'processing' (shorter than 'verified' to avoid truncation)
    const [result] = await connection.query(
      `UPDATE \`orders\` SET \`${statusCol}\` = 'processing' WHERE \`${idCol}\` = ?`,
      [orderId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order verified successfully',
      data: {
        orderId,
        status: 'processing'
      }
    });

  } catch (error) {
    console.error('Error verifying order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const cancelOrder = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const orderId = parseInt(req.params.id);

    // Validate order ID
    if (isNaN(orderId) || orderId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    // Check if orders table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'orders'");
    if (tables.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Orders table does not exist'
      });
    }

    // Check what columns exist
    const [columns] = await connection.query("SHOW COLUMNS FROM `orders`");
    const columnNames = columns.map(col => col.Field.toLowerCase());
    const statusCol = columnNames.find(c => c === 'status' || c === 'order_status') || 'status';
    const idCol = columnNames.find(c => c === 'id') || 'id';

    // Update order status to 'canceled'
    const [result] = await connection.query(
      `UPDATE \`orders\` SET \`${statusCol}\` = 'canceled' WHERE \`${idCol}\` = ?`,
      [orderId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order canceled successfully',
      data: {
        orderId,
        status: 'canceled'
      }
    });

  } catch (error) {
    console.error('Error canceling order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const markDelivered = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const orderId = parseInt(req.params.id);

    // Validate order ID
    if (isNaN(orderId) || orderId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    // Check if orders table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'orders'");
    if (tables.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Orders table does not exist'
      });
    }

    // Check what columns exist
    const [columns] = await connection.query("SHOW COLUMNS FROM `orders`");
    const columnNames = columns.map(col => col.Field.toLowerCase());
    const statusCol = columnNames.find(c => c === 'status' || c === 'order_status') || 'status';
    const idCol = columnNames.find(c => c === 'id') || 'id';

    // Update order status to 'delivered'
    const [result] = await connection.query(
      `UPDATE \`orders\` SET \`${statusCol}\` = 'delivered' WHERE \`${idCol}\` = ?`,
      [orderId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order marked as delivered successfully',
      data: {
        orderId,
        status: 'delivered'
      }
    });

  } catch (error) {
    console.error('Error marking order as delivered:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark order as delivered',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};