import { db } from '../db.js';

// Default payment methods that will be used if none are found in the database
const defaultPaymentMethods = [
  {
    id: 'card',
    code: 'card',
    name: 'Credit/Debit Card',
    enabled: true,
    icon: '💳',
    description: 'Pay securely with major credit and debit cards.'
  },
  {
    id: 'flutterwave',
    code: 'flutterwave',
    name: 'Flutterwave',
    enabled: true,
    icon: '🌊',
    description: 'Regional payments powered by Flutterwave.'
  },
  {
    id: 'monnify',
    code: 'monnify',
    name: 'Monnify',
    enabled: false,
    icon: '💰',
    description: 'Accept payments using Monnify accounts and transfers.'
  },
  {
    id: 'bank_transfer',
    code: 'bank_transfer',
    name: 'Bank Transfer',
    enabled: true,
    icon: '🏦',
    description: 'Direct bank transfer or deposit.'
  },
  {
    id: 'paypal',
    code: 'paypal',
    name: 'PayPal',
    enabled: false,
    icon: '🅿️',
    description: 'Pay easily with your PayPal account.'
  },
  {
    id: 'stripe',
    code: 'stripe',
    name: 'Stripe',
    enabled: true,
    icon: '💎',
    description: 'Secure global payments powered by Stripe.'
  },
  {
    id: 'razorpay',
    code: 'razorpay',
    name: 'Razorpay',
    enabled: false,
    icon: '🔒',
    description: 'Popular payment option for India.'
  },
  {
    id: 'paystack',
    code: 'paystack',
    name: 'Paystack',
    enabled: true,
    icon: '⚡',
    description: 'Fast local payments with Paystack.'
  }
];

const ensurePaymentMethodSchema = async (connection) => {
  try {
    const [tables] = await connection.query("SHOW TABLES LIKE 'payment_methods'");
    if (tables.length === 0) return;

    const [columns] = await connection.query("SHOW COLUMNS FROM payment_methods");
    const columnNames = columns.map(col => col.Field);

    const requiredColumns = [
      { name: 'bank_name', ddl: "ALTER TABLE payment_methods ADD COLUMN bank_name VARCHAR(255) NULL DEFAULT NULL AFTER sort_order" },
      { name: 'account_name', ddl: "ALTER TABLE payment_methods ADD COLUMN account_name VARCHAR(255) NULL DEFAULT NULL AFTER bank_name" },
      { name: 'account_number', ddl: "ALTER TABLE payment_methods ADD COLUMN account_number VARCHAR(100) NULL DEFAULT NULL AFTER account_name" },
      { name: 'additional_notes', ddl: "ALTER TABLE payment_methods ADD COLUMN additional_notes TEXT NULL AFTER account_number" },
      { name: 'config', ddl: "ALTER TABLE payment_methods ADD COLUMN config LONGTEXT NULL AFTER additional_notes" },
    ];

    for (const column of requiredColumns) {
      if (!columnNames.includes(column.name)) {
        await connection.query(column.ddl);
      }
    }

    // Ensure payment_confirmations table has order_type
    const [confTables] = await connection.query("SHOW TABLES LIKE 'payment_confirmations'");
    if (confTables.length > 0) {
      const [confColumns] = await connection.query("SHOW COLUMNS FROM payment_confirmations");
      const confColumnNames = confColumns.map(col => col.Field);

      if (!confColumnNames.includes('order_type')) {
        await connection.query("ALTER TABLE payment_confirmations ADD COLUMN order_type ENUM('delivery', 'pickup') NOT NULL DEFAULT 'delivery' AFTER order_id");
      }
    }
  } catch (error) {
    console.error('Failed to ensure payment_methods schema:', error);
  }
};

