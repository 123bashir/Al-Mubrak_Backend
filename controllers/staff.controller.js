import { db } from '../db.js';
import bcrypt from 'bcryptjs';

// Get all staff (only super_admin can see all staff)
export const getStaff = async (req, res) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Check if the requesting admin is super_admin
    const [admin] = await db.query('SELECT role FROM staff WHERE id = ?', [adminId]);
    if (!admin || admin.length === 0 || admin[0].role !== 'super-admin') {
      return res.status(403).json({
        success: false,
        message: 'Only super admin can view staff'
      });
    }

    const [staff] = await db.query(
      `SELECT id, name, email, role, department, status, last_login, avatar, phone, join_date, created_at, updated_at 
       FROM staff 
       WHERE role IN ('super-admin', 'admin')
       ORDER BY created_at DESC`
    );

    return res.status(200).json({
      success: true,
      data: staff
    });
  } catch (error) {
    console.error('Error fetching staff:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch staff'
    });
  }
};

// Create staff (only super_admin can create admin)
export const createStaff = async (req, res) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Check if the requesting admin is super_admin
    const [admin] = await db.query('SELECT role FROM staff WHERE id = ?', [adminId]);
    if (!admin || admin.length === 0 || admin[0].role !== 'super-admin') {
      return res.status(403).json({
        success: false,
        message: 'Only super admin can create staff'
      });
    }

    const { name, email, role, department, phone, password, status = 'active' } = req.body;

    if (!name || !email || !role || !password) {
      return res.status(422).json({
        success: false,
        message: 'Name, email, role, and password are required'
      });
    }

    // Only allow creating 'admin' role (super_admin should be created manually)
    if (role !== 'admin') {
      return res.status(422).json({
        success: false,
        message: 'Only admin role can be created'
      });
    }

    // Check if email already exists
    const [existingStaff] = await db.query('SELECT id FROM staff WHERE email = ?', [email]);
    if (existingStaff.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert new staff
    const [result] = await db.query(
      `INSERT INTO staff (name, email, role, department, phone, password, status, join_date, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [name, email, role, department || null, phone || null, hashedPassword, status]
    );

    // Return the created staff (without password)
    const [newStaff] = await db.query(
      `SELECT id, name, email, role, department, status, last_login, avatar, phone, join_date, created_at, updated_at 
       FROM staff WHERE id = ?`,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Staff created successfully',
      data: {
        ...newStaff[0],
        password: password // Return plain password for UI display
      }
    });
  } catch (error) {
    console.error('Error creating staff:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create staff',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update staff (only super_admin can update)
export const updateStaff = async (req, res) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Check if the requesting admin is super_admin
    const [admin] = await db.query('SELECT role FROM staff WHERE id = ?', [adminId]);
    if (!admin || admin.length === 0 || admin[0].role !== 'super-admin') {
      return res.status(403).json({
        success: false,
        message: 'Only super admin can update staff'
      });
    }

    const staffId = parseInt(req.params.id);
    if (isNaN(staffId) || staffId <= 0) {
      return res.status(422).json({
        success: false,
        message: 'Invalid staff ID'
      });
    }

    const { name, email, role, department, phone, status, password } = req.body;

    // Build dynamic update query
    const updates = [];
    const params = [];

    if (name) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (email) {
      updates.push('email = ?');
      params.push(email.trim());
    }
    if (role) {
      updates.push('role = ?');
      params.push(role.trim());
    }
    if (department !== undefined) {
      updates.push('department = ?');
      params.push(department || null);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone || null);
    }
    if (status) {
      updates.push('status = ?');
      params.push(status.trim());
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 12);
      updates.push('password = ?');
      params.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one field is required for update'
      });
    }

    updates.push('updated_at = NOW()');
    params.push(staffId);

    const [result] = await db.query(
      `UPDATE staff SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Staff not found or no changes made'
      });
    }

    // Get updated staff
    const [updatedStaff] = await db.query(
      `SELECT id, name, email, role, department, status, last_login, avatar, phone, join_date, created_at, updated_at 
       FROM staff WHERE id = ?`,
      [staffId]
    );

    return res.status(200).json({
      success: true,
      message: 'Staff updated successfully',
      data: updatedStaff[0]
    });
  } catch (error) {
    console.error('Error updating staff:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update staff',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete staff (only super_admin can delete)
export const deleteStaff = async (req, res) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Check if the requesting admin is super_admin
    const [admin] = await db.query('SELECT role FROM staff WHERE id = ?', [adminId]);
    if (!admin || admin.length === 0 || admin[0].role !== 'super-admin') {
      return res.status(403).json({
        success: false,
        message: 'Only super admin can delete staff'
      });
    }

    const staffId = parseInt(req.params.id);
    if (isNaN(staffId) || staffId <= 0) {
      return res.status(422).json({
        success: false,
        message: 'Invalid staff ID'
      });
    }

    // Prevent deleting self
    if (staffId === adminId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete yourself'
      });
    }

    const [result] = await db.query('DELETE FROM staff WHERE id = ?', [staffId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Staff not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Staff deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting staff:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete staff',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

