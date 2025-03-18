const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync'); // Fixed CSV parser import
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const connection = require('./config/db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const JWT_SECRET = 'your-secret-key'; // In production, use environment variable

// Import data from CSV files
async function importDataFromCSV() {
    try {
        // Disable foreign key checks temporarily
        await connection.promise().query('SET FOREIGN_KEY_CHECKS = 0');

        // Import customers first
        const customersData = fs.readFileSync(path.join(__dirname, '../assets/data/customers.csv'), 'utf-8');
        const customers = parse(customersData, {
            columns: true,
            skip_empty_lines: true
        });

        if (customers.length > 0) {
            await connection.promise().query('TRUNCATE TABLE customers');
            const customerValues = customers.map(customer => [
                customer.MaKH,
                customer.TenKH,
                customer.DiaChi,
                customer.SoDienThoai,
                customer.Username || null
            ]);
            await connection.promise().query(
                'INSERT INTO customers (MaKH, TenKH, DiaChi, SoDienThoai, Username) VALUES ?',
                [customerValues]
            );
            console.log(`Imported ${customers.length} customers successfully`);
        }

        // Import products next
        const productsData = fs.readFileSync(path.join(__dirname, '../assets/data/products.csv'), 'utf-8');
        const products = parse(productsData, {
            columns: true,
            skip_empty_lines: true
        });

        if (products.length > 0) {
            await connection.promise().query('TRUNCATE TABLE products');
            const productValues = products.map(product => [
                product.MaSP,
                product.name,
                parseFloat(product.price) || 0,
                parseInt(product.soluong) || 0,
                parseFloat(product.star) || 0
            ]);
            await connection.promise().query(
                'INSERT INTO products (MaSP, name, price, soluong, star) VALUES ?',
                [productValues]
            );
            console.log(`Imported ${products.length} products successfully`);
        }

        // Finally import orders
        const ordersData = fs.readFileSync(path.join(__dirname, '../assets/data/orders.csv'), 'utf-8');
        const orders = parse(ordersData, {
            columns: true,
            skip_empty_lines: true
        });

        if (orders.length > 0) {
            await connection.promise().query('TRUNCATE TABLE orders');
            const orderValues = orders.map(order => [
                order.MaDH,
                order.MaKH,
                order.MaSP,
                parseInt(order.SoLuong) || 0,
                order.NgayDat,
                parseFloat(order.TongTien) || 0
            ]);
            await connection.promise().query(
                'INSERT INTO orders (MaDH, MaKH, MaSP, SoLuong, NgayDat, TongTien) VALUES ?',
                [orderValues]
            );
            console.log(`Imported ${orders.length} orders successfully`);
        }

        // Re-enable foreign key checks
        await connection.promise().query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (error) {
        console.error('Error importing data:', error);
        // Make sure to re-enable foreign key checks even if there's an error
        await connection.promise().query('SET FOREIGN_KEY_CHECKS = 1');
    }
}

// Initialize database tables
async function initDB() {
    try {
        // Drop existing tables in reverse order of dependencies
        await connection.promise().query('DROP TABLE IF EXISTS orders');
        await connection.promise().query('DROP TABLE IF EXISTS customers');
        await connection.promise().query('DROP TABLE IF EXISTS products');
        await connection.promise().query('DROP TABLE IF EXISTS users');

        // Create users table if not exists
        await connection.promise().query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create customers table if not exists
        await connection.promise().query(`
            CREATE TABLE IF NOT EXISTS customers (
                MaKH INT PRIMARY KEY,
                TenKH VARCHAR(100) NOT NULL,
                DiaChi TEXT,
                SoDienThoai VARCHAR(50),
                Username VARCHAR(50) UNIQUE,
                FOREIGN KEY (Username) REFERENCES users(username)
            )
        `);

        // Create products table if not exists
        await connection.promise().query(`
            CREATE TABLE IF NOT EXISTS products (
                MaSP INT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price DECIMAL(15,2) NOT NULL,
                soluong INT DEFAULT 0,
                star DECIMAL(3,1) DEFAULT 0
            )
        `);

        // Create orders table if not exists
        await connection.promise().query(`
            CREATE TABLE IF NOT EXISTS orders (
                MaDH INT PRIMARY KEY,
                MaKH INT,
                MaSP INT,
                SoLuong INT NOT NULL,
                NgayDat DATE NOT NULL,
                TongTien DECIMAL(15,2) NOT NULL,
                FOREIGN KEY (MaKH) REFERENCES customers(MaKH),
                FOREIGN KEY (MaSP) REFERENCES products(MaSP)
            )
        `);

        // Import all data
        await importDataFromCSV();

    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid token' });
    }
};

// Register new user
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, confirmPassword, tenKH, diaChi, soDienThoai } = req.body;

        // Validation
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        // Check if username exists
        const [existingUser] = await connection.promise().query(
            'SELECT username FROM users WHERE username = ?',
            [username]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Get next customer ID
        const [lastCustomer] = await connection.promise().query(
            'SELECT MAX(CAST(MaKH AS SIGNED)) as lastId FROM customers'
        );
        const nextCustomerId = (lastCustomer[0].lastId || 0) + 1;

        // Begin transaction
        await connection.promise().beginTransaction();

        // Create user
        await connection.promise().query(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            [username, hashedPassword]
        );

        // Create customer
        await connection.promise().query(
            'INSERT INTO customers (MaKH, TenKH, DiaChi, SoDienThoai, Username) VALUES (?, ?, ?, ?, ?)',
            [nextCustomerId.toString(), tenKH, diaChi, soDienThoai, username]
        );

        await connection.promise().commit();

        res.json({ success: true, message: 'Registration successful' });
    } catch (error) {
        await connection.promise().rollback();
        res.status(500).json({ error: error.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Get user
        const [users] = await connection.promise().query(
            'SELECT u.*, c.MaKH FROM users u JOIN customers c ON u.username = c.Username WHERE u.username = ?',
            [username]
        );

        if (users.length === 0) {
            return res.status(400).json({ error: 'User not found' });
        }

        const user = users[0];

        // Validate password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid password' });
        }

        // Create token
        const token = jwt.sign(
            { id: user.id, username: user.username, MaKH: user.MaKH },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({
            token,
            user: {
                username: user.username,
                MaKH: user.MaKH
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Protected API Routes
app.post('/api/order', authenticateToken, async (req, res) => {
    const { MaSP, SoLuong } = req.body;
    const MaKH = req.user.MaKH;
    
    try {
        // Check product availability
        const [product] = await connection.promise().query(
            'SELECT price, soluong FROM products WHERE MaSP = ?',
            [MaSP]
        );
        
        if (!product.length) {
            return res.status(404).json({ error: 'Product not found' });
        }

        if (product[0].soluong < SoLuong) {
            return res.status(400).json({ error: 'Insufficient inventory' });
        }

        const TongTien = product[0].price * SoLuong;
        const [lastOrder] = await connection.promise().query(
            'SELECT MAX(MaDH) as lastId FROM orders'
        );
        const MaDH = (lastOrder[0].lastId || 0) + 1;
        const NgayDat = new Date();

        await connection.promise().beginTransaction();

        // Create order
        await connection.promise().query(
            'INSERT INTO orders SET ?',
            { MaDH, MaKH, MaSP, SoLuong, NgayDat, TongTien }
        );

        // Update inventory
        await connection.promise().query(
            'UPDATE products SET soluong = soluong - ? WHERE MaSP = ?',
            [SoLuong, MaSP]
        );

        await connection.promise().commit();
        res.json({ success: true, orderId: MaDH });
    } catch (error) {
        await connection.promise().rollback();
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/monthly-sales', async (req, res) => {
    try {
        const [results] = await connection.promise().query(`
            SELECT 
                DATE_FORMAT(NgayDat, '%Y-%m') as month,
                SUM(TongTien) as total_sales
            FROM orders
            GROUP BY month
            ORDER BY month
        `);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/top-customers', async (req, res) => {
    try {
        const [results] = await connection.promise().query(`
            SELECT 
                c.MaKH,
                c.TenKH,
                COALESCE(SUM(o.SoLuong), 0) as total_quantity,
                COALESCE(SUM(o.TongTien), 0) as total_spent
            FROM customers c
            LEFT JOIN orders o ON c.MaKH = o.MaKH
            GROUP BY c.MaKH, c.TenKH
            ORDER BY total_quantity DESC
            LIMIT 10
        `);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// New endpoints for additional functionality
app.get('/api/daily-sales', async (req, res) => {
    try {
        const [results] = await connection.promise().query(`
            SELECT 
                DATE(NgayDat) as date,
                SUM(SoLuong) as total_products,
                SUM(TongTien) as total_amount
            FROM orders
            GROUP BY DATE(NgayDat)
            ORDER BY date DESC
        `);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/product-sales', async (req, res) => {
    try {
        const [results] = await connection.promise().query(`
            SELECT 
                p.MaSP,
                p.name,
                COALESCE(SUM(o.TongTien), 0) as total_revenue,
                COALESCE(SUM(o.SoLuong), 0) as total_sold
            FROM products p
            LEFT JOIN orders o ON p.MaSP = o.MaSP
            GROUP BY p.MaSP, p.name
            ORDER BY total_revenue DESC
        `);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/out-of-stock', async (req, res) => {
    try {
        const [results] = await connection.promise().query(`
            SELECT MaSP, name, price, soluong as stock, star
            FROM products
            WHERE soluong <= 10 AND soluong > 0
            ORDER BY soluong ASC, price DESC
            LIMIT 10
        `);
        res.json(results);
    } catch (error) {
        console.error('Error fetching low stock products:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/inactive-customers', async (req, res) => {
    try {
        const [results] = await connection.promise().query(`
            SELECT c.MaKH, c.TenKH, c.DiaChi, c.SoDienThoai,
                   MAX(o.NgayDat) as last_order_date,
                   COUNT(o.MaDH) as total_orders
            FROM customers c
            LEFT JOIN orders o ON c.MaKH = o.MaKH
            GROUP BY c.MaKH, c.TenKH, c.DiaChi, c.SoDienThoai
            HAVING last_order_date IS NULL OR last_order_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            ORDER BY last_order_date ASC
            LIMIT 10
        `);
        res.json(results);
    } catch (error) {
        console.error('Error fetching inactive customers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/customer-product-counts', async (req, res) => {
    try {
        const [results] = await connection.promise().query(`
            SELECT 
                c.MaKH,
                c.TenKH,
                p.MaSP,
                p.name as product_name,
                COUNT(o.MaDH) as order_count,
                SUM(o.SoLuong) as total_quantity
            FROM customers c
            CROSS JOIN products p
            LEFT JOIN orders o ON c.MaKH = o.MaKH AND p.MaSP = o.MaSP
            GROUP BY c.MaKH, c.TenKH, p.MaSP, p.name
            HAVING total_quantity > 0
            ORDER BY c.MaKH, total_quantity DESC
        `);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/top-monthly-product', async (req, res) => {
    try {
        const [results] = await connection.promise().query(`
            WITH MonthlyProductSales AS (
                SELECT 
                    p.MaSP,
                    p.name,
                    DATE_FORMAT(o.NgayDat, '%Y-%m') as month,
                    SUM(o.TongTien) as monthly_revenue,
                    RANK() OVER (PARTITION BY DATE_FORMAT(o.NgayDat, '%Y-%m') 
                                ORDER BY SUM(o.TongTien) DESC) as revenue_rank
                FROM products p
                JOIN orders o ON p.MaSP = o.MaSP
                GROUP BY p.MaSP, p.name, month
            )
            SELECT *
            FROM MonthlyProductSales
            WHERE revenue_rank = 1
            ORDER BY month DESC
        `);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sales-by-period', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const [results] = await connection.promise().query(`
            SELECT 
                p.MaSP,
                p.name,
                SUM(o.SoLuong) as total_quantity,
                SUM(o.TongTien) as total_revenue
            FROM orders o
            JOIN products p ON o.MaSP = p.MaSP
            WHERE DATE(o.NgayDat) BETWEEN ? AND ?
            GROUP BY p.MaSP, p.name
            ORDER BY total_quantity DESC
        `, [startDate, endDate]);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/largest-single-order', async (req, res) => {
    try {
        const [results] = await connection.promise().query(`
            SELECT 
                o.MaDH,
                o.NgayDat,
                p.MaSP,
                p.name,
                o.SoLuong,
                o.TongTien,
                c.TenKH
            FROM orders o
            JOIN products p ON o.MaSP = p.MaSP
            JOIN customers c ON o.MaKH = c.MaKH
            WHERE o.TongTien = (
                SELECT MAX(TongTien)
                FROM orders
            )
        `);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get dashboard statistics
app.get('/api/dashboard', async (req, res) => {
    try {
        const [totalOrders] = await connection.promise().query('SELECT COUNT(*) as count, SUM(TongTien) as total FROM orders');
        const [totalProducts] = await connection.promise().query('SELECT COUNT(*) as count FROM products');
        const [totalCustomers] = await connection.promise().query('SELECT COUNT(*) as count FROM customers');
        
        res.json({
            totalOrders: totalOrders[0].count || 0,
            totalRevenue: totalOrders[0].total || 0,
            totalProducts: totalProducts[0].count || 0,
            totalCustomers: totalCustomers[0].count || 0
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/stock-levels', async (req, res) => {
    try {
        const [results] = await connection.promise().query(`
            SELECT 
                p.MaSP,
                p.name,
                p.soluong as stock,
                p.star
            FROM products p
            WHERE p.soluong <= 10 AND p.soluong > 0
            ORDER BY p.soluong ASC, p.price DESC
            LIMIT 10
        `);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/analysis', async (req, res) => {
    try {
        const [revenueByMonth] = await connection.promise().query(`
            SELECT 
                DATE_FORMAT(o.NgayDat, '%Y-%m') as month,
                SUM(o.TongTien) as revenue
            FROM orders o
            GROUP BY month
            ORDER BY month
        `);
        const [topProducts] = await connection.promise().query(`
            SELECT 
                p.MaSP,
                p.name,
                SUM(o.SoLuong) as total_sold
            FROM products p
            JOIN orders o ON p.MaSP = o.MaSP
            GROUP BY p.MaSP, p.name
            ORDER BY total_sold DESC
            LIMIT 10
        `);
        const topProductsData = topProducts.map(p => ({
            name: p.name,
            sales: p.total_sold
        }));
        // Taking the quantities first
        const [customerOrdersDistributionData] = await connection.promise().query(`
            SELECT
                order_range,
                COUNT(*) AS count
            FROM (
                SELECT
                    CASE
                        WHEN SUM(o.SoLuong) BETWEEN 0 AND 200 THEN '0 - 200'
                        WHEN SUM(o.SoLuong) BETWEEN 200 AND 400 THEN '200 - 400'
                        ELSE '400+'
                    END AS order_range
                FROM customers c
                JOIN orders o ON c.MaKH = o.MaKH
                GROUP BY c.MaKH
            ) AS subquery
            GROUP BY order_range
            ORDER BY
                FIELD(order_range, '0 - 200', '200 - 400', '400+');

        `);
        // Labels: [1 - 4, 4 - 7, 7+]
        const labels = ['0 - 200', '200 - 400', '400+'];
        const data = [0, 0, 0];
        customerOrdersDistributionData.forEach(row => {
            const index = labels.indexOf(row.order_range);
            data[index] = row.count;
        });
        const customerOrdersDistribution = { labels, data };

        const [stockLevelsData] = await connection.promise().query(`
            SELECT 
                p.name,
                p.SoLuong
            FROM products p
        `);
        const outOfStock = stockLevelsData.filter(p => p.SoLuong === 0).length;
        const lowStock = stockLevelsData.filter(p => p.SoLuong > 0 && p.SoLuong < 10).length;
        const adequateStock = stockLevelsData.filter(p => p.SoLuong >= 10).length;
        const stockLevels = {
            outOfStock,
            lowStock,
            adequateStock
        };
        res.json({ revenueByMonth, topProductsData, customerOrdersDistribution, stockLevels });
    } catch (error) {
        console.error('Error fetching analysis data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get recent orders
app.get('/api/recent-orders', async (req, res) => {
    try {
        const [orders] = await connection.promise().query(`
            SELECT o.MaDH, o.NgayDat, c.TenKH, p.name as product_name, 
                   o.SoLuong, o.TongTien
            FROM orders o
            JOIN customers c ON o.MaKH = c.MaKH
            JOIN products p ON o.MaSP = p.MaSP
            ORDER BY o.NgayDat DESC
            LIMIT 5
        `);
        res.json({ orders: orders || [] });
    } catch (error) {
        console.error('Error fetching recent orders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get order history with pagination
app.get('/api/order-history', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT o.MaDH, o.NgayDat, c.TenKH, p.name as product_name,
                   o.SoLuong, o.TongTien
            FROM orders o
            JOIN customers c ON o.MaKH = c.MaKH
            JOIN products p ON o.MaSP = p.MaSP
        `;
        
        const params = [];
        
        if (req.query.startDate && req.query.endDate) {
            query += ' WHERE o.NgayDat BETWEEN ? AND ?';
            params.push(req.query.startDate, req.query.endDate);
        }
        
        query += ' ORDER BY o.NgayDat DESC';
        
        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM (${query}) as sub`;
        const [countResult] = await connection.promise().query(countQuery, params);
        const totalItems = countResult[0].total;
        
        // Get paginated results
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const [orders] = await connection.promise().query(query, params);
        
        res.json({
            orders,
            totalItems,
            totalPages: Math.ceil(totalItems / limit),
            currentPage: page
        });
    } catch (error) {
        console.error('Error fetching order history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get out of stock and low stock products
app.get('/api/out-of-stock', async (req, res) => {
    try {
        const [products] = await connection.promise().query(`
            SELECT MaSP, name, soluong as stock, price
            FROM products
            WHERE soluong <= 10
            ORDER BY soluong ASC
            LIMIT 10
        `);
        res.json(products);
    } catch (error) {
        console.error('Error fetching out of stock products:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get top 10 out-of-stock products
app.get('/api/out-of-stock', async (req, res) => {
    try {
        const [results] = await connection.promise().query(`
            SELECT MaSP, name, price, soluong as stock, star
            FROM products
            WHERE soluong = 0
            ORDER BY price DESC
            LIMIT 10
        `);
        res.json(results);
    } catch (error) {
        console.error('Error fetching out-of-stock products:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get top 10 inactive customers (customers with no orders in the last 30 days)
app.get('/api/inactive-customers', async (req, res) => {
    try {
        const [results] = await connection.promise().query(`
            SELECT c.MaKH, c.TenKH, c.DiaChi, c.SoDienThoai,
                   MAX(o.NgayDat) as last_order_date,
                   COUNT(o.MaDH) as total_orders
            FROM customers c
            LEFT JOIN orders o ON c.MaKH = o.MaKH
            GROUP BY c.MaKH, c.TenKH, c.DiaChi, c.SoDienThoai
            HAVING last_order_date IS NULL OR last_order_date < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            ORDER BY last_order_date ASC
            LIMIT 10
        `);
        res.json(results);
    } catch (error) {
        console.error('Error fetching inactive customers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all products with pagination and sorting
app.get('/api/products', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const sort = req.query.sort || 'MaSP';
        const direction = req.query.direction || 'asc';

        // Map frontend field names to database column names
        const fieldMap = {
            'id': 'MaSP',
            'name': 'name',
            'price': 'price',
            'stock': 'soluong',
            'rating': 'star'
        };

        const sortField = fieldMap[sort] || 'MaSP';
        const sortDirection = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        const searchCondition = search ? 
            `WHERE name LIKE ? OR MaSP LIKE ?` : 
            '';
        const searchParams = search ? 
            [`%${search}%`, `%${search}%`] : 
            [];

        // Get total count for pagination
        const [countResult] = await connection.promise().query(
            `SELECT COUNT(*) as total FROM products ${searchCondition}`,
            searchParams
        );
        const total = countResult[0].total;

        // Get products with search, sorting, and pagination
        const [products] = await connection.promise().query(
            `SELECT * FROM products ${searchCondition} 
             ORDER BY ${sortField} ${sortDirection}
             LIMIT ? OFFSET ?`,
            [...searchParams, limit, offset]
        );

        res.json({
            products: products.map(p => ({
                ...p,
                price: parseFloat(p.price),
                star: parseFloat(p.star)
            })),
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all customers with pagination
app.get('/api/customers', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        const searchCondition = search ? 
            `WHERE c.TenKH LIKE ? OR c.MaKH LIKE ?` : 
            '';
        const searchParams = search ? 
            [`%${search}%`, `%${search}%`] : 
            [];

        const [customers] = await connection.promise().query(`
            SELECT c.MaKH, c.TenKH, c.DiaChi, c.SoDienThoai,
                   COUNT(o.MaDH) as total_orders,
                   SUM(o.TongTien) as total_spent
            FROM customers c
            LEFT JOIN orders o ON c.MaKH = o.MaKH
            ${searchCondition}
            GROUP BY c.MaKH, c.TenKH, c.DiaChi, c.SoDienThoai
            ORDER BY total_spent DESC
            LIMIT ? OFFSET ?
        `, [...searchParams, limit, offset]);

        const [total] = await connection.promise().query('SELECT COUNT(*) as count FROM customers');

        res.json({
            customers,
            total: total[0].count,
            page,
            totalPages: Math.ceil(total[0].count / limit)
        });
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all orders with pagination
app.get('/api/orders', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        
        const searchCondition = search ? 
            `WHERE c.TenKH LIKE ? OR o.MaDH LIKE ? OR p.name LIKE ?` : 
            '';
        const searchParams = search ? 
            [`%${search}%`, `%${search}%`, `%${search}%`] : 
            [];

        // Get total count for pagination
        const [countResult] = await connection.promise().query(
            `SELECT COUNT(DISTINCT o.MaDH) as total 
             FROM orders o
             JOIN customers c ON o.MaKH = c.MaKH
             JOIN products p ON o.MaSP = p.MaSP
             ${searchCondition}`,
            searchParams
        );
        const total = countResult[0].total;

        // Get orders with search and pagination
        const [orders] = await connection.promise().query(
            `SELECT o.MaDH, DATE_FORMAT(o.NgayDat, '%Y-%m-%d') as NgayDat, 
                    c.TenKH, p.name as product_name,
                    o.SoLuong, o.TongTien
             FROM orders o
             JOIN customers c ON o.MaKH = c.MaKH
             JOIN products p ON o.MaSP = p.MaSP
             ${searchCondition}
             ORDER BY o.NgayDat DESC
             LIMIT ? OFFSET ?`,
            [...searchParams, limit, offset]
        );

        res.json({
            orders: orders.map(order => ({
                ...order,
                TongTien: parseFloat(order.TongTien)
            })),
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all customers with pagination and search
app.get('/api/customers', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        
        const searchCondition = search ? 
            `WHERE c.TenKH LIKE ? OR c.MaKH LIKE ? OR c.DiaChi LIKE ? OR c.SoDienThoai LIKE ?` : 
            '';
        const searchParams = search ? 
            [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`] : 
            [];

        // Get total count for pagination
        const [countResult] = await connection.promise().query(
            `SELECT COUNT(*) as total 
             FROM customers c
             ${searchCondition}`,
            searchParams
        );
        const total = countResult[0].total;

        // Get customers with search and pagination
        const [customers] = await connection.promise().query(
            `SELECT 
                c.*,
                COUNT(DISTINCT o.MaDH) as total_orders,
                COALESCE(SUM(o.TongTien), 0) as total_spent
             FROM customers c
             LEFT JOIN orders o ON c.MaKH = o.MaKH
             ${searchCondition}
             GROUP BY c.MaKH
             ORDER BY total_spent DESC
             LIMIT ? OFFSET ?`,
            [...searchParams, limit, offset]
        );

        res.json({
            customers: customers.map(customer => ({
                ...customer,
                total_spent: parseFloat(customer.total_spent)
            })),
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total
        });
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get dashboard statistics
app.get('/api/dashboard', async (req, res) => {
    try {
        const [totalProducts] = await connection.promise().query('SELECT COUNT(*) as count FROM products');
        const [totalCustomers] = await connection.promise().query('SELECT COUNT(*) as count FROM customers');
        const [totalOrders] = await connection.promise().query('SELECT COUNT(*) as count FROM orders');
        const [totalRevenue] = await connection.promise().query('SELECT SUM(TongTien) as total FROM orders');
        
        const [recentOrders] = await connection.promise().query(`
            SELECT o.MaDH, o.MaKH, c.TenKH, o.MaSP, p.name as product_name,
                   o.SoLuong, o.NgayDat, o.TongTien
            FROM orders o
            JOIN customers c ON o.MaKH = c.MaKH
            JOIN products p ON o.MaSP = p.MaSP
            ORDER BY o.NgayDat DESC
            LIMIT 5
        `);

        res.json({
            totalProducts: totalProducts[0].count,
            totalCustomers: totalCustomers[0].count,
            totalOrders: totalOrders[0].count,
            totalRevenue: totalRevenue[0].total || 0,
            recentOrders
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Place new order
app.post('/api/orders', async (req, res) => {
    const { MaKH, MaSP, SoLuong } = req.body;

    if (!MaKH || !MaSP || !SoLuong) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Get product details and check stock
        const [products] = await connection.promise().query(
            'SELECT MaSP, name, price, soluong FROM products WHERE MaSP = ?',
            [MaSP]
        );

        if (!products || products.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = products[0];
        if (product.soluong < SoLuong) {
            return res.status(400).json({ 
                error: `Not enough stock available. Current stock: ${product.soluong}` 
            });
        }

        // Calculate total and get next order ID
        const TongTien = product.price * SoLuong;
        const [lastOrder] = await connection.promise().query('SELECT MAX(MaDH) as lastId FROM orders');
        const MaDH = (lastOrder[0].lastId || 0) + 1;

        try {
            // Begin transaction
            await connection.promise().beginTransaction();

            // Create order
            await connection.promise().query(
                'INSERT INTO orders (MaDH, MaKH, MaSP, SoLuong, TongTien, NgayDat) VALUES (?, ?, ?, ?, ?, NOW())',
                [MaDH, MaKH, MaSP, SoLuong, TongTien]
            );

            // Update product stock
            await connection.promise().query(
                'UPDATE products SET soluong = soluong - ? WHERE MaSP = ?',
                [SoLuong, MaSP]
            );

            // Commit transaction
            await connection.promise().commit();

            // Get updated stock for response
            const [updatedProduct] = await connection.promise().query(
                'SELECT soluong FROM products WHERE MaSP = ?',
                [MaSP]
            );

            res.json({
                success: true,
                orderId: MaDH,
                remainingStock: updatedProduct[0].soluong
            });
        } catch (error) {
            await connection.promise().rollback();
            throw error;
        }
    } catch (error) {
        console.error('Error placing order:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get products with search, sort, and pagination
app.get('/api/products', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const sortBy = req.query.sortBy || 'MaSP';
        const sortOrder = req.query.sortOrder === 'desc' ? 'DESC' : 'ASC';

        let query = `
            SELECT SQL_CALC_FOUND_ROWS 
                MaSP, name, description, price, soluong, 
                category, image_url, created_at 
            FROM products
            WHERE name LIKE ? OR description LIKE ? OR category LIKE ?
            ORDER BY ${sortBy} ${sortOrder}
            LIMIT ? OFFSET ?
        `;

        const searchParam = `%${search}%`;
        const [products] = await connection.promise().query(
            query,
            [searchParam, searchParam, searchParam, limit, offset]
        );

        const [total] = await connection.promise().query('SELECT FOUND_ROWS() as total');
        const totalProducts = total[0].total;
        const totalPages = Math.ceil(totalProducts / limit);

        res.json({
            products,
            currentPage: page,
            totalPages,
            totalProducts
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Initialize database on startup
initDB();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