const getOrderDetailsMap = async (connection, transactions = []) => {
  try {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return new Map();
    }

    const uniqueOrderIds = Array.from(
      new Set(
        transactions
          .map(row => row.order_id)
          .filter(value => value !== null && value !== undefined)
          .map(value => value.toString())
          .filter(value => /^\d+$/.test(value))
      )
    );

    if (uniqueOrderIds.length === 0) {
      return new Map();
    }

    const [orderColumns] = await connection.query("SHOW COLUMNS FROM `orders`");
    const columnMap = orderColumns.reduce((acc, col) => {
      acc[col.Field.toLowerCase()] = col.Field;
      return acc;
    }, {});

    const selectFields = ['`id`'];
    if (columnMap.customer_name) {
      selectFields.push(`\`${columnMap.customer_name}\` AS customer_name`);
    } else if (columnMap.customer) {
      selectFields.push(`\`${columnMap.customer}\` AS customer_name`);
    }
    if (columnMap.customer_email) {
      selectFields.push(`\`${columnMap.customer_email}\` AS customer_email`);
    }
    if (columnMap.customer_phone) {
      selectFields.push(`\`${columnMap.customer_phone}\` AS customer_phone`);
    }

    if (selectFields.length === 1) {
      return new Map();
    }

    const placeholders = uniqueOrderIds.map(() => '?').join(', ');
    const orderIdParams = uniqueOrderIds.map(id => Number(id));
    const [orderRows] = await connection.query(
      `SELECT ${selectFields.join(', ')} FROM \`orders\` WHERE \`id\` IN (${placeholders})`,
      orderIdParams
    );

    const map = new Map();
    orderRows.forEach(order => {
      map.set(order.id.toString(), {
        name: order.customer_name || null,
        email: order.customer_email || null,
        phone: order.customer_phone || null,
      });
    });

    return map;
  } catch (error) {
    console.error('Failed to fetch related order details for transactions:', error);
    return new Map();
  }
};

const resolvePaymentMethodWhereClause = (identifier = '') => {
  const normalized = (identifier ?? '').toString().trim();
  if (!normalized) {
    return { clause: null, value: null, isNumeric: false };
  }
  const isNumeric = /^\d+$/.test(normalized);
  return {
    clause: isNumeric ? 'id = ?' : 'code = ?',
    value: isNumeric ? Number(normalized) : normalized,
    isNumeric,
  };
};

