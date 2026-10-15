import { db } from '../db.js';

/**
 * Ensures inventory tables exist in the database.
 */
const ensureInventorySchema = async (connection) => {
    // Inventory table: Tracks current stock level for each product
    await connection.query(`
        CREATE TABLE IF NOT EXISTS inventory (
            inventory_id INT AUTO_INCREMENT PRIMARY KEY,
            product_id INT NOT NULL UNIQUE,
            quantity INT DEFAULT 0,
            reorder_level INT DEFAULT 5,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
        )
    `);

    // Inventory Logs table: Tracks every stock movement
    await connection.query(`
        CREATE TABLE IF NOT EXISTS inventory_logs (
            log_id INT AUTO_INCREMENT PRIMARY KEY,
            product_id INT NOT NULL,
            action_type ENUM('stock_in', 'stock_out', 'sale', 'damage', 'adjustment') NOT NULL,
            quantity_changed INT NOT NULL,
            quantity_before INT NOT NULL,
            quantity_after INT NOT NULL,
            reason TEXT,
            admin_name VARCHAR(255),
            is_pay_later TINYINT(1) DEFAULT 0,
            payment_status ENUM('pending', 'paid') DEFAULT 'paid',
            customer_name VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
        )
    `);

    // Ensure columns exist if table was already created
    try {
        const [payLaterCols] = await connection.query("SHOW COLUMNS FROM inventory_logs LIKE 'is_pay_later'");
        if (payLaterCols.length === 0) {
            await connection.query("ALTER TABLE inventory_logs ADD COLUMN is_pay_later TINYINT(1) DEFAULT 0 AFTER admin_name");
        }
        const [paymentStatusCols] = await connection.query("SHOW COLUMNS FROM inventory_logs LIKE 'payment_status'");
        if (paymentStatusCols.length === 0) {
            await connection.query("ALTER TABLE inventory_logs ADD COLUMN payment_status ENUM('pending', 'paid') DEFAULT 'paid' AFTER is_pay_later");
        }
        const [customerNameCols] = await connection.query("SHOW COLUMNS FROM inventory_logs LIKE 'customer_name'");
        if (customerNameCols.length === 0) {
            await connection.query("ALTER TABLE inventory_logs ADD COLUMN customer_name VARCHAR(255) NULL AFTER payment_status");
        }
    } catch (e) {
        console.error("Error ensuring inventory_logs columns:", e);
    }

    // Initialize inventory for existing products if they don't have one
    const [missingProducts] = await connection.query(`
        SELECT p.product_id
        FROM products p
        LEFT JOIN inventory i ON p.product_id = i.product_id
        WHERE i.inventory_id IS NULL
    `);

    if (missingProducts.length > 0) {
        for (const prod of missingProducts) {
            await connection.query(
                'INSERT INTO inventory (product_id, quantity) VALUES (?, 0)',
                [prod.product_id]
            );
        }
    }
};

/**
 * Get all inventory items with product details
 */
