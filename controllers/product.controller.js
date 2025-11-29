import { db } from '../db.js';

const randomString = (length = 6) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i += 1) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

const generateUniqueProductCode = async (connection) => {
    let code = '';
    let isUnique = false;
    while (!isUnique) {
        code = `AMC${randomString(6)}`;
        const [rows] = await connection.query(
            'SELECT 1 FROM products WHERE product_code = ? LIMIT 1',
            [code]
        );

        isUnique = rows.length === 0;
    }
    return code;
};


const getColumnDefinition = async (connection, columnName) => {
    const [columns] = await connection.query(
        'SHOW COLUMNS FROM products LIKE ?',
        [columnName]
    );
    return columns.length > 0 ? columns[0] : null;
};

const columnExists = async (connection, columnName) => Boolean(await getColumnDefinition(connection, columnName));

const ensureProductCodeColumn = async (connection) => {
    const columnDefinition = await getColumnDefinition(connection, 'product_code');
    const hasProductCode = Boolean(columnDefinition);

    if (!hasProductCode) {
        try {
            await connection.query('ALTER TABLE products ADD COLUMN product_code VARCHAR(32) NULL');
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') {
                throw error;
            }
        }
    }

    if (!hasProductCode || (columnDefinition && (columnDefinition.Null !== 'NO' || columnDefinition.Key !== 'UNI'))) {
        const [missingCodes] = await connection.query(
            "SELECT product_id FROM products WHERE product_code IS NULL OR product_code = ''"
        );

        for (const row of missingCodes) {
            const code = await generateUniqueProductCode(connection);
            await connection.query(
                'UPDATE products SET product_code = ? WHERE product_id = ?',
                [code, row.product_id]
            );
        }

        await connection.query('ALTER TABLE products MODIFY COLUMN product_code VARCHAR(32) NOT NULL UNIQUE');
    }
};

const ensureStatusColumn = async (connection) => {
    const columnDefinition = await getColumnDefinition(connection, 'status');
    const hasStatus = Boolean(columnDefinition);

    if (!hasStatus) {
        try {
            await connection.query("ALTER TABLE products ADD COLUMN status ENUM('active','inactive') DEFAULT 'active'");
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') {
                throw error;
            }
        }
    }

    await connection.query("UPDATE products SET status = 'active' WHERE status IS NULL OR status = ''");
};

const ensureCategoryIdColumn = async (connection) => {
    const hasCategoryId = await columnExists(connection, 'category_id');
    if (!hasCategoryId) {
        try {
            await connection.query('ALTER TABLE products ADD COLUMN category_id INT NULL');
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') {
                throw error;
            }
        }
    }
};

const ensureProductSchema = async (connection) => {
    await ensureProductCodeColumn(connection);
    await ensureStatusColumn(connection);
    await ensureCategoryIdColumn(connection);
};

