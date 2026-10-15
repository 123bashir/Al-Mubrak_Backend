import { db } from '../db.js';

// Add item to cart
export const addToCart = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { productId, quantity } = req.body;
    const userId = req.user.id; // Assumes auth middleware populates req.user

    if (!productId || !quantity) {
      return res.status(400).json({ success: false, message: 'Product ID and quantity are required' });
    }

    await connection.beginTransaction();

    // 1. Check if user has an active cart
    let [cartRows] = await connection.query(
      'SELECT cart_id FROM carts WHERE customer_id = ?',
      [userId]
    );

    let cartId;
    if (cartRows.length === 0) {
      // Create new cart
      const [result] = await connection.query(
        'INSERT INTO carts (customer_id, created_at, updated_at) VALUES (?, NOW(), NOW())',
        [userId]
      );
      cartId = result.insertId;
    } else {
      cartId = cartRows[0].cart_id;
    }

    // 2. Check if item exists in cart
    const [itemRows] = await connection.query(
      'SELECT cart_item_id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?',
      [cartId, productId]
    );

    if (itemRows.length > 0) {
      // Update quantity
      const newQuantity = itemRows[0].quantity + quantity;
      await connection.query(
        'UPDATE cart_items SET quantity = ? WHERE cart_item_id = ?',
        [newQuantity, itemRows[0].cart_item_id]
      );
    } else {
      // Insert new item
      await connection.query(
        'INSERT INTO cart_items (cart_id, product_id, quantity, added_at) VALUES (?, ?, ?, NOW())',
        [cartId, productId, quantity]
      );
    }

    // Update cart timestamp
    await connection.query('UPDATE carts SET updated_at = NOW() WHERE cart_id = ?', [cartId]);

    await connection.commit();

    res.status(200).json({ success: true, message: 'Item added to cart' });

  } catch (error) {
    await connection.rollback();
    console.error('Error adding to cart:', error);
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// Get cart items
export const getCart = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const userId = req.user.id;

    const [cartRows] = await connection.query(
      'SELECT cart_id FROM carts WHERE customer_id = ?',
      [userId]
    );

    if (cartRows.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const cartId = cartRows[0].cart_id;

    const [items] = await connection.query(`
            SELECT 
                ci.cart_item_id, 
                ci.quantity, 
                p.product_id, 
                p.product_name, 
                p.price, 
                p.description,
                (SELECT image_url FROM product_images WHERE product_id = p.product_id LIMIT 1) as image
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.product_id
            WHERE ci.cart_id = ?
        `, [cartId]);

    res.status(200).json({ success: true, data: items });

  } catch (error) {
    console.error('Error fetching cart:', error);
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// Update cart item quantity
export const updateCartItem = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (quantity < 1) {
      // If quantity is less than 1, remove the item
      await connection.query('DELETE FROM cart_items WHERE cart_item_id = ?', [itemId]);
    } else {
      await connection.query(
        'UPDATE cart_items SET quantity = ? WHERE cart_item_id = ?',
        [quantity, itemId]
      );
    }

    res.status(200).json({ success: true, message: 'Cart updated' });

  } catch (error) {
    console.error('Error updating cart:', error);
    next(error);
  } finally {
    if (connection) connection.release();
  }
};

// Remove item from cart
export const removeFromCart = async (req, res, next) => {
  const connection = await db.getConnection();
  try {
    const { itemId } = req.params;

    await connection.query('DELETE FROM cart_items WHERE cart_item_id = ?', [itemId]);

    res.status(200).json({ success: true, message: 'Item removed from cart' });

  } catch (error) {
    console.error('Error removing from cart:', error);
    next(error);
  } finally {
    if (connection) connection.release();
  }
};
