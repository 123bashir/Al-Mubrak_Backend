import { db } from '../db.js';

export const getTop10Buyers = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // Check if required tables exist
    const [tables] = await connection.query("SHOW TABLES");
    const tableNames = tables.map(t => Object.values(t)[0].toLowerCase());

    if (!tableNames.includes('customers') || !tableNames.includes('orders')) {
      connection.release();
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    // Check if order_items table exists
    const hasOrderItems = tableNames.includes('order_items');

    // Get column names for orders table
    const [orderColumns] = await connection.query("SHOW COLUMNS FROM `orders`");
    const orderColumnNames = orderColumns.map(col => col.Field.toLowerCase());
    const customerIdCol = orderColumnNames.find(c => c === 'customer_id' || c === 'user_id') || 'customer_id';

    let customers;

    if (hasOrderItems) {
      // Query with order_items join
      try {
        const [result] = await connection.query(`
          SELECT 
            c.id,
            c.name,
            c.email,
            c.phone,
            c.location,
            COUNT(DISTINCT o.id) as total_orders,
            COALESCE(SUM(oi.quantity), 0) as total_items_purchased
          FROM customers c
          INNER JOIN \`orders\` o ON c.id = o.\`${customerIdCol}\`
          LEFT JOIN order_items oi ON o.id = oi.order_id
          GROUP BY c.id
          ORDER BY total_items_purchased DESC
          LIMIT 10
        `);
        customers = result;
      } catch (error) {
        // If order_items join fails, try without it
        console.warn('Order items join failed, trying alternative query:', error.message);
        const [result] = await connection.query(`
          SELECT 
            c.id,
            c.name,
            c.email,
            c.phone,
            c.location,
            COUNT(o.id) as total_orders,
            COUNT(o.id) as total_items_purchased
          FROM customers c
          INNER JOIN \`orders\` o ON c.id = o.\`${customerIdCol}\`
          GROUP BY c.id
          ORDER BY total_orders DESC
          LIMIT 10
        `);
        customers = result;
      }
    } else {
      // Query without order_items table
      const [result] = await connection.query(`
        SELECT 
          c.id,
          c.name,
          c.email,
          c.phone,
          c.location,
          COUNT(o.id) as total_orders,
          COUNT(o.id) as total_items_purchased
        FROM customers c
        INNER JOIN \`orders\` o ON c.id = o.\`${customerIdCol}\`
        GROUP BY c.id
        ORDER BY total_orders DESC
        LIMIT 10
      `);
      customers = result;
    }

    res.status(200).json({
      success: true,
      data: customers || []
    });
  } catch (error) {
    console.error('Error fetching top 10 buyers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching top 10 buyers',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

export const getCustomers = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // Get query parameters with defaults
    const {
      search = '',
      status = '',
      sort = 'name',
      order = 'asc',
      limit = 50,
      offset = 0
    } = req.query;

    // Validate and sanitize inputs
    const limitValue = Math.min(parseInt(limit) || 50, 100); // Max 100 items per page
    const offsetValue = Math.max(0, parseInt(offset) || 0);
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // Define valid sort columns
    const nameExpression = "COALESCE(name, CONCAT_WS(' ', first_name, last_name))";
    const sortMap = {
      'name': nameExpression,
      'orders': 'orders_count',
      'spent': 'total_spent',
      'date': 'join_date'
    };

    const sortColumn = sortMap[sort] || nameExpression;

    // Build WHERE clause
    const whereClauses = [];
    const params = [];

    if (search) {
      const searchTerm = `%${search}%`;
      whereClauses.push(`(${nameExpression} LIKE ? OR email LIKE ? OR location LIKE ? OR first_name LIKE ? OR last_name LIKE ?)`);
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status && ['active', 'inactive'].includes(status.toLowerCase())) {
      whereClauses.push('status = ?');
      params.push(status.toLowerCase());
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // First, try to get customers from customers table
    const query = `
      SELECT 
        id,
        ${nameExpression} as name,
        email,
        phone,
        COALESCE(status, 'active') as status,
        COALESCE(orders_count, 0) as orders_count,
        COALESCE(total_spent, 0) as total_spent,
        join_date,
        avatar,
        location,
        last_order
      FROM customers
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    // Add pagination parameters
    const queryParams = [...params, limitValue, offsetValue];

    // Execute the query
    const [customers] = await connection.query(query, queryParams);

    // Return customers from the customers table
    res.status(200).json({
      success: true,
      message: 'Customers retrieved successfully',
      data: customers.map(customer => ({
        id: customer.id,
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone,
        status: customer.status || 'active',
        orders: customer.orders_count || 0,
        totalSpent: parseFloat(customer.total_spent) || 0,
        joinDate: customer.join_date ? new Date(customer.join_date).toISOString().split('T')[0] : null,
        avatar: customer.avatar || '👤',
        location: customer.location,
        lastOrder: customer.last_order
      }))
    });

  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
      error: error.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

export const getCustomer = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const customerId = parseInt(req.params.id);

    if (isNaN(customerId) || customerId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID'
      });
    }

    const [[customer]] = await connection.query(
      `SELECT 
        id, 
        COALESCE(name, CONCAT_WS(' ', first_name, last_name)) as name,
        email, 
        phone, 
        status, 
        orders_count as ordersCount,
        total_spent as totalSpent,
        join_date as joinDate,
        avatar,
        location,
        last_order as lastOrder
      FROM customers 
      WHERE id = ?`,
      [customerId]
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Format the response
    const formattedCustomer = {
      id: customer.id,
      name: customer.name || '',
      email: customer.email,
      phone: customer.phone || '',
      status: customer.status,
      orders: customer.ordersCount || 0,
      totalSpent: parseFloat(customer.totalSpent) || 0,
      joinDate: customer.joinDate,
      avatar: customer.avatar || '👤',
      location: customer.location || '',
      lastOrder: customer.lastOrder
    };

    return res.status(200).json({
      success: true,
      message: 'Customer retrieved successfully',
      data: formattedCustomer
    });

  } catch (error) {
    console.error('Error fetching customer:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch customer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

export const updateCustomer = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const customerId = parseInt(req.params.id);

    // Check if user is updating their own profile or is admin
    // req.user is set by verifyToken middleware
    if (req.user.role !== 'admin' && req.user.id !== customerId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this profile'
      });
    }

    if (isNaN(customerId) || customerId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID'
      });
    }

    const updateData = req.body;
    const file = req.file; // From multer middleware
    if ((!updateData || Object.keys(updateData).length === 0) && !file) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Validate email if provided
    if (updateData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updateData.email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Build the update query
    const fieldsToUpdate = [];
    const params = [];

    // Handle avatar upload (either file or URL string)
    if (file) {
      // Store relative path from local upload
      const avatarPath = `/uploads/avatars/${file.filename}`;
      fieldsToUpdate.push('avatar = ?');
      params.push(avatarPath);
    } else if (updateData.profile_image) {
      // Handle direct URL update (e.g. from Telhost)
      fieldsToUpdate.push('avatar = ?');
      params.push(updateData.profile_image);
    }

    // Handle other fields
    // Map frontend fields to DB columns
    // Frontend sends: name, email, phone, address, city, country
    // DB has: name, email, phone, location, avatar

    if (updateData.name) {
      fieldsToUpdate.push('name = ?');
      params.push(updateData.name);

      // Also try to split into first/last name if possible
      const parts = updateData.name.split(' ');
      if (parts.length > 0) {
        fieldsToUpdate.push('first_name = ?');
        params.push(parts[0]);
        if (parts.length > 1) {
          fieldsToUpdate.push('last_name = ?');
          params.push(parts.slice(1).join(' '));
        }
      }
    }

    if (updateData.email) {
      fieldsToUpdate.push('email = ?');
      params.push(updateData.email);
    }

    if (updateData.phone) {
      fieldsToUpdate.push('phone = ?');
      params.push(updateData.phone);
    }

    // Combine address, city, country into location
    if (updateData.address || updateData.city || updateData.country) {
      // We need to fetch current location to merge if partial update, 
      // but for now let's assume the frontend sends what it has.
      // Or better, just construct a location string from what is provided.
      const locationParts = [];
      if (updateData.address) locationParts.push(updateData.address);
      if (updateData.city) locationParts.push(updateData.city);
      if (updateData.country) locationParts.push(updateData.country);

      if (locationParts.length > 0) {
        fieldsToUpdate.push('location = ?');
        params.push(locationParts.join(', '));
      }
    }

    // Admin only fields
    if (req.user.role === 'admin') {
      if (updateData.status && ['active', 'inactive'].includes(updateData.status)) {
        fieldsToUpdate.push('status = ?');
        params.push(updateData.status);
      }
    }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    // Add updated_at timestamp
    fieldsToUpdate.push('updated_at = CURRENT_TIMESTAMP');

    // Add customer ID to params for WHERE clause
    params.push(customerId);

    const query = `
      UPDATE customers 
      SET ${fieldsToUpdate.join(', ')}
      WHERE id = ?
    `;

    const [result] = await connection.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const responseData = { id: customerId };
    if (file) {
      responseData.avatar = `/uploads/avatars/${file.filename}`;
    } else if (updateData.profile_image) {
      responseData.avatar = updateData.profile_image;
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

export const deleteCustomer = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const customerId = parseInt(req.params.id);

    if (isNaN(customerId) || customerId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID'
      });
    }

    const [result] = await connection.query(
      'DELETE FROM customers WHERE id = ?',
      [customerId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Customer deleted successfully',
      data: {
        id: customerId
      }
    });

  } catch (error) {
    console.error('Error deleting customer:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to delete customer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};