export const getAllInventory = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await ensureInventorySchema(connection);
        const { search, category_id, company, status } = req.query;

        let where = "WHERE 1=1";
        const params = [];

        if (search) {
            where += " AND p.product_name LIKE ?";
            params.push(`%${search}%`);
        }
        if (category_id) {
            where += " AND p.category_id = ?";
            params.push(category_id);
        }
        if (company) {
            where += " AND p.company = ?";
            params.push(company);
        }
        if (status === 'low') {
            where += " AND i.quantity <= i.reorder_level AND i.quantity > 0";
        } else if (status === 'out') {
            where += " AND i.quantity = 0";
        }

        const query = `
            SELECT 
                i.*, 
                p.product_name, 
                p.product_code as sku,
                p.category,
                p.category_id,
                p.cost_price,
                p.price,
                p.company,
                p.branch
            FROM inventory i
            JOIN products p ON i.product_id = p.product_id
            ${where}
            ORDER BY i.last_updated DESC
        `;

        const [items] = await connection.query(query, params);
        res.status(200).json({ success: true, data: items });
    } catch (error) {
        console.error("Error fetching inventory:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

/**
 * Perform manual stock adjustment (Stock In / Stock Out)
 */
export const adjustStock = async (req, res) => {
    const { product_id, quantity_change, action_type, reason, admin_name, is_pay_later, customer_name, CustomerName } = req.body;

    if (!product_id || quantity_change === undefined || !action_type) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Get current quantity
        const [invRows] = await connection.query(
            "SELECT quantity FROM inventory WHERE product_id = ? FOR UPDATE",
            [product_id]
        );

        if (invRows.length === 0) {
            throw new Error("Product inventory not found");
        }

        const qtyBefore = invRows[0].quantity;
        const qtyAfter = qtyBefore + parseInt(quantity_change);

        if (qtyAfter < 0) {
            throw new Error("Insufficient stock for this operation");
        }

        // Update inventory
        await connection.query(
            "UPDATE inventory SET quantity = ? WHERE product_id = ?",
            [qtyAfter, product_id]
        );

        const isPayLater = (action_type === 'stock_out' && (is_pay_later === true || is_pay_later === 'true' || is_pay_later === 1 || is_pay_later === '1')) ? 1 : 0;
        const paymentStatus = isPayLater === 1 ? 'pending' : 'paid';
        const finalCustomerName = customer_name || CustomerName || null;

        // Log the action
        const [logRes] = await connection.query(`
            INSERT INTO inventory_logs 
            (product_id, action_type, quantity_changed, quantity_before, quantity_after, reason, admin_name, is_pay_later, payment_status, customer_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [product_id, action_type, quantity_change, qtyBefore, qtyAfter, reason, admin_name, isPayLater, paymentStatus, finalCustomerName]);

        await connection.commit();

        res.status(200).json({
            success: true,
            message: "Stock adjusted successfully",
            data: {
                log_id: logRes.insertId,
                quantity_after: qtyAfter,
                is_pay_later: isPayLater,
                payment_status: paymentStatus,
                customer_name: finalCustomerName
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error("Error adjusting stock:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

/**
 * Perform bulk stock adjustment
 */
export const adjustStockBulk = async (req, res) => {
    const { items, admin_name, is_pay_later, customer_name, CustomerName } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: "Missing items array" });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        for (const item of items) {
            // Support both naming conventions to be safe
            const quantity_change = item.quantity_change !== undefined ? item.quantity_change : item.quantity_changed;
            const { product_id, action_type, reason } = item;

            // Get current quantity
            const [invRows] = await connection.query(
                "SELECT quantity FROM inventory WHERE product_id = ? FOR UPDATE",
                [product_id]
            );

            if (invRows.length === 0) {
                throw new Error(`Product ID ${product_id} not found`);
            }

            const qtyBefore = invRows[0].quantity;
            const qtyAfter = qtyBefore + parseInt(quantity_change);

            if (qtyAfter < 0) {
                throw new Error(`Insufficient stock for product ID ${product_id}`);
            }

            // Update inventory
            await connection.query(
                "UPDATE inventory SET quantity = ? WHERE product_id = ?",
                [qtyAfter, product_id]
            );

            const itemPayLater = item.is_pay_later !== undefined ? item.is_pay_later : is_pay_later;
            const isPayLater = (action_type === 'stock_out' && (itemPayLater === true || itemPayLater === 'true' || itemPayLater === 1 || itemPayLater === '1')) ? 1 : 0;
            const paymentStatus = isPayLater === 1 ? 'pending' : 'paid';
            const finalCustomerName = item.customer_name || item.CustomerName || customer_name || CustomerName || null;

            // Log action
            await connection.query(`
                INSERT INTO inventory_logs 
                (product_id, action_type, quantity_changed, quantity_before, quantity_after, reason, admin_name, is_pay_later, payment_status, customer_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [product_id, action_type, quantity_change, qtyBefore, qtyAfter, reason, admin_name, isPayLater, paymentStatus, finalCustomerName]);
        }

        await connection.commit();

        res.status(200).json({
            success: true,
            message: "Bulk adjustment successful",
            data: { count: items.length }
        });

    } catch (error) {
        await connection.rollback();
        console.error("Error bulk adjusting stock:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

/**
 * Get stock history logs
 */
export const getHistory = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { product_id, action_type, start_date, end_date, payment_status, is_pay_later } = req.query;
        let where = "WHERE 1=1";
        const params = [];

        if (product_id) {
            where += " AND l.product_id = ?";
            params.push(product_id);
        }
        if (action_type && action_type !== 'all') {
            where += " AND l.action_type = ?";
            params.push(action_type);
        }
        if (payment_status && payment_status !== 'all') {
            where += " AND l.payment_status = ?";
            params.push(payment_status);
        }
        if (is_pay_later !== undefined && is_pay_later !== '' && is_pay_later !== 'all') {
            where += " AND l.is_pay_later = ?";
            params.push((is_pay_later === 'true' || is_pay_later === '1' || is_pay_later === 1) ? 1 : 0);
        }
        if (start_date) {
            where += " AND l.created_at >= ?";
            params.push(start_date);
        }
        if (end_date) {
            where += " AND l.created_at <= ?";
            params.push(end_date);
        }

        const query = `
            SELECT l.*, p.product_name, p.product_code as sku, p.price, p.cost_price, p.branch as company
            FROM inventory_logs l
            JOIN products p ON l.product_id = p.product_id
            ${where}
            ORDER BY l.created_at DESC
        `;

        const [history] = await connection.query(query, params);
        res.status(200).json({ success: true, data: history });
    } catch (error) {
        console.error("Error fetching inventory history:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

/**
 * Update payment status for an inventory log (e.g. mark 'pending' pay-later as 'paid')
 */
export const updatePaymentStatus = async (req, res) => {
    const { log_id } = req.params;
    const { payment_status } = req.body;
    const connection = await db.getConnection();
    try {
        const newStatus = payment_status || 'paid';
        await connection.query(
            "UPDATE inventory_logs SET payment_status = ? WHERE log_id = ?",
            [newStatus, log_id]
        );

        res.status(200).json({
            success: true,
            message: `Transaction payment status marked as ${newStatus}`,
            data: { log_id: parseInt(log_id), payment_status: newStatus }
        });
    } catch (error) {
        console.error("Error updating payment status:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

/**
 * Update inventory settings (like reorder level/company)
 */
export const updateInventorySettings = async (req, res) => {
    const { product_id, reorder_level, company, cost_price, price } = req.body;
    const connection = await db.getConnection();
    try {
        // Update reorder_level in inventory table
        await connection.query(
            "UPDATE inventory SET reorder_level = ? WHERE product_id = ?",
            [reorder_level, product_id]
        );

        // Build dynamic SET clause for products table
        const productUpdates = [];
        const productParams = [];

        if (company !== undefined) {
            productUpdates.push('company = ?');
            productParams.push(company);
        }
        if (cost_price !== undefined && cost_price !== null && cost_price !== '') {
            productUpdates.push('cost_price = ?');
            productParams.push(parseFloat(cost_price));
        }
        if (price !== undefined && price !== null && price !== '') {
            productUpdates.push('price = ?');
            productParams.push(parseFloat(price));
        }

        if (productUpdates.length > 0) {
            productParams.push(product_id);
            await connection.query(
                `UPDATE products SET ${productUpdates.join(', ')} WHERE product_id = ?`,
                productParams
            );
        }

        res.status(200).json({ success: true, message: "Settings updated successfully" });
    } catch (error) {
        console.error("Error updating settings:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

/**
 * Internal helper to reduce stock when an order is completed
 */
export const reduceStockForOrder = async (orderId, adminName = 'System') => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // CHECK IF ALREADY REDUCED
        const [existingLogs] = await connection.query(
            "SELECT log_id FROM inventory_logs WHERE reason LIKE ?",
            [`%order #${orderId}%`]
        );

        if (existingLogs.length > 0) {
            console.log(`Stock already reduced for order ${orderId}. Skipping.`);
            await connection.rollback();
            return;
        }

        // Get items for this order
        const [items] = await connection.query(
            "SELECT product_id, quantity, price FROM order_items WHERE order_id = ?",
            [orderId]
        );

        if (items.length === 0) {
            console.log(`No items found for order ${orderId} in order_items table.`);
            await connection.rollback();
            return;
        }

        for (const item of items) {
            // Get current quantity
            const [invRows] = await connection.query(
                "SELECT quantity FROM inventory WHERE product_id = ? FOR UPDATE",
                [item.product_id]
            );

            if (invRows.length > 0) {
                const qtyBefore = invRows[0].quantity;
                const qtyAfter = Math.max(0, qtyBefore - item.quantity);

                // Update inventory
                await connection.query(
                    "UPDATE inventory SET quantity = ? WHERE product_id = ?",
                    [qtyAfter, item.product_id]
                );

                // Log as sale
                await connection.query(`
                    INSERT INTO inventory_logs 
                    (product_id, action_type, quantity_changed, quantity_before, quantity_after, reason, admin_name)
                    VALUES (?, 'sale', ?, ?, ?, ?, ?)
                `, [item.product_id, -item.quantity, qtyBefore, qtyAfter, `Automatic reduction for order #${orderId}`, adminName]);
            }
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        console.error(`Error reducing stock for order ${orderId}:`, error);
        throw error;
    } finally {
        connection.release();
    }
};

export default {
    getAllInventory,
    adjustStock,
    getHistory,
    updatePaymentStatus,
    updateInventorySettings,
    reduceStockForOrder,
    adjustStockBulk
};
