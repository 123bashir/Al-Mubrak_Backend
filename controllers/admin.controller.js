import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../db.js';

const resolvedJwtSecret =
  process.env.JWT_SECRET ||
  process.env.ADMIN_JWT_SECRET ||
  process.env.USER_JWT_SECRET;

if (!resolvedJwtSecret && process.env.NODE_ENV !== 'production') {
  console.warn('[admin.controller] Missing JWT secret. Falling back to a development-only secret. Set JWT_SECRET in your .env file for production.');
}

const JWT_SECRET = resolvedJwtSecret || 'dev_admin_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const ADMIN_SELECT_FIELDS = 'id, name, email, phone, department, role, avatar, status, last_login, join_date, created_at, updated_at';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'admins');
fs.mkdirSync(ADMIN_UPLOADS_DIR, { recursive: true });

const isFileAvatar = (value) => typeof value === 'string' && value.startsWith('/uploads/admins/');

const buildAvatarUrl = (req, avatarValue) => {
  if (!avatarValue) return null;
  if (/^https?:\/\//i.test(avatarValue)) return avatarValue;
  if (!avatarValue.startsWith('/')) return avatarValue;
  return `${req.protocol}://${req.get('host')}${avatarValue}`;
};

const formatAdminRow = (row, req) => {
  if (!row) return row;
  return {
    ...row,
    avatar_url: buildAvatarUrl(req, row.avatar)
  };
};

const resolveAvatarAbsolutePath = (avatarValue) => {
  if (!isFileAvatar(avatarValue)) return null;
  const relativePath = avatarValue.replace(/^\//, '');
  return path.join(__dirname, '..', relativePath);
};

const deleteAvatarFile = async (avatarValue) => {
  const absolutePath = resolveAvatarAbsolutePath(avatarValue);
  if (!absolutePath) return;
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Failed to delete old avatar:', error.message);
    }
  }
};

// Admin login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find admin by email
    const [admin] = await db.query('SELECT * FROM staff WHERE email = ?', [email]);
    
    if (!admin || admin.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, admin[0].password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: admin[0].id, email: admin[0].email, role: 'admin' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await db.query(
      'UPDATE staff SET last_login = NOW(), updated_at = NOW() WHERE id = ?',
      [admin[0].id]
    );

    const [adminRows] = await db.query(
      `SELECT ${ADMIN_SELECT_FIELDS} FROM staff WHERE id = ?`,
      [admin[0].id]
    );
    const adminData = adminRows?.[0] ?? {};

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      admin: formatAdminRow(adminData, req),
    });
  } catch (error) {
    console.error('Login error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      sqlMessage: error.sqlMessage
    });
    
    // More specific error messages
    let errorMessage = 'An error occurred during login';
    if (error.code === 'ER_NO_SUCH_TABLE') {
      errorMessage = 'Database table not found. Please check your database setup.';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Cannot connect to the database. Please check if the database server is running.';
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      errorMessage = 'Database access denied. Please check your database credentials.';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Verify admin token
export const verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get admin data
    const [admin] = await db.query('SELECT id, name, email, created_at FROM staff WHERE id = ?', [decoded.id]);
    
    if (admin.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    res.status(200).json({
      success: true,
      admin: admin[0],
    });
  } catch (error) {
    console.error('Token verification error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
      });
    }
    
    res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
};

// Middleware to protect admin routes
export const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, no token',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if admin exists
    const [admin] = await db.query('SELECT id FROM staff WHERE id = ?', [decoded.id]);
    
    if (admin.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, admin not found',
      });
    }

    // Add admin to request object
    req.admin = { id: decoded.id, email: decoded.email };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
      });
    }
    
    res.status(401).json({
      success: false,
      message: 'Not authorized, token failed',
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const [admin] = await db.query(
      `SELECT ${ADMIN_SELECT_FIELDS}
       FROM staff
       WHERE id = ?`,
      [adminId]
    );

    if (!admin || admin.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: formatAdminRow(admin[0], req),
    });
  } catch (error) {
    console.error('Error fetching admin profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch admin profile',
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { name, email, phone, department, avatar } = req.body;
    const avatarImage = req.file;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required',
      });
    }

    const [existingEmail] = await db.query(
      'SELECT id FROM staff WHERE email = ? AND id <> ?',
      [email, adminId]
    );

    if (existingEmail.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email already in use by another admin',
      });
    }

    const [currentAdmin] = await db.query(
      'SELECT avatar FROM staff WHERE id = ?',
      [adminId]
    );
    const currentAvatarValue = currentAdmin?.[0]?.avatar || null;

    let normalizedAvatar = currentAvatarValue;
    if (typeof avatar === 'string') {
      const trimmed = avatar.trim();
      normalizedAvatar = trimmed || null;
    }

    if (avatarImage) {
      const relativePath = path.posix.join('uploads', 'admins', avatarImage.filename);
      normalizedAvatar = `/${relativePath}`;
    }

    const shouldDeleteOldAvatar =
      currentAvatarValue &&
      currentAvatarValue !== normalizedAvatar &&
      isFileAvatar(currentAvatarValue);

    const [result] = await db.query(
      `UPDATE staff
       SET name = ?, email = ?, phone = ?, department = ?, avatar = ?, updated_at = NOW()
       WHERE id = ?`,
      [name.trim(), email.trim(), phone || null, department || null, normalizedAvatar, adminId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found or unchanged',
      });
    }

    if (shouldDeleteOldAvatar) {
      await deleteAvatarFile(currentAvatarValue);
    }

    const [updatedAdmin] = await db.query(
      `SELECT ${ADMIN_SELECT_FIELDS}
       FROM staff
       WHERE id = ?`,
      [adminId]
    );

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: formatAdminRow(updatedAdmin[0], req),
    });
  } catch (error) {
    console.error('Error updating admin profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
    });
  }
};

export const updatePassword = async (req, res) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current and new passwords are required',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long',
      });
    }

    const [admin] = await db.query('SELECT password FROM staff WHERE id = ?', [adminId]);

    if (!admin || admin.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, admin[0].password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await db.query(
      'UPDATE staff SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, adminId]
    );

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    console.error('Error updating admin password:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update password',
    });
  }
};

export const logout = async (req, res) => {
  try {
    // Since JWT is stateless, we simply inform the client to discard the token
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Error during admin logout:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to log out',
    });
  }
};
