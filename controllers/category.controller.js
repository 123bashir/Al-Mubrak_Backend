import { db } from '../db.js';

export const createCategory = async (req, res) => {
  try {
    const { name, slug, status = 'active', description, image } = req.body;

    // Validate required fields
    if (!name || !slug) {
      return res.status(422).json({
        success: false,
        message: 'Name and slug are required'
      });
    }

    // Check if category with same slug already exists
    const [existingCategory] = await db.query(
      'SELECT id FROM categories WHERE slug = ?',
      [slug]
    );

    if (existingCategory.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A category with this slug already exists'
      });
    }

    // Insert new category
    const [result] = await db.query(
      `INSERT INTO categories (name, slug, status, description, image, created_at) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [name, slug, status, description || null, image || null]
    );

    return res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: {
        id: result.insertId
      }
    });

  } catch (error) {
    console.error('Error creating category:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create category',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};



export const updateCategory = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const categoryId = parseInt(req.params.id);
    const { name, slug, status, description, image } = req.body;

    if (isNaN(categoryId) || categoryId <= 0) {
      return res.status(422).json({
        success: false,
        message: 'Invalid category ID'
      });
    }

    // Validate at least one field is provided
    if (!name && !slug && !status && description === undefined && image === undefined) {
      return res.status(400).json({
        success: false,
        message: 'At least one field is required for update'
      });
    }

    // Build dynamic update query
    const updates = [];
    const params = [];

    if (name) {
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (slug) {
      updates.push('slug = ?');
      params.push(slug.trim());
    }

    if (status) {
      updates.push('status = ?');
      params.push(status.trim());
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description || null);
    }

    if (image !== undefined) {
      updates.push('image = ?');
      params.push(image || null);
    }

    // Add updated_at timestamp
    updates.push('updated_at = NOW()');

    // Add category ID to params
    params.push(categoryId);

    const [result] = await connection.query(
      `UPDATE categories 
       SET ${updates.join(', ')} 
       WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found or no changes made'
      });
    }

    // Get the updated category
    const [[updatedCategory]] = await connection.query(
      'SELECT * FROM categories WHERE id = ?',
      [categoryId]
    );

    return res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: {
        id: updatedCategory.id,
        name: updatedCategory.name,
        slug: updatedCategory.slug,
        status: updatedCategory.status,
        description: updatedCategory.description,
        image: updatedCategory.image,
        updatedAt: updatedCategory.updated_at
      }
    });

  } catch (error) {
    console.error('Error updating category:', error);

    // Handle duplicate slug error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'A category with this slug already exists'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to update category',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};

export const deleteCategory = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const categoryId = parseInt(req.params.id);

    if (isNaN(categoryId) || categoryId <= 0) {
      return res.status(422).json({
        success: false,
        message: 'Invalid category ID'
      });
    }

    // Delete the category
    const [result] = await connection.query('DELETE FROM categories WHERE id = ?', [categoryId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting category:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete category',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    connection.release();
  }
};



export const getCategories = async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM categories ORDER BY created_at DESC');

    return res.status(200).json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
};