export const updatePaymentMethod = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await ensurePaymentMethodSchema(connection);
    const { id: identifier } = req.params;
    const {
      name,
      enabled,
      icon,
      description,
      sort_order: sortOrder,
      bank_name: bankName,
      account_name: accountName,
      account_number: accountNumber,
      additional_notes: additionalNotes,
      config
    } = req.body;

    const lookup = resolvePaymentMethodWhereClause(identifier);

    if (!lookup.clause) {
      return res.status(400).json({
        success: false,
        message: 'Payment method identifier is required.'
      });
    }

    // Get the payment method first to check if it exists
    const [paymentMethods] = await connection.query(
      `SELECT * FROM payment_methods WHERE ${lookup.clause} LIMIT 1`,
      [lookup.value]
    );

    if (paymentMethods.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found.'
      });
    }

    const currentMethod = paymentMethods[0];
    const primaryId = currentMethod.id;

    // Prepare updates
    const updates = [];
    const params = [];

    // Check which fields to update
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(enabled ? 1 : 0);
    }

    if (icon !== undefined) {
      updates.push('icon = ?');
      params.push(icon);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (sortOrder !== undefined) {
      updates.push('sort_order = ?');
      params.push(sortOrder);
    }

    // Bank transfer specific fields
    if (bankName !== undefined) {
      updates.push('bank_name = ?');
      params.push(bankName);
    }

    if (accountName !== undefined) {
      updates.push('account_name = ?');
      params.push(accountName);
    }

    if (accountNumber !== undefined) {
      updates.push('account_number = ?');
      params.push(accountNumber);
    }

    if (additionalNotes !== undefined) {
      updates.push('additional_notes = ?');
      params.push(additionalNotes);
    }

    // Handle config (as JSON)
    if (config !== undefined) {
      try {
        const configValue = typeof config === 'string' ? config : JSON.stringify(config);
        updates.push('config = ?');
        params.push(configValue);
      } catch (error) {
        console.error('Error processing config:', error);
        return res.status(400).json({
          success: false,
          message: 'Invalid config format. Must be a valid JSON object or string.'
        });
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update.'
      });
    }

    // Add ID to params for the WHERE clause
    params.push(primaryId);

    // Execute the update
    const [result] = await connection.query(
      `UPDATE payment_methods SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      throw new Error('No payment method was updated');
    }

    // Get the updated payment method
    const [updatedMethods] = await connection.query(
      'SELECT * FROM payment_methods WHERE id = ?',
      [primaryId]
    );

    const updatedMethod = updatedMethods[0];

    // Format the response
    const responseData = {
      id: updatedMethod.id,
      code: updatedMethod.code,
      name: updatedMethod.name,
      enabled: Boolean(updatedMethod.enabled),
      icon: updatedMethod.icon || '💳',
      description: updatedMethod.description || ''
    };

    // Add bank transfer details if they exist
    if (updatedMethod.bank_name || updatedMethod.account_name || updatedMethod.account_number) {
      responseData.bank_name = updatedMethod.bank_name || '';
      responseData.account_name = updatedMethod.account_name || '';
      responseData.account_number = updatedMethod.account_number || '';
      responseData.additional_notes = updatedMethod.additional_notes || '';
    }

    // Add config if it exists
    if (updatedMethod.config) {
      try {
        responseData.config = typeof updatedMethod.config === 'string' ?
          JSON.parse(updatedMethod.config) : updatedMethod.config;
      } catch (e) {
        responseData.config = updatedMethod.config;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Payment method updated successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Error updating payment method:', error);

    // Handle duplicate entry error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'A payment method with this code already exists.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update payment method',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const getPaymentMethods = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // First, check if payment_methods table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'payment_methods'");
    const tableExists = tables.length > 0;

    let methods = [];
    let source = 'default';

    if (tableExists) {
      // Get all columns from the payment_methods table
      const [columns] = await connection.query("SHOW COLUMNS FROM payment_methods");
      const columnNames = columns.map(col => col.Field);

      // Build the SELECT query based on available columns
      const selectFields = [
        columnNames.includes('id') ? 'id' : 'NULL as id',
        columnNames.includes('code') ? 'code' : 'NULL as code',
        columnNames.includes('name') ? 'name' : 'NULL as name',
        columnNames.includes('enabled') ? 'enabled' :
          (columnNames.includes('is_enabled') ? 'is_enabled as enabled' : '1 as enabled'),
        columnNames.includes('icon') ? 'icon' : 'NULL as icon',
        columnNames.includes('description') ? 'description' : 'NULL as description',
        columnNames.includes('sort_order') ? 'sort_order' : '0 as sort_order',
        columnNames.includes('config') ? 'config' : 'NULL as config',
        columnNames.includes('bank_name') ? 'bank_name' : 'NULL as bank_name',
        columnNames.includes('account_name') ? 'account_name' : 'NULL as account_name',
        columnNames.includes('account_number') ? 'account_number' : 'NULL as account_number',
        columnNames.includes('additional_notes') ? 'additional_notes' : 'NULL as additional_notes'
      ];

      // Build the ORDER BY clause
      const orderBy = columnNames.includes('sort_order') ? 'ORDER BY sort_order ASC' : '';

      // Execute the query
      const [dbMethods] = await connection.query(
        `SELECT ${selectFields.join(', ')} FROM payment_methods WHERE enabled = 1 ${orderBy}`
      );

      if (dbMethods && dbMethods.length > 0) {
        methods = dbMethods.map(method => {
          const dbId = method.id ?? null;
          const isBankTransfer = method.code === 'bank_transfer' ||
            (method.name && method.name.toLowerCase().includes('bank transfer'));

          const methodData = {
            id: dbId ?? method.code ?? '',
            databaseId: dbId,
            code: method.code || (dbId ? dbId.toString() : ''),
            name: method.name || 'Payment Method',
            enabled: Boolean(method.enabled),
            icon: method.icon || '💳',
            description: method.description || ''
          };

          // Add config if it exists
          if (method.config) {
            try {
              const config = typeof method.config === 'string' ?
                JSON.parse(method.config) : method.config;
              methodData.config = config;
            } catch (e) {
              console.error('Error parsing config:', e);
            }
          }

          // Add bank transfer details if this is a bank transfer method
          if (isBankTransfer) {
            methodData.bank_name = method.bank_name || '';
            methodData.account_name = method.account_name || '';
            methodData.account_number = method.account_number || '';
            methodData.additional_notes = method.additional_notes || '';
          }

          return methodData;
        });

        source = 'database';
      }
    }

    // If no methods found in database, use defaults
    if (methods.length === 0) {
      methods = defaultPaymentMethods;
    }

    res.status(200).json({
      success: true,
      message: 'Payment methods fetched successfully',
      data: {
        paymentMethods: methods,
        source,
        count: methods.length
      }
    });

  } catch (error) {
    console.error('Error fetching payment methods:', error);

    // In case of error, return default methods
    res.status(200).json({
      success: true,
      message: 'Using default payment methods',
      data: {
        paymentMethods: defaultPaymentMethods,
        source: 'default',
        count: defaultPaymentMethods.length
      }
    });
  } finally {
    if (connection) connection.release();
  }
};

export const deletePaymentMethod = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Payment method ID is required.'
      });
    }

    const paymentMethodId = parseInt(id);

    // Check if payment method exists
    const [paymentMethods] = await connection.query(
      'SELECT id FROM payment_methods WHERE id = ?',
      [paymentMethodId]
    );

    if (paymentMethods.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found.'
      });
    }

    // Delete the payment method
    const [result] = await connection.query(
      'DELETE FROM payment_methods WHERE id = ?',
      [paymentMethodId]
    );

    if (result.affectedRows === 0) {
      throw new Error('No payment method was deleted');
    }

    res.status(200).json({
      success: true,
      message: 'Payment method deleted successfully',
      data: { id: paymentMethodId }
    });

  } catch (error) {
    console.error('Error deleting payment method:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to delete payment method',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const createPaymentMethod = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      code = '',
      name = '',
      enabled = 1,
      icon = '💳',
      description = '',
      sort_order: sortOrder = 0,
      bank_name: bankName = null,
      account_name: accountName = null,
      account_number: accountNumber = null,
      additional_notes: additionalNotes = null,
      config = null
    } = req.body;

    // Validate required fields
    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: 'Code and name are required.'
      });
    }

    // Check if payment_methods table exists, create if not
    const [tables] = await connection.query("SHOW TABLES LIKE 'payment_methods'");
    const tableExists = tables.length > 0;

    if (!tableExists) {
      const createTable = `
        CREATE TABLE IF NOT EXISTS payment_methods (
          id INT AUTO_INCREMENT PRIMARY KEY,
          code VARCHAR(50) NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          enabled TINYINT(1) DEFAULT 1,
          icon VARCHAR(50) DEFAULT '💳',
          description TEXT,
          sort_order INT DEFAULT 0,
          bank_name VARCHAR(255),
          account_name VARCHAR(255),
          account_number VARCHAR(100),
          additional_notes TEXT,
          config LONGTEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_enabled (enabled),
          INDEX idx_code (code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

      await connection.query(createTable);
    }

    await ensurePaymentMethodSchema(connection);

    let configValue = null;
    if (config !== undefined && config !== null) {
      configValue = typeof config === 'string' ? config : JSON.stringify(config);
    }

    // Insert or update payment method
    const [result] = await connection.query(
      `INSERT INTO payment_methods 
       (code, name, enabled, icon, description, sort_order, bank_name, account_name, account_number, additional_notes, config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         enabled = VALUES(enabled),
         icon = VALUES(icon),
         description = VALUES(description),
         sort_order = VALUES(sort_order),
         bank_name = VALUES(bank_name),
         account_name = VALUES(account_name),
         account_number = VALUES(account_number),
         additional_notes = VALUES(additional_notes),
         config = VALUES(config)`,
      [
        code,
        name,
        enabled ? 1 : 0,
        icon,
        description || null,
        sortOrder,
        bankName || null,
        accountName || null,
        accountNumber || null,
        additionalNotes || null,
        configValue
      ]
    );

    const lookupIdentifier = result.insertId || code;
    const lookupClause = result.insertId ? 'id = ?' : 'code = ?';

    // Get the inserted/updated payment method
    const [paymentMethods] = await connection.query(
      `SELECT * FROM payment_methods WHERE ${lookupClause} LIMIT 1`,
      [lookupIdentifier]
    );

    const paymentMethod = paymentMethods[0];

    res.status(200).json({
      success: true,
      message: 'Payment method created successfully',
      data: {
        id: paymentMethod.id,
        code: paymentMethod.code,
        name: paymentMethod.name,
        enabled: Boolean(paymentMethod.enabled),
        icon: paymentMethod.icon,
        description: paymentMethod.description,
        sort_order: paymentMethod.sort_order,
        bank_name: paymentMethod.bank_name,
        account_name: paymentMethod.account_name,
        account_number: paymentMethod.account_number,
        additional_notes: paymentMethod.additional_notes,
        config: (() => {
          if (!paymentMethod.config) return null;
          if (typeof paymentMethod.config !== 'string') return paymentMethod.config;
          try {
            return JSON.parse(paymentMethod.config);
          } catch {
            return paymentMethod.config;
          }
        })()
      }
    });

  } catch (error) {
    console.error('Error creating payment method:', error);

    // Handle duplicate entry error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'A payment method with this code already exists.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create payment method',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const confirmPayment = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      order_id: orderId = '',
      payment_method: paymentMethod = '',
      amount = 0,
      customer_name: customerName = '',
      customer_email: customerEmail = '',
      customer_phone: customerPhone = '',
      transaction_reference: transactionReference = '',
      notes = '',
      order_type = 'delivery',
      cart_items = [],
      pickup_date = null,
      pickup_branch = null
    } = req.body;



    // Validate required fields
    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Payment method is required.'
      });
    }

    // Check if payment_confirmations table exists, create if not
    const [tables] = await connection.query("SHOW TABLES LIKE 'payment_confirmations'");
    const tableExists = tables.length > 0;

    if (!tableExists) {
      const createTable = `
        CREATE TABLE IF NOT EXISTS payment_confirmations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id VARCHAR(100),
          payment_method VARCHAR(50) NOT NULL,
          amount DECIMAL(10,2) DEFAULT 0.00,
          customer_name VARCHAR(255),
          customer_email VARCHAR(255),
          customer_phone VARCHAR(50),
          transaction_reference VARCHAR(255),
          notes TEXT,
          status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_status (status),
          INDEX idx_payment_method (payment_method),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

      await connection.query(createTable);
    } else {
      // If table exists, ensure order_type column exists
      const [columns] = await connection.query("SHOW COLUMNS FROM payment_confirmations");
      const columnNames = columns.map(col => col.Field);

      if (!columnNames.includes('order_type')) {
        await connection.query("ALTER TABLE payment_confirmations ADD COLUMN order_type ENUM('delivery', 'pickup') NOT NULL DEFAULT 'delivery' AFTER order_id");
      }
    }

    // Insert payment confirmation
    const [result] = await connection.query(
      `INSERT INTO payment_confirmations 
       (order_id, payment_method, amount, customer_name, customer_email, customer_phone, transaction_reference, notes, order_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId || null,
        paymentMethod,
        parseFloat(amount) || 0,
        customerName || null,
        customerEmail || null,
        customerPhone || null,
        transactionReference || `TRANS-${Date.now()}`,
        notes || null,
        order_type || 'delivery'
      ]
    );



    // Send appropriate confirmation email
    try {
      const { sendPaymentConfirmationEmail, sendPickupPaymentConfirmationEmail } = await import('../services/gmailService.js');

      const items = cart_items || [];

      if (order_type === 'pickup') {
        await sendPickupPaymentConfirmationEmail({
          to: customerEmail,
          customerName: customerName,
          orderId: orderId,
          amount: parseFloat(amount),
          items,
          paymentMethod: paymentMethod,
          pickupDate: pickup_date,
          pickupBranch: pickup_branch
        });

      } else {
        await sendPaymentConfirmationEmail({
          to: customerEmail,
          customerName: customerName,
          orderId: orderId,
          amount: parseFloat(amount),
          items,
          paymentMethod: paymentMethod
        });

      }
    } catch (emailError) {
      console.error('[Payment Confirmation] Email sending failed:', emailError.message);
      // Don't fail the request if email fails
    }

    res.status(200).json({
      success: true,
      message: 'Payment confirmation submitted successfully. We will verify your payment shortly.',
      data: {
        id: result.insertId,
        order_id: orderId,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment confirmation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

const formatTransactionRow = (row = {}) => ({
  id: row.id,
  order_id: row.order_id,
  payment_method: row.payment_method,
  amount: row.amount !== undefined && row.amount !== null ? Number(row.amount) : 0,
  customer_name: row.customer_name,
  customer_email: row.customer_email,
  customer_phone: row.customer_phone,
  transaction_reference: row.transaction_reference,
  notes: row.notes,
  status: row.status || 'pending',
  order_type: row.order_type || 'delivery',
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const getPaymentTransactions = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const [tables] = await connection.query("SHOW TABLES LIKE 'payment_confirmations'");
    if (tables.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No transactions found',
        data: [],
      });
    }

    const [rows] = await connection.query(
      `SELECT id, order_id, payment_method, amount, customer_name, customer_email, customer_phone, transaction_reference, notes, status, order_type, created_at, updated_at
       FROM payment_confirmations
       ORDER BY created_at DESC`
    );

    const orderDetails = await getOrderDetailsMap(connection, rows);

    const formattedRows = rows.map(row => {
      const formatted = formatTransactionRow(row);
      if (row.order_id && orderDetails.size > 0) {
        const lookup = orderDetails.get(row.order_id.toString());
        if (lookup) {
          formatted.customer_name = formatted.customer_name || lookup.name || null;
          formatted.customer_email = formatted.customer_email || lookup.email || null;
          formatted.customer_phone = formatted.customer_phone || lookup.phone || null;
        }
      }
      if (!formatted.customer_name) {
        formatted.customer_name = formatted.customer_email || formatted.customer_phone || null;
      }
      return formatted;
    });

    res.status(200).json({
      success: true,
      message: 'Transactions fetched successfully',
      data: formattedRows.map(row => ({
        ...row,
        customer_name: row.customer_name || '—',
        customer_email: row.customer_email || null,
        customer_phone: row.customer_phone || null,
      })),
    });
  } catch (error) {
    console.error('Error fetching payment transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment transactions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    if (connection) connection.release();
  }
};

const mapTransactionStatusToOrderStatus = (status) => {
  switch (status) {
    case 'verified':
      return 'successful';
    case 'rejected':
      return 'failed';
    default:
      return null;
  }
};

export const updatePaymentTransactionStatus = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;
    const { status: rawStatus, action, notes } = req.body || {};

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required',
      });
    }

    let nextStatus = (rawStatus || '').toString().toLowerCase();
    if (!nextStatus && action) {
      if (action === 'approve') nextStatus = 'verified';
      if (action === 'decline') nextStatus = 'rejected';
    }

    const allowedStatuses = ['pending', 'verified', 'rejected'];
    if (!allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status supplied',
      });
    }

    const [tables] = await connection.query("SHOW TABLES LIKE 'payment_confirmations'");
    if (tables.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transactions table not found',
      });
    }

    const [existingRows] = await connection.query(
      'SELECT * FROM payment_confirmations WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    const updateParts = ['status = ?'];
    const params = [nextStatus];
    if (notes !== undefined) {
      updateParts.push('notes = ?');
      params.push(notes || null);
    }
    params.push(id);

    await connection.query(
      `UPDATE payment_confirmations SET ${updateParts.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      params
    );

    const [updatedRows] = await connection.query(
      'SELECT * FROM payment_confirmations WHERE id = ? LIMIT 1',
      [id]
    );

    const updatedTransaction = formatTransactionRow(updatedRows[0]);

    const targetOrderStatus = mapTransactionStatusToOrderStatus(nextStatus);
    if (targetOrderStatus && updatedTransaction.order_id) {
      const isPickup = updatedTransaction.order_type === 'pickup';
      const tableName = isPickup ? 'pickup_orders' : 'orders';

      const [tables] = await connection.query(`SHOW TABLES LIKE '${tableName}'`);
      if (tables.length > 0) {
        // Determine the correct status for the order table
        // For delivery: 'successful' or 'processing'
        // For pickup: 'pending' (ready for pickup) or 'picked_up' if verified? 
        // Usually verified payment -> processing/pending. 
        // If rejected -> failed/canceled.

        let statusToSet = targetOrderStatus;
        if (isPickup && targetOrderStatus === 'successful') {
          statusToSet = 'pending'; // Ready for pickup
        } else if (!isPickup && targetOrderStatus === 'successful') {
          statusToSet = 'processing'; // Ready for shipping
        } else if (targetOrderStatus === 'failed') {
          statusToSet = 'canceled';
        }

        const [orderIdColumn] = await connection.query(
          `SHOW COLUMNS FROM \`${tableName}\` LIKE 'order_id'`
        );

        // Try updating by ID first if it looks numeric
        const numericOrderId = /^\d+$/.test(updatedTransaction.order_id)
          ? Number(updatedTransaction.order_id)
          : null;

        let orderUpdated = false;
        if (numericOrderId !== null) {
          // For pickup_orders, primary key might be id or order_id might be the string
          // Let's check if we can update by id
          const [result] = await connection.query(
            `UPDATE \`${tableName}\` SET \`status\` = ? WHERE \`id\` = ? LIMIT 1`,
            [statusToSet, numericOrderId]
          );
          orderUpdated = result.affectedRows > 0;
        }

        // If not updated by ID, try by order_id column if it exists
        if (!orderUpdated && orderIdColumn.length > 0) {
          await connection.query(
            `UPDATE \`${tableName}\` SET \`status\` = ? WHERE \`order_id\` = ? LIMIT 1`,
            [statusToSet, updatedTransaction.order_id]
          );
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Transaction updated successfully',
      data: updatedTransaction,
    });
  } catch (error) {
    console.error('Error updating payment transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transaction status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    if (connection) connection.release();
  }
};