// Create a new product
export const createProduct = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await ensureProductSchema(connection);
        await connection.beginTransaction();

        const {
            nameEn,
            shortDescEn,
            price,
            categoryId,
            categoryName,
            branch,
            status = 'active',
            is_popular = false,
            rating = 0,
            images = [],
            colors = []
        } = req.body;

        // Basic validation
        if (!nameEn || price === undefined) {
            return res.status(400).json({
                success: false,
                message: "product_name and price are required"
            });
        }

        if (!categoryId || !categoryName) {
            return res.status(400).json({
                success: false,
                message: "Category ID and category name are required"
            });
        }

        const productCode = await generateUniqueProductCode(connection);

        const [result] = await connection.query(
            `INSERT INTO products (
                product_name,
                description,
                branch,
                price,
                product_code,
                category_id,
                category,
                is_popular,
                status,
                rating,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                nameEn,
                shortDescEn || null,
                branch,
                parseFloat(price),
                productCode,
                parseInt(categoryId),
                categoryName,
                is_popular ? 1 : 0,
                ['active', 'inactive'].includes((status || '').toLowerCase()) ? status.toLowerCase() : 'active',
                parseInt(rating)
            ]
        );

        const productId = result.insertId;

        // Insert Images
        if (images && Array.isArray(images) && images.length > 0) {
            const imageValues = images.map((imageUrl) => [productId, imageUrl]);
            await connection.query(
                "INSERT INTO product_images (product_id, image_url) VALUES ?",
                [imageValues]
            );
        }

        // Insert Colors
        if (colors && Array.isArray(colors) && colors.length > 0) {
            const colorValues = colors.map((colorName) => [productId, colorName]);
            await connection.query(
                "INSERT INTO product_colors (product_id, color_name) VALUES ?",
                [colorValues]
            );
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: {
                product_id: productId,
                nameEn,
                shortDescEn,
                price: parseFloat(price),
                is_popular,
                status: ['active', 'inactive'].includes((status || '').toLowerCase()) ? status.toLowerCase() : 'active',
                productCode,
                categoryId: parseInt(categoryId),
                categoryName,
                branch,
                rating: parseInt(rating),
                images,
                colors
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error("Error creating product:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create product",
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
};


export const getProducts = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await ensureProductSchema(connection);
        const {
            search,
            is_popular,
            limit = 100,
            offset = 0,
            sort_by: sortBy = 'created_at',
            sort_order: sortOrder = 'DESC',
            branch,
            status = 'active',
            category_id: categoryId,
            created_after: createdAfter,
            created_before: createdBefore,
            random
        } = req.query;

        let where = "WHERE 1=1";
        const params = [];

        // Search filter
        if (search) {
            where += " AND p.product_name LIKE ?";
            params.push(`%${search}%`);
        }

        // Popular filter
        if (is_popular !== undefined) {
            const normalizedPopular = String(is_popular).toLowerCase();
            const isPopularValue = ['1', 'true', 'yes', 'on'].includes(normalizedPopular) ? 1 : 0;
            where += " AND p.is_popular = ?";
            params.push(isPopularValue);
        }

        const normalizedStatus = (status || '').toLowerCase();
        if (normalizedStatus && normalizedStatus !== 'all') {
            where += " AND p.status = ?";
            params.push(normalizedStatus);
        }

        if (branch) {
            where += " AND LOWER(p.branch) = ?";
            params.push(branch.toLowerCase());
        }

        const numericCategoryId = categoryId ? parseInt(categoryId, 10) : null;
        if (numericCategoryId) {
            where += " AND p.category_id = ?";
            params.push(numericCategoryId);
        }

        if (createdAfter) {
            const afterDate = new Date(createdAfter);
            if (!Number.isNaN(afterDate.getTime())) {
                where += " AND p.created_at >= ?";
                params.push(afterDate);
            }
        }

        if (createdBefore) {
            const beforeDate = new Date(createdBefore);
            if (!Number.isNaN(beforeDate.getTime())) {
                where += " AND p.created_at <= ?";
                params.push(beforeDate);
            }
        }

        // Base Query
        const baseQuery = `
            SELECT
                p.product_id AS id,
                p.product_name,
                p.description,
                p.price,
                p.rating,
                p.is_popular,
                p.status,
                p.branch,
                p.product_code,
                p.category_id,
                p.category AS category_name,
                GROUP_CONCAT(DISTINCT pi.image_url) AS images,
                GROUP_CONCAT(DISTINCT pc.color_name) AS colors,
                p.created_at
            FROM products p
            LEFT JOIN product_images pi ON pi.product_id = p.product_id
            LEFT JOIN product_colors pc ON pc.product_id = p.product_id
            ${where}
            GROUP BY p.product_id
        `;

        // Count query
        const countQuery = `
            SELECT COUNT(DISTINCT p.product_id) AS count
            FROM products p
            LEFT JOIN product_images pi ON pi.product_id = p.product_id
            LEFT JOIN product_colors pc ON pc.product_id = p.product_id
            ${where}
        `;

        const [countResult] = await connection.query(countQuery, params);
        const total = countResult[0]?.count || 0;

        // Sorting
        const validSortColumns = ['product_id', 'product_name', 'price', 'rating', 'created_at'];
        const sortCol = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
        const sortDir = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        const useRandomOrder = String(random || '').toLowerCase() === 'true' || String(random) === '1';

        const finalQuery = `
            ${baseQuery}
            ${useRandomOrder ? 'ORDER BY RAND()' : `ORDER BY p.${sortCol} ${sortDir}`}
            LIMIT ? OFFSET ?
        `;

        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
        const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
        const queryParams = [...params, safeLimit, safeOffset];

        const [products] = await connection.query(finalQuery, queryParams);

        // Format output
        const formattedProducts = (products || []).map(product => ({
            id: product.id,
            name: product.product_name,
            description: product.description,
            price: parseFloat(product.price),
            rating: parseInt(product.rating || 0),
            isPopular: product.is_popular,
            status: product.status,
            branch: product.branch,
            productCode: product.product_code || null,
            categoryId: product.category_id ? Number(product.category_id) : null,
            categoryName: product.category_name || '',
            images: product.images ? product.images.split(',') : [],
            colors: product.colors ? product.colors.split(',') : [],
            createdAt: product.created_at
        }));

        res.status(200).json({
            success: true,
            message: "Products retrieved successfully",
            total,
            data: formattedProducts
        });

    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch products",
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
};


// Get single product
export const getProduct = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        const productId = parseInt(req.params.id);

        // Get product details
        const [productRows] = await connection.query(
            `SELECT 
                p.product_id, p.product_name, p.description, p.price, 
                p.is_popular, p.rating, p.created_at, p.branch, 
                p.category, p.product_code, p.status, p.category_id
             FROM products p 
             WHERE p.product_id = ?`,
            [productId]
        );

        if (!productRows || productRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const product = productRows[0];

        // Get images
        const [imageRows] = await connection.query(
            'SELECT image_url, is_main FROM product_images WHERE product_id = ?',
            [productId]
        );

        // Get colors
        const [colorRows] = await connection.query(
            'SELECT color_name, hex_value FROM product_colors WHERE product_id = ?',
            [productId]
        );

        // Format the response
        const formattedProduct = {
            id: product.product_id,
            product_id: product.product_id,
            name: product.product_name,
            product_name: product.product_name, // Keep both for compatibility
            title: product.product_name, // For frontend compatibility
            description: product.description,
            price: parseFloat(product.price),
            finalPrice: parseFloat(product.price), // Assuming no discount logic for now
            isPopular: product.is_popular === 1 || product.is_popular === 'true',
            rating: parseFloat(product.rating || 0),
            status: product.status,
            branch: product.branch,
            productCode: product.product_code,
            categoryId: product.category_id,
            categoryName: product.category,
            category: product.category,
            createdAt: product.created_at,
            images: imageRows.map(img => img.image_url),
            colors: colorRows.map(c => ({ name: c.color_name, hex: c.hex_value }))
        };

        res.status(200).json({
            success: true,
            message: 'Product retrieved successfully',
            data: formattedProduct
        });
    } catch (error) {
        console.error('Error fetching product:', error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

// Delete a product
export const deleteProduct = async (req, res, next) => {
    try {
        const productId = parseInt(req.params.id);

        // Check if product exists
        const existingProduct = await db.getConnection().then(connection => connection.query('SELECT * FROM products WHERE product_id = ?', [productId]));

        if (!existingProduct || existingProduct.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Delete the product
        await db.getConnection().then(connection => connection.query('DELETE FROM products WHERE product_id = ?', [productId]));

        res.status(200).json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting product:', error);
        next(error);
    }
};

// Update a product
export const updateProduct = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await ensureProductSchema(connection);
        const productId = parseInt(req.params.id, 10);
        const updateData = req.body;

        await connection.beginTransaction();

        const [existingProduct] = await connection.query(
            'SELECT * FROM products WHERE product_id = ?',
            [productId]
        );

        if (!existingProduct || existingProduct.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const toBoolInt = (value) => {
            if (typeof value === 'string') {
                return ['true', '1', 'yes', 'on'].includes(value.toLowerCase()) ? 1 : 0;
            }
            return value ? 1 : 0;
        };

        const updateFields = {};
        const assignField = (sourceKey, targetKey, transform = (val) => val) => {
            if (updateData[sourceKey] !== undefined) {
                updateFields[targetKey] = transform(updateData[sourceKey]);
            }
        };

        assignField('nameEn', 'product_name', (val) => val || null);
        assignField('shortDescEn', 'description', (val) => val || null);
        assignField('branch', 'branch', (val) => val || null);
        assignField('price', 'price', (val) => (val !== null ? parseFloat(val) : null));
        assignField('rating', 'rating', (val) => (val !== null ? parseFloat(val) : null));
        assignField('categoryId', 'category_id', (val) => (val ? parseInt(val, 10) : null));
        assignField('categoryName', 'category', (val) => val || null);
        assignField('is_popular', 'is_popular', (val) => toBoolInt(val));
        assignField('isPopular', 'is_popular', (val) => toBoolInt(val));

        if (updateData.status !== undefined) {
            const status = (updateData.status || '').toLowerCase();
            updateFields.status = ['active', 'inactive'].includes(status) ? status : 'active';
        }

        if (Object.keys(updateFields).length === 0 && !updateData.images && !updateData.colors) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'No valid fields provided to update'
            });
        }

        if (Object.keys(updateFields).length > 0) {
            await connection.query('UPDATE products SET ? WHERE product_id = ?', [updateFields, productId]);
        }

        if (updateData.images && Array.isArray(updateData.images)) {
            await connection.query('DELETE FROM product_images WHERE product_id = ?', [productId]);
            if (updateData.images.length > 0) {
                const imageValues = updateData.images.map((image) => [
                    productId,
                    image
                ]);
                await connection.query(
                    'INSERT INTO product_images (product_id, image_url) VALUES ?',
                    [imageValues]
                );
            }
        }

        if (updateData.colors && Array.isArray(updateData.colors)) {
            await connection.query('DELETE FROM product_colors WHERE product_id = ?', [productId]);
            if (updateData.colors.length > 0) {
                const colorValues = updateData.colors.map((colorCode) => [
                    productId,
                    colorCode
                ]);
                await connection.query(
                    'INSERT INTO product_colors (product_id, color_name) VALUES ?',
                    [colorValues]
                );
            }
        }

        await connection.commit();

        const [products] = await connection.query(`
            SELECT
                p.product_id AS id,
                p.product_name,
                p.description,
                p.price,
                p.rating,
                p.is_popular,
                p.status,
                p.branch,
                p.product_code,
                p.category_id,
                p.category AS category_name,
                GROUP_CONCAT(DISTINCT pi.image_url) AS images,
                GROUP_CONCAT(DISTINCT pc.color_name) AS colors,
                p.created_at
            FROM products p
            LEFT JOIN product_images pi ON pi.product_id = p.product_id
            LEFT JOIN product_colors pc ON pc.product_id = p.product_id
            WHERE p.product_id = ?
            GROUP BY p.product_id
        `, [productId]);

        if (products.length === 0) {
            throw new Error('Failed to retrieve updated product');
        }

        const updatedRow = products[0];
        const updatedProduct = {
            id: updatedRow.id,
            name: updatedRow.product_name,
            description: updatedRow.description,
            price: parseFloat(updatedRow.price),
            rating: parseFloat(updatedRow.rating || 0),
            isPopular: updatedRow.is_popular,
            status: updatedRow.status,
            branch: updatedRow.branch,
            productCode: updatedRow.product_code || null,
            categoryId: updatedRow.category_id ? Number(updatedRow.category_id) : null,
            categoryName: updatedRow.category_name || '',
            images: updatedRow.images ? updatedRow.images.split(',') : [],
            colors: updatedRow.colors ? updatedRow.colors.split(',') : [],
            createdAt: updatedRow.created_at
        };

        res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            data: updatedProduct
        });
    } catch (error) {
        console.error('Error updating product:', error);
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back product update:', rollbackError);
        }
        next(error);
    } finally {
        connection.release();
    }
};

export const getTotalProducts = async (req, res) => {
    try {
        const connection = await db.getConnection();
        try {
            const [result] = await connection.query('SELECT COUNT(*) as total FROM products');
            res.status(200).json({
                success: true,
                total: result[0].total
            });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error getting total products:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting total products',
            error: error.message
        });
    }
};

export const getTotalProductCost = async (req, res) => {
    const connection = await db.getConnection();

    try {
        // Check if products table exists
        const [tables] = await connection.query("SHOW TABLES LIKE 'products'");
        const tableExists = tables.length > 0;

        let totalCost = 0;

        if (tableExists) {
            // Get sum of all product prices
            const [result] = await connection.query(`
        SELECT COALESCE(SUM(price), 0) as total_cost
        FROM products
      `);

            totalCost = result[0]?.total_cost || 0;
        }

        res.status(200).json({
            success: true,
            message: 'Total product cost fetched',
            data: {
                totalCost: parseFloat(totalCost)
            }
        });

    } catch (error) {
        console.error('Error fetching total product cost:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch total product cost',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

export default {
    createProduct,
    getProducts,
    getProduct,
    updateProduct,
    deleteProduct
};