import { db } from '../db.js';

const normalizeServicesInput = (services) => {
  if (Array.isArray(services)) {
    return services.map((item) => item?.toString().trim()).filter(Boolean);
  }
  if (typeof services === 'string') {
    return services
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const serializeServices = (services) => {
  const normalized = normalizeServicesInput(services);
  if (!normalized.length) return null;
  try {
    return JSON.stringify(normalized);
  } catch {
    return null;
  }
};

const parseServices = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => item?.toString?.() ?? '').filter(Boolean);
    }
  } catch {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
};

const ensureShippingTable = async (connection) => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS shipping_companies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      contact VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      website VARCHAR(255),
      status ENUM('active','inactive') DEFAULT 'active',
      avatar VARCHAR(10),
      services TEXT,
      coverage VARCHAR(100),
      rating DECIMAL(3,1) DEFAULT 0.0,
      base_rate DECIMAL(10,2) DEFAULT 0.00,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

  await connection.query(createTableSQL);
};

const formatShippingRow = (row) => ({
  id: row.id,
  name: row.name,
  contact: row.contact,
  phone: row.phone,
  website: row.website,
  status: row.status,
  avatar: row.avatar || '🚚',
  services: parseServices(row.services),
  coverage: row.coverage || 'Global',
  rating: row.rating !== null ? Number(row.rating) : null,
  baseRate: row.base_rate !== null ? Number(row.base_rate) : null,
  description: row.description || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getShippingCompanies = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await ensureShippingTable(connection);
    const [rows] = await connection.query(
      'SELECT * FROM shipping_companies ORDER BY created_at DESC'
    );

    res.status(200).json({
      success: true,
      message: 'Shipping companies fetched successfully',
      data: rows.map(formatShippingRow),
      count: rows.length,
    });
  } catch (error) {
    console.error('Error fetching shipping companies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shipping companies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    connection.release();
  }
};

export const createShippingCompany = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await ensureShippingTable(connection);
    const {
      name,
      contact,
      phone,
      website = '',
      status = 'active',
      avatar = '🚚',
      services = [],
      coverage = 'Global',
      rating = 0,
      base_rate: baseRate = 0,
      description = '',
    } = req.body || {};

    if (!name || !contact || !phone || !coverage) {
      return res.status(400).json({
        success: false,
        message: 'Name, contact, phone, and coverage are required.',
      });
    }

    const serializedServices = serializeServices(services);

    const [result] = await connection.query(
      `INSERT INTO shipping_companies 
        (name, contact, phone, website, status, avatar, services, coverage, rating, base_rate, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        contact,
        phone,
        website || null,
        ['active', 'inactive'].includes(status?.toLowerCase())
          ? status.toLowerCase()
          : 'active',
        avatar || '🚚',
        serializedServices,
        coverage,
        rating ? Number(rating) : 0,
        baseRate ? Number(baseRate) : 0,
        description || null,
      ]
    );

    const [rows] = await connection.query(
      'SELECT * FROM shipping_companies WHERE id = ? LIMIT 1',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Shipping company created successfully',
      data: formatShippingRow(rows[0]),
    });
  } catch (error) {
    console.error('Error creating shipping company:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create shipping company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    connection.release();
  }
};

export const updateShippingCompany = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await ensureShippingTable(connection);
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Shipping company ID is required.',
      });
    }

    const [existingRows] = await connection.query(
      'SELECT * FROM shipping_companies WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shipping company not found.',
      });
    }

    const fields = [];
    const values = [];
    const {
      name,
      contact,
      phone,
      website,
      status,
      avatar,
      services,
      coverage,
      rating,
      base_rate: baseRate,
      description,
    } = req.body || {};

    const appendField = (column, value) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (name !== undefined) appendField('name', name);
    if (contact !== undefined) appendField('contact', contact);
    if (phone !== undefined) appendField('phone', phone);
    if (website !== undefined) appendField('website', website || null);
    if (status !== undefined) {
      appendField(
        'status',
        ['active', 'inactive'].includes(status?.toLowerCase())
          ? status.toLowerCase()
          : 'active'
      );
    }
    if (avatar !== undefined) appendField('avatar', avatar || '🚚');
    if (services !== undefined) {
      appendField('services', serializeServices(services));
    }
    if (coverage !== undefined) appendField('coverage', coverage);
    if (rating !== undefined) appendField('rating', Number(rating) || 0);
    if (baseRate !== undefined)
      appendField('base_rate', Number(baseRate) || 0);
    if (description !== undefined)
      appendField('description', description || null);

    if (!fields.length) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided to update.',
      });
    }

    values.push(id);

    await connection.query(
      `UPDATE shipping_companies SET ${fields.join(
        ', '
      )}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    const [rows] = await connection.query(
      'SELECT * FROM shipping_companies WHERE id = ? LIMIT 1',
      [id]
    );

    res.status(200).json({
      success: true,
      message: 'Shipping company updated successfully',
      data: formatShippingRow(rows[0]),
    });
  } catch (error) {
    console.error('Error updating shipping company:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update shipping company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    connection.release();
  }
};

export const deleteShippingCompany = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await ensureShippingTable(connection);
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Shipping company ID is required.',
      });
    }

    const [existingRows] = await connection.query(
      'SELECT id FROM shipping_companies WHERE id = ? LIMIT 1',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shipping company not found.',
      });
    }

    await connection.query('DELETE FROM shipping_companies WHERE id = ?', [
      id,
    ]);

    res.status(200).json({
      success: true,
      message: 'Shipping company deleted successfully',
      data: { id: Number(id) },
    });
  } catch (error) {
    console.error('Error deleting shipping company:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete shipping company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    connection.release();
  }
};

