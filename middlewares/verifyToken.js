import jwt from 'jsonwebtoken';
import { db } from '../db.js';

const resolvedJwtSecret =
  process.env.JWT_SECRET ||
  process.env.ADMIN_JWT_SECRET ||
  process.env.USER_JWT_SECRET;

if (!resolvedJwtSecret && process.env.NODE_ENV !== 'production') {
  console.warn(
    '[verifyToken] Missing JWT secret. Falling back to a development-only secret. Set JWT_SECRET in your .env file for production.'
  );
}

const JWT_SECRET = resolvedJwtSecret || 'dev_admin_secret_change_me';

// Base token verification
const verifyBaseToken = async (req, res, next, requiredRole = null) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided or invalid token format'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    let account = null;

    // Check if it's a customer token
    if (decoded.role === 'customer') {
      // If admin access is required, reject customers immediately
      if (requiredRole === 'admin' || requiredRole === 'super-admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient permissions.'
        });
      }

      const [customers] = await db.query(
        'SELECT id, email, status, name FROM customers WHERE id = ?',
        [decoded.id]
      );

      if (customers.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      account = customers[0];
      account.role = 'customer';

      if (account.status && account.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Account is inactive'
        });
      }

    } else {
      // Admin/Staff verification
      const [admins] = await db.query(
        'SELECT id, email, role FROM staff WHERE id = ?',
        [decoded.id]
      );

      if (admins.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Admin not found',
        });
      }

      account = admins[0];

      // if staff table doesn't have explicit role column, fall back to token role
      if (!account.role && decoded.role) {
        account.role = decoded.role;
      } else if (!account.role) {
        account.role = 'admin';
      }
    }

    // Check if user has the required role if specified
    if (requiredRole && account.role) {
      // Allow both admin and super-admin when requiredRole is 'admin'
      if (requiredRole === 'admin') {
        if (account.role !== 'admin' && account.role !== 'super-admin') {
          return res.status(403).json({
            success: false,
            message: 'Access denied. Insufficient permissions.'
          });
        }
      } else if (account.role !== requiredRole) {
        // For other roles (like 'super-admin'), require exact match
        return res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient permissions.'
        });
      }
    }

    // Attach user to request object
    req.user = account;
    next();

  } catch (error) {
    console.error('Token verification error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or malformed token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Authentication failed. Please try again.'
    });
  }
};

// Regular user verification
export const verifyToken = (req, res, next) => {
  return verifyBaseToken(req, res, next);
};

// Admin verification
export const verifyAdmin = (req, res, next) => {
  return verifyBaseToken(req, res, next, 'admin');
};

export const isAdmin = (req, res, next) => {
  // This is a placeholder. You'll need to implement admin check based on your user roles
  // Example: Check if req.user.role === 'admin'
  next();
};
