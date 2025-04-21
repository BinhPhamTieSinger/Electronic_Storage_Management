const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const {
    parse
} = require('csv-parse/sync');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
    sql,
    connectionString
} = require('./config/db'); // Use msnodesqlv8 and connectionString
require('dotenv').config(); // Load .env variables
const app = express();
app.use(cors());
app.use(express.json());
// Serve static assets (CSS, JS, images) from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-secret-key-change-me';
if (JWT_SECRET === 'your-very-secret-key-change-me') {
    console.warn("⚠️ WARNING: JWT_SECRET is set to the default value. Please change this in your .env file for security!");
}
// --- msnodesqlv8 Helper Functions ---
function queryAsync(query, params = []) {
    return new Promise((resolve, reject) => {
        sql.query(connectionString, query, params, (err, rows) => {
            if (err) {
                console.error("msnodesqlv8 query error:", err.message);
                console.error("Query:", query);
                console.error("Params:", params);
                // Construct a more informative error object
                const detailedError = new Error(`SQL Query Failed: ${err.message}`);
                detailedError.sqlState = err.sqlState;
                detailedError.code = err.code;
                detailedError.query = query;
                detailedError.params = params;
                return reject(detailedError);
            }
            resolve(rows || []); // Ensure it resolves with an array even if empty
        });
    });
}

function openConnectionAsync() {
    return new Promise((resolve, reject) => {
        sql.open(connectionString, (err, conn) => {
            if (err) {
                console.error("msnodesqlv8 open connection error:", err);
                return reject(err);
            }
            resolve(conn);
        });
    });
}

function queryOnConnectionAsync(conn, query, params = []) {
    return new Promise((resolve, reject) => {
        conn.query(query, params, (err, results) => {
            if (err) {
                console.error("msnodesqlv8 query on connection error:", err.message);
                console.error("Query:", query);
                console.error("Params:", params);
                const detailedError = new Error(`SQL Query Failed (Transaction): ${err.message}`);
                detailedError.sqlState = err.sqlState;
                detailedError.code = err.code;
                detailedError.query = query;
                detailedError.params = params;
                return reject(detailedError);
            }
            resolve(results || []); // Ensure resolves with array
        });
    });
}

function beginTransactionAsync(conn) {
    return queryOnConnectionAsync(conn, 'BEGIN TRANSACTION');
}

function commitTransactionAsync(conn) {
    return queryOnConnectionAsync(conn, 'COMMIT TRANSACTION');
}

function rollbackTransactionAsync(conn) {
    return queryOnConnectionAsync(conn, 'ROLLBACK TRANSACTION');
}

function closeConnectionAsync(conn) {
    return new Promise((resolve) => {
        if (conn && typeof conn.close === 'function') {
            conn.close(() => {
                // console.log("Connection closed."); // Optional logging
                resolve();
            });
        } else {
            resolve(); // Resolve if connection is already null or invalid
        }
    });
}
// --- Import data from CSV files (Robust Version - Skips Existing) ---
async function importDataFromCSV() {
    let connection = null;
    const customerUsernames = new Map(); // Map username to MaKH for efficient lookup
    try {
        console.log("📦 Starting CSV data import transaction (skipping existing records)...");
        connection = await openConnectionAsync();
        await beginTransactionAsync(connection);
        console.log(" Disabling foreign key constraints for import...");
        await queryOnConnectionAsync(connection, 'ALTER TABLE orders NOCHECK CONSTRAINT ALL;').catch(e => console.warn(" Warn: Could not disable FK on orders (maybe first run):", e.message));
        await queryOnConnectionAsync(connection, 'ALTER TABLE customers NOCHECK CONSTRAINT ALL;').catch(e => console.warn(" Warn: Could not disable FK on customers:", e.message));;
        console.log(" Foreign keys disabled.");
        // --- Users (from customers.csv) ---
        const custCsvPath = path.join(__dirname, 'assets/data/customers.csv'); // Corrected path
        if (fs.existsSync(custCsvPath)) {
            console.log(" Reading customers.csv for user creation...");
            const custCsv = fs.readFileSync(custCsvPath, 'utf-8');
            const customersData = parse(custCsv, {
                columns: true,
                skip_empty_lines: true
            });
            const defaultPassword = 'password123'; // Consider making this env var
            const salt = await bcrypt.genSalt(10);
            const defaultHashedPassword = await bcrypt.hash(defaultPassword, salt);
            const userInsertQuery = `
 IF NOT EXISTS (SELECT 1 FROM users WHERE username = ?)
 BEGIN
    INSERT INTO users (username, password, role) VALUES (?, ?, '?');
 END`;
            let userCheckedCount = 0;
            for (const c of customersData) {
                if (c.Username && c.Username.trim() !== '') {
                    const username = c.Username.trim();
                    await queryOnConnectionAsync(connection, userInsertQuery, [username, username, defaultHashedPassword, c.Role]);
                    customerUsernames.set(username, parseInt(c.MaKH, 10)); // Store mapping
                    userCheckedCount++;
                }
            }
            console.log(` → Checked/Inserted ${userCheckedCount} users from customers.csv.`);
        } else {
            console.warn(" Warning: assets/data/customers.csv not found. Cannot pre-populate users/customers.");
        }
        // --- Customers (after users potentially created) ---
        if (fs.existsSync(custCsvPath)) {
            console.log(" Checking/Importing Customers...");
            const custCsv = fs.readFileSync(custCsvPath, 'utf-8'); // Read again or reuse data
            const customersData = parse(custCsv, {
                columns: true,
                skip_empty_lines: true
            });
            const custInsertQuery = `
 BEGIN
 INSERT INTO customers (TenKH, DiaChi, SoDienThoai, Username) VALUES (?, ?, ?, ?);
 END`;
            let custCheckedCount = 0;
            for (let c of customersData) {
                const maKH = parseInt(c.MaKH, 10);
                if (isNaN(maKH)) {
                    console.warn(` Skipping customer due to invalid MaKH: ${c.MaKH}`);
                    continue;
                }
                const username = c.Username?.trim() || null;
                // Ensure username exists in our map (meaning user was created/checked) before linking
                const validUsername = username && customerUsernames.has(username) ? username : null;
                const params = [c.TenKH, c.DiaChi, c.SoDienThoai, validUsername];
                await queryOnConnectionAsync(connection, custInsertQuery, params);
                custCheckedCount++;
            }
            console.log(` → Checked/Imported ${custCheckedCount} customers.`);
        } // No else needed, handled in user check
        // --- Products ---
        const prodCsvPath = path.join(__dirname, 'assets/data/products.csv'); // Corrected path
        if (fs.existsSync(prodCsvPath)) {
            console.log(" Checking/Importing Products...");
            const prodCsv = fs.readFileSync(prodCsvPath, 'utf-8');
            const products = parse(prodCsv, {
                columns: true,
                skip_empty_lines: true
            });
            const prodInsertQuery = `
 BEGIN
 INSERT INTO products (name, price, soluong, star) VALUES (?, ?, ?, ?);
 END`;
            let prodCheckedCount = 0;
            for (let p of products) {
                const maSP = parseInt(p.MaSP, 10);
                if (isNaN(maSP)) {
                    console.warn(` Skipping product due to invalid MaSP: ${p.MaSP}`);
                    continue;
                }
                const params = [
                    p.name, parseFloat(p.price) || 0,
                    parseInt(p.soluong, 10) || 0, parseFloat(p.star) || 0
                ];
                await queryOnConnectionAsync(connection, prodInsertQuery, params);
                prodCheckedCount++;
            }
            console.log(` → Checked/Imported ${prodCheckedCount} products.`);
        } else {
            console.warn(" Warning: assets/data/products.csv not found.");
        }
        // --- Orders ---
        const ordCsvPath = path.join(__dirname, 'assets/data/orders.csv'); // Corrected path
        if (fs.existsSync(ordCsvPath)) {
            console.log(" Checking/Importing Orders...");
            const ordCsv = fs.readFileSync(ordCsvPath, 'utf-8');
            const orders = parse(ordCsv, {
                columns: true,
                skip_empty_lines: true
            });
            const orderInsertQuery = `
 IF NOT EXISTS (SELECT 1 FROM orders WHERE MaDH = ?)
 BEGIN
 -- Check FKs before insert within the transaction for better safety
 IF EXISTS (SELECT 1 FROM customers WHERE MaKH = ?) AND EXISTS (SELECT 1 FROM products WHERE MaSP = ?)
 BEGIN
 INSERT INTO orders (MaDH, MaKH, MaSP, SoLuong, NgayDat, TongTien) VALUES (?, ?, ?, ?, ?, ?);
 END
 ELSE
 BEGIN
 PRINT 'Skipping order MaDH ${"?"} due to missing FK reference.'; -- Cannot parameterize PRINT easily
 END
 END`;
            let orderCheckedCount = 0;
            for (let o of orders) {
                const maDH = parseInt(o.MaDH, 10);
                const maKH = parseInt(o.MaKH, 10);
                const maSP = parseInt(o.MaSP, 10);
                if (isNaN(maDH) || isNaN(maKH) || isNaN(maSP)) {
                    console.warn(` Skipping order due to invalid ID(s): MaDH=${o.MaDH}, MaKH=${o.MaKH}, MaSP=${o.MaSP}`);
                    continue;
                }
                let formattedDateString = null;
                try {
                    if (o.NgayDat) {
                        const parsedDate = new Date(o.NgayDat.trim());
                        if (!isNaN(parsedDate.getTime())) {
                            const year = parsedDate.getFullYear();
                            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                            const day = String(parsedDate.getDate()).padStart(2, '0');
                            formattedDateString = `${year}-${month}-${day}`;
                        } else {
                            console.warn(` Invalid date value in CSV for MaDH ${maDH}: ${o.NgayDat}`);
                        }
                    }
                } catch (dateError) {
                    console.warn(` Error parsing date for MaDH ${maDH}: ${o.NgayDat}`);
                }
                if (!formattedDateString) {
                    console.warn(` Skipping order MaDH ${maDH} due to missing or invalid date.`);
                    continue;
                }
                const params = [
                    maDH, maKH, maSP, // Parameters for FK check
                    maDH, maKH, maSP, // Parameters for INSERT
                    parseInt(o.SoLuong, 10) || 0, formattedDateString, parseFloat(o.TongTien) || 0
                ];
                try {
                    await queryOnConnectionAsync(connection, orderInsertQuery, params);
                    orderCheckedCount++;
                } catch (insertErr) {
                    // Catch specific errors if needed, otherwise let the transaction handle rollback
                    console.error(` Error processing order MaDH ${maDH}: ${insertErr.message}`);
                    throw insertErr; // Re-throw to trigger rollback
                }
            }
            console.log(` → Checked/Imported ${orderCheckedCount} orders.`);
        } else {
            console.warn(" Warning: assets/data/orders.csv not found.");
        }
        console.log(" Re-enabling foreign key constraints...");
        await queryOnConnectionAsync(connection, 'ALTER TABLE customers WITH CHECK CHECK CONSTRAINT ALL;');
        await queryOnConnectionAsync(connection, 'ALTER TABLE orders WITH CHECK CHECK CONSTRAINT ALL;');
        console.log(" Foreign keys enabled.");
        await commitTransactionAsync(connection);
        console.log("✅ CSV data import transaction committed successfully.");
    } catch (err) {
        console.error('❌ CSV Import Error:', err);
        if (connection) {
            try {
                console.log(" Attempting to rollback CSV import transaction...");
                await rollbackTransactionAsync(connection);
                console.log(" Transaction rolled back due to error.");
            } catch (rollbackErr) {
                // Error 3903: Transaction cannot be rolled back. It has already been rolled back.
                if (rollbackErr.code === 3903 || rollbackErr.message.includes('already been rolled back')) {
                    console.log(" Transaction was likely already rolled back by SQL Server.");
                } else {
                    console.error(" ❌ Failed to rollback transaction after import error:", rollbackErr);
                }
            }
            // Attempt to re-enable FKs even on failure (best effort)
            try {
                console.log(" Attempting to re-enable foreign keys after failed import/rollback...");
                await queryOnConnectionAsync(connection, 'ALTER TABLE customers WITH CHECK CHECK CONSTRAINT ALL;').catch(e => console.warn(" Warn: Could not re-enable FK on customers:", e.message));;
                await queryOnConnectionAsync(connection, 'ALTER TABLE orders WITH CHECK CHECK CONSTRAINT ALL;').catch(e => console.warn(" Warn: Could not re-enable FK on orders:", e.message));;
                console.log(" Foreign keys re-enabled attempt finished.");
            } catch (enableFkErr) {
                console.error(" ❌ Failed to re-enable FKs after error:", enableFkErr);
            }
        }
        throw err; // Re-throw error so startServer knows import failed
    } finally {
        if (connection) {
            await closeConnectionAsync(connection);
        }
    }
}
// --- Initialize database tables (With Role and Alter Check) ---
async function initDB() {
    try {
        console.log("📦 Checking database schema...");
        // Check if users table exists
        const checkTableQuery = "SELECT OBJECT_ID('dbo.users', 'U') AS table_id;";
        const checkResult = await queryAsync(checkTableQuery);
        const needsCreation = !checkResult[0]?.table_id;
        if (needsCreation) {
            console.log(" Schema does not appear to exist. Creating tables...");
            await queryAsync(`
 IF OBJECT_ID('dbo.users', 'U') IS NULL BEGIN
 CREATE TABLE users (
 id INT IDENTITY(1,1) PRIMARY KEY,
 username VARCHAR(50) UNIQUE NOT NULL,
 password VARCHAR(255) NOT NULL,
 role VARCHAR(10) NOT NULL DEFAULT 'user', -- 'user', 'employee', 'admin'
 created_at DATETIME2 DEFAULT GETDATE()
 ); PRINT 'Created users table.'; END
 `);
            await queryAsync(`
 IF OBJECT_ID('dbo.products', 'U') IS NULL BEGIN
 CREATE TABLE products (
 MaSP INT IDENTITY(1,1) PRIMARY KEY,
 name NVARCHAR(255) NOT NULL,
 price DECIMAL(15, 2) NOT NULL CHECK (price >= 0),
 soluong INT DEFAULT 0 CHECK (soluong >= 0),
 star DECIMAL(3, 1) DEFAULT 0 CHECK (star >= 0 AND star <= 5),
 created_at DATETIME2 DEFAULT GETDATE() -- Added created_at
 ); PRINT 'Created products table.'; END
 `);
            await queryAsync(`
 IF OBJECT_ID('dbo.customers', 'U') IS NULL BEGIN
 CREATE TABLE customers (
 MaKH INT IDENTITY(1, 1) PRIMARY KEY,
 TenKH NVARCHAR(100) NOT NULL,
 DiaChi NVARCHAR(MAX),
 SoDienThoai VARCHAR(50),
 Username VARCHAR(50) UNIQUE, -- Can be NULL if customer registers without linking immediately
 CONSTRAINT FK_customers_users FOREIGN KEY (Username) REFERENCES users(username)
 ON DELETE SET NULL ON UPDATE CASCADE -- Allow user deletion without forcing customer deletion initially
 ); PRINT 'Created customers table.'; END
 `);
            await queryAsync(`
 IF OBJECT_ID('dbo.orders', 'U') IS NULL BEGIN
 CREATE TABLE orders (
 MaDH INT PRIMARY KEY,
 MaKH INT,
 MaSP INT,
 SoLuong INT NOT NULL CHECK (SoLuong > 0),
 NgayDat DATE NOT NULL,
 TongTien DECIMAL(15, 2) NOT NULL CHECK (TongTien >= 0),
 CONSTRAINT FK_orders_customers FOREIGN KEY (MaKH) REFERENCES customers(MaKH) ON DELETE NO ACTION, -- Don't delete order if customer deleted
 CONSTRAINT FK_orders_products FOREIGN KEY (MaSP) REFERENCES products(MaSP) ON DELETE NO ACTION -- Don't delete order if product deleted
 ); PRINT 'Created orders table.'; END
 `);
            console.log("✅ Database schema creation complete.");
            return true; // Indicate that tables were created
        } else {
            console.log(" Schema tables likely exist. Checking for necessary columns/constraints...");
            // Check for 'role' column in 'users'
            const checkRoleColumnQuery = `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`;
            const roleColumnResult = await queryAsync(checkRoleColumnQuery);
            if (roleColumnResult.length === 0) {
                console.log(" Adding 'role' column to existing 'users' table...");
                await queryAsync(`ALTER TABLE users ADD role VARCHAR(10) NOT NULL DEFAULT 'user';`);
                console.log(" ✅ 'role' column added.");
            }
            // Check for 'created_at' column in 'products'
            const checkProdCreateColQuery = `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'products' AND COLUMN_NAME = 'created_at'`;
            const prodCreateColResult = await queryAsync(checkProdCreateColQuery);
            if (prodCreateColResult.length === 0) {
                console.log(" Adding 'created_at' column to existing 'products' table...");
                await queryAsync(`ALTER TABLE products ADD created_at DATETIME2 DEFAULT GETDATE();`);
                console.log(" ✅ 'created_at' column added to products.");
            }
            console.log("✅ Database schema check complete.");
            return false; // Indicate tables already existed (or were potentially altered)
        }
    } catch (err) {
        console.error('❌ initDB Error:', err);
        throw err; // Re-throw the error to be caught by startServer
    }
}
// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    console.log(`[Auth Middleware] Path: ${req.path}, Method: ${req.method}. Token provided: ${token ? 'Yes' : 'No'}`);

    // **MODIFICATION**: Allow page requests through even without token initially.
    // The protection will happen on the specific route definition using requireRole.
    if (!token) {
        console.log(`[Auth Middleware] No token for ${req.path}. Proceeding.`);
        return next(); // Proceed without setting req.user
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        console.log(`[Auth Middleware] Token verified successfully. req.user set to:`, JSON.stringify(req.user));
        next();
    } catch (error) {
        console.warn(`[Auth Middleware] Token verification FAILED. Error:`, error.message);
        // Invalid token, proceed without setting req.user
        next();
    }
};

// --- Role Middleware (Checks if req.user exists AND has the role) ---
const requireRole = (roles) => {
    return (req, res, next) => {
      console.log(`[Role Middleware] Checking access for Path: ${req.path}. Required: ${roles.join(', ')}. User attached: ${!!req.user}`);
      if (!req.user) {
        console.warn(`[Role Middleware] Access DENIED (401): No valid user found in request.`);
         // Redirect to login for page access failures?
         // Or just send 401? Redirect is often better UX for pages.
         return res.redirect(`/login?message=Please log in to access this page.&type=warning&redirect=${encodeURIComponent(req.originalUrl)}`);
         // return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
      }
      if (!roles.includes(req.user.role)) {
        console.warn(`[Role Middleware] Access DENIED (403): User '${req.user.username}' (Role: ${req.user.role}) lacks required role: ${roles.join(', ')}.`);
         // Send a forbidden error page or message
         return res.status(403).send(`<h2>Forbidden</h2><p>You do not have permission to access this page.</p><a href="/">Go Home</a>`);
         // return res.status(403).json({ error: 'Forbidden: Insufficient permissions.' });
      }
      console.log(`[Role Middleware] Access GRANTED for ${req.user.username} (${req.user.role}).`);
      next();
    };
  };
// --- API Endpoints ---
// Register new user (Defaults role to 'user')
app.post('/api/register', async (req, res) => {
    const {
        username,
        password,
        confirmPassword,
        tenKH,
        diaChi,
        soDienThoai
    } = req.body;
    if (!username || !password || !tenKH) {
        return res.status(400).json({
            error: 'Username, password, and Full Name (TenKH) are required.'
        });
    }
    if (password.length < 6) {
        return res.status(400).json({
            error: 'Password must be at least 6 characters long.'
        });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({
            error: 'Passwords do not match'
        });
    }
    let connection = null;
    try {
        connection = await openConnectionAsync();
        await beginTransactionAsync(connection);
        // Check if username already exists
        const userCheckQuery = 'SELECT id FROM users WHERE username = ?';
        const existingUser = await queryOnConnectionAsync(connection, userCheckQuery, [username]);
        if (existingUser.length > 0) {
            await rollbackTransactionAsync(connection); // Rollback before sending response
            await closeConnectionAsync(connection);
            return res.status(409).json({
                error: 'Username already exists'
            }); // 409 Conflict
        }
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        // Get next available MaKH (simple MAX + 1, consider gaps or sequences for production)
        const lastCustomerRows = await queryOnConnectionAsync(connection, 'SELECT MAX(MaKH) as lastId FROM customers');
        const nextCustomerId = (lastCustomerRows[0]?.lastId || 0) + 1;
        // Insert user with 'user' role
        const insertUserQuery = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)';
        await queryOnConnectionAsync(connection, insertUserQuery, [username, hashedPassword, 'user']);
        // Insert associated customer record
        const insertCustomerQuery = `INSERT INTO customers (TenKH, DiaChi, SoDienThoai, Username) VALUES (?, ?, ?, ?)`;
        await queryOnConnectionAsync(connection, insertCustomerQuery, [
            tenKH, diaChi || null, soDienThoai || null, username
        ]);
        await commitTransactionAsync(connection);
        res.status(201).json({
            success: true,
            message: 'Registration successful'
        });
    } catch (error) {
        console.error('Registration Error:', error);
        if (connection) {
            try {
                await rollbackTransactionAsync(connection);
            } catch (rbErr) {
                console.error('Rollback failed during error handling:', rbErr);
            }
        }
        // Check for specific SQL errors like UNIQUE constraint violation (though checked above)
        if (error.code === 2627 || (error.message && error.message.includes('UNIQUE KEY'))) {
            res.status(409).json({
                error: 'Username or associated customer ID might already exist.'
            });
        } else {
            res.status(500).json({
                error: 'Registration failed due to a server error.'
            });
        }
    } finally {
        if (connection) {
            await closeConnectionAsync(connection);
        }
    }
});
// Login
app.post('/api/login', async (req, res) => {
    const {
        username,
        password
    } = req.body;
    if (!username || !password) {
        return res.status(400).json({
            error: 'Username and password are required'
        });
    }
    try {
        const query = `
 SELECT u.id, u.username, u.password, u.role, c.MaKH
 FROM users u
 LEFT JOIN customers c ON u.username = c.Username
 WHERE u.username = ?`;
        const users = await queryAsync(query, [username]);
        if (users.length === 0) {
            return res.status(401).json({
                error: 'Invalid username or password'
            });
        }
        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({
                error: 'Invalid username or password'
            });
        }
        // Create JWT Payload
        const tokenPayload = {
            id: user.id,
            username: user.username,
            MaKH: user.MaKH, // Will be null if user is admin/employee without customer record
            role: user.role
        };
        const token = jwt.sign(tokenPayload, JWT_SECRET, {
            expiresIn: '1h'
        }); // 1 hour expiry
        // Return token and user info (including role)
        res.json({
            token,
            user: { // Send essential non-sensitive info
                username: user.username,
                MaKH: user.MaKH,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({
            error: 'Login failed due to a server error.'
        });
    }
});
// Get Logged-in User Info (Protected by authenticateToken setting req.user)
app.get('/api/auth/me', authenticateToken, (req, res) => {
    if (!req.user) {
        // This happens if token was missing, invalid, or expired
        return res.status(401).json({
            error: 'Unauthorized: No valid token provided.'
        });
    }
    // Send back the user data obtained from the validated token
    res.json(req.user);
});
// Get All Products (Public, but uses authenticateToken to potentially check req.user later if needed)
app.get('/api/products', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10; // Adjusted default limit
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        // --- Refined Sorting Logic ---
        const requestedSort = req.query.sort || 'MaSP'; // Get requested sort field
        const direction = req.query.direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        // Map frontend sort parameters (case-insensitive keys) to actual DB columns
        const sortColumnMap = {
            'masp': 'MaSP',
            'name': 'name',
            'price': 'price',
            'soluong': 'soluong',
            'star': 'star',
            'created_at': 'created_at'
        };

        // Find the actual DB column name, defaulting to 'MaSP' if invalid/missing
        const sortField = sortColumnMap[requestedSort.toLowerCase()] || 'MaSP';
        const sortDirection = direction; // Already validated 'ASC' or 'DESC'

        console.log(`[API /products] Request Params: page=${page}, limit=${limit}, search='${search}', sort='${requestedSort}', direction='${direction}'`);
        console.log(`[API /products] Resolved Sorting: Field='${sortField}', Direction='${sortDirection}'`); // Log resolved sort

        // --- End Refined Sorting Logic ---


        const params = [];
        let whereClause = '';
        if (search) {
            // Search name OR ID (ensure CAST is correct for your SQL Server version)
            whereClause = `WHERE name LIKE ? OR CAST(MaSP AS VARCHAR(20)) LIKE ?`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }

        // Count total items matching search
        const countQuery = `SELECT COUNT(*) as total FROM products ${whereClause}`;
        const countQueryParams = [...params]; // Params for count query


        // Construct ORDER BY clause carefully
        let orderByClause = `ORDER BY [${sortField}] ${sortDirection}`; // Use square brackets for safety with potential reserved words
        // Add secondary sort by MaSP ASC only if the primary sort is NOT MaSP
        // This prevents ORDER BY MaSP DESC, MaSP ASC which might be confusing/inefficient
        if (sortField !== 'MaSP') {
            orderByClause += `, [MaSP] ASC`;
        }


        // Get paginated data query
        const dataQuery = `
            SELECT MaSP, name, price, soluong, star, created_at
            FROM products
            ${whereClause}
            ${orderByClause}
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY;`;

        // Add pagination params AFTER search params for the data query
        const dataQueryParams = [...params, offset, limit];

        console.log("[API /products] Count Query:", countQuery, countQueryParams);
        console.log("[API /products] Data Query:", dataQuery, dataQueryParams);


        // Execute queries
        const [countResult, dataResult] = await Promise.all([
            queryAsync(countQuery, countQueryParams),
            queryAsync(dataQuery, dataQueryParams)
        ]);

        const totalItems = countResult[0]?.total || 0;
        const totalPages = Math.ceil(totalItems / limit);

        console.log(`[API /products] Found ${totalItems} total items, ${totalPages} total pages.`);

        res.json({
            products: dataResult,
            currentPage: page,
            totalPages: totalPages,
            totalItems: totalItems
        });

    } catch (error) {
        console.error("Error fetching products:", error);
        // Send back more specific error details if available from the queryAsync helper
        res.status(500).json({
            error: 'Failed to retrieve products.',
            details: error.message // Include DB error message if possible
        });
    }
});
// Add Product (Admin/Employee Protected)
app.post('/api/products', authenticateToken, requireRole(['admin', 'employee']), async (req, res) => {
    const {
        name,
        price,
        soluong,
        star
    } = req.body;
    // Validation
    if (!name || price === undefined || soluong === undefined) {
        return res.status(400).json({
            error: 'name, price, and soluong are required'
        });
    }
    const priceNum = parseFloat(price);
    const soluongNum = parseInt(soluong);
    const starNum = parseFloat(star || 0);
    if (isNaN(priceNum) || isNaN(soluongNum) || isNaN(starNum)) {
        return res.status(400).json({
            error: 'price, soluong, and star must be valid numbers.'
        });
    }
    if (priceNum < 0 || soluongNum < 0 || starNum < 0 || starNum > 5) {
        return res.status(400).json({
            error: 'Invalid input: IDs must be positive, price/stock non-negative, star rating 0-5.'
        });
    }
    try {
        // Adjust query to select the inserted product directly
        const insertAndSelectQuery = `
 INSERT INTO products (name, price, soluong, star) VALUES (?, ?, ?, ?);
 `;
        // Pass MaSP twice for the final SELECT
        const result = await queryAsync(insertAndSelectQuery, [name, priceNum, soluongNum, starNum]);
        res.status(201).json({
            success: true,
            message: 'Product added successfully',
            product: {
                MaSP: result.insertId, // Assuming insertId is available from the driver
                name,
                price: priceNum,
                soluong: soluongNum,
                star: starNum
            }
        });


    } catch (error) {
        console.error("Error adding product:", error);
        res.status(500).json({
            error: 'Failed to add product due to server error.'
        });
    }
});
// Update Product (Admin/Employee Protected)
app.put('/api/products/:masp', authenticateToken, requireRole(['admin', 'employee']), async (req, res) => {
    const MaSP_Param = parseInt(req.params.masp);
    const {
        name,
        price,
        soluong,
        star
    } = req.body;
    if (isNaN(MaSP_Param)) {
        return res.status(400).json({
            error: 'Invalid product MaSP provided in URL.'
        });
    }
    // Allow updating individual fields
    if (name === undefined && price === undefined && soluong === undefined && star === undefined) {
        return res.status(400).json({
            error: 'At least one field (name, price, soluong, star) must be provided for update.'
        });
    }
    // Validate provided fields
    const priceNum = price !== undefined ? parseFloat(price) : undefined;
    const soluongNum = soluong !== undefined ? parseInt(soluong) : undefined;
    const starNum = star !== undefined ? parseFloat(star) : undefined;
    if ((priceNum !== undefined && isNaN(priceNum)) || (soluongNum !== undefined && isNaN(soluongNum)) || (starNum !== undefined && isNaN(starNum))) {
        return res.status(400).json({
            error: 'If provided, price, soluong, and star must be valid numbers.'
        });
    }
    if ((priceNum !== undefined && priceNum < 0) || (soluongNum !== undefined && soluongNum < 0) || (starNum !== undefined && (starNum < 0 || starNum > 5))) {
        return res.status(400).json({
            error: 'Invalid input: Price/stock non-negative, star rating 0-5.'
        });
    }
    // Build the dynamic SET clause
    let setClauses = [];
    const params = [];
    if (name !== undefined) {
        setClauses.push('name = ?');
        params.push(name);
    }
    if (priceNum !== undefined) {
        setClauses.push('price = ?');
        params.push(priceNum);
    }
    if (soluongNum !== undefined) {
        setClauses.push('soluong = ?');
        params.push(soluongNum);
    }
    if (starNum !== undefined) {
        setClauses.push('star = ?');
        params.push(starNum);
    }
    if (setClauses.length === 0) {
        // Should have been caught earlier, but good fallback
        return res.status(400).json({
            error: 'No valid fields provided for update.'
        });
    }
    params.push(MaSP_Param); // Add MaSP for WHERE clause
    // Use OUTPUT clause to get updated row directly (more efficient)
    const query = `
 UPDATE products
 SET ${setClauses.join(', ')}
 OUTPUT inserted.* -- Return the updated row
 WHERE MaSP = ?;`;
    try {
        const result = await queryAsync(query, params);
        if (result.length > 0) {
            res.json(result[0]); // Return the updated product data
        } else {
            // No rows affected means product with that MaSP didn't exist
            res.status(404).json({
                error: 'Product not found'
            });
        }
    } catch (error) {
        console.error(`Error updating product ${MaSP_Param}:`, error);
        res.status(500).json({
            error: 'Failed to update product due to server error.'
        });
    }
});
// Delete Product (Admin/Employee Protected)
app.delete('/api/products/:masp', authenticateToken, requireRole(['admin', 'employee']), async (req, res) => {
    const MaSP_Param = parseInt(req.params.masp);
    if (isNaN(MaSP_Param)) {
        return res.status(400).json({
            error: 'Invalid product MaSP provided.'
        });
    }
    let connection = null;
    try {
        connection = await openConnectionAsync();
        await beginTransactionAsync(connection);
        // Check if product is referenced in orders
        const orderCheckQuery = 'SELECT COUNT(*) as count FROM orders WHERE MaSP = ?';
        const orderCheckResult = await queryOnConnectionAsync(connection, orderCheckQuery, [MaSP_Param]);
        if (orderCheckResult[0]?.count > 0) {
            await rollbackTransactionAsync(connection); // Rollback before sending error
            await closeConnectionAsync(connection);
            return res.status(409).json({
                error: `Cannot delete product ${MaSP_Param} because it exists in ${orderCheckResult[0].count} order(s). Consider marking it as unavailable instead.`
            });
        }
        // Proceed with deletion
        const deleteQuery = `DELETE FROM products WHERE MaSP = ?;`;
        // To check if delete worked, we can query before delete or check affected rows if driver supports it.
        // Let's try simple delete and assume success if no FK error.
        const result = await queryOnConnectionAsync(connection, deleteQuery, [MaSP_Param]);
        // msnodesqlv8 might not return affected rows easily here.
        // We rely on the FK check above. If it passed, deletion should succeed unless product doesn't exist.
        // A SELECT before DELETE could confirm existence if needed.
        await commitTransactionAsync(connection);
        // If delete happened without error, send 204
        res.status(204).send(); // No Content indicates success
    } catch (error) {
        console.error(`Error deleting product ${MaSP_Param}:`, error);
        if (connection) {
            try {
                await rollbackTransactionAsync(connection);
            } catch (rbErr) {}
        }
        // Handle potential errors like product not found if not caught by logic
        res.status(500).json({
            error: 'Failed to delete product due to a server error.'
        });
    } finally {
        if (connection) {
            await closeConnectionAsync(connection);
        }
    }
});
// Place new order (User Protected)
// NOTE: This still handles ONE item per API call. Needs refactoring for multi-item cart checkout.
app.post('/api/orders', authenticateToken, requireRole(['user']), async (req, res) => {
    const {
        MaSP,
        SoLuong
    } = req.body;
    const MaKH = req.user.MaKH; // Get MaKH from the validated token
    if (!MaKH) {
        return res.status(403).json({
            error: 'Placing orders requires a linked customer account.'
        });
    }
    const maSPNum = parseInt(MaSP);
    const soLuongNum = parseInt(SoLuong);
    if (isNaN(maSPNum) || isNaN(soLuongNum) || soLuongNum <= 0) {
        return res.status(400).json({
            error: 'Valid Product ID (MaSP) and positive Quantity (SoLuong) are required.'
        });
    }
    let connection = null;
    try {
        connection = await openConnectionAsync();
        await beginTransactionAsync(connection);
        // 1. Check Product Existence & Stock (and lock row if possible/needed for high concurrency)
        // FOR UPDATE hint isn't directly supported, rely on transaction isolation
        const productQuery = 'SELECT price, soluong FROM products WHERE MaSP = ?';
        const productResult = await queryOnConnectionAsync(connection, productQuery, [maSPNum]);
        if (productResult.length === 0) {
            await rollbackTransactionAsync(connection);
            await closeConnectionAsync(connection);
            return res.status(404).json({
                error: `Product with ID ${maSPNum} not found.`
            });
        }
        const product = productResult[0];
        if (product.soluong < soLuongNum) {
            await rollbackTransactionAsync(connection);
            await closeConnectionAsync(connection);
            return res.status(409).json({
                error: `Insufficient stock for product ID ${maSPNum}. Only ${product.soluong} available.`
            }); // 409 Conflict
        }
        // 2. Calculate Total & Get Next Order ID
        const TongTien = product.price * soLuongNum;
        const lastOrderRows = await queryOnConnectionAsync(connection, 'SELECT MAX(MaDH) as lastId FROM orders');
        const MaDH = (lastOrderRows[0]?.lastId || 0) + 1; // Simple increment
        const NgayDat = new Date().toISOString().slice(0, 10); // Format as YYYY-MM-DD
        // 3. Insert Order
        const insertOrderQuery = `INSERT INTO orders (MaDH, MaKH, MaSP, SoLuong, NgayDat, TongTien) VALUES (?, ?, ?, ?, ?, ?);`;
        await queryOnConnectionAsync(connection, insertOrderQuery, [
            MaDH, MaKH, maSPNum, soLuongNum, NgayDat, TongTien
        ]);
        // 4. Update Product Stock
        const updateProductQuery = `UPDATE products SET soluong = soluong - ? WHERE MaSP = ?;`;
        await queryOnConnectionAsync(connection, updateProductQuery, [soLuongNum, maSPNum]);
        // 5. Commit Transaction
        await commitTransactionAsync(connection);
        // 6. Send Success Response
        res.status(201).json({
            success: true,
            orderId: MaDH,
            message: "Order placed successfully"
            // Optionally return the full order details if needed by frontend
        });
    } catch (error) {
        console.error('Order Placement Error:', error);
        if (connection) {
            try {
                await rollbackTransactionAsync(connection);
            } catch (rbErr) {
                console.error('Rollback failed during order placement error:', rbErr);
            }
        }
        res.status(500).json({
            error: 'Order placement failed due to a server error.'
        });
    } finally {
        if (connection) {
            await closeConnectionAsync(connection);
        }
    }
});
// Get Orders for Logged-in User (User Protected)
app.get('/api/my-orders', authenticateToken, requireRole(['user']), async (req, res) => {
    const MaKH = req.user.MaKH;
    if (!MaKH) {
        // Should not happen if requireRole worked, but good check
        return res.status(403).json({
            error: 'No customer account linked to this user.'
        });
    }
    try {
        // Add pagination similar to /api/orders if needed
        const query = `
 SELECT o.MaDH, FORMAT(o.NgayDat, 'yyyy-MM-dd') as NgayDat,
 p.name as product_name, p.MaSP, o.SoLuong, o.TongTien
 FROM orders o JOIN products p ON o.MaSP = p.MaSP
 WHERE o.MaKH = ?
 ORDER BY o.NgayDat DESC, o.MaDH DESC;`;
        const orders = await queryAsync(query, [MaKH]);
        res.json({
            orders
        }); // Keep structure consistent
    } catch (error) {
        console.error(`Error fetching orders for MaKH ${MaKH}:`, error);
        res.status(500).json({
            error: 'Internal server error fetching your orders'
        });
    }
});
// Get All Orders (Admin/Employee Protected)
app.get('/api/orders', authenticateToken, requireRole(['admin', 'employee']), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15; // Default limit
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const params = [];
        let whereClause = '';
        if (search) {
            // Search by Order ID, Customer Name, Product Name
            whereClause = `WHERE (c.TenKH LIKE ? OR CAST(o.MaDH AS VARCHAR(20)) LIKE ? OR p.name LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        const countQuery = `
 SELECT COUNT(o.MaDH) as total FROM orders o
 LEFT JOIN customers c ON o.MaKH = c.MaKH -- LEFT JOIN in case customer deleted but order remains
 LEFT JOIN products p ON o.MaSP = p.MaSP -- LEFT JOIN in case product deleted but order remains
 ${whereClause}`;
        const dataQuery = `
 SELECT o.MaDH, FORMAT(o.NgayDat, 'yyyy-MM-dd') as NgayDat,
 c.TenKH, c.MaKH, p.name as product_name, p.MaSP, o.SoLuong, o.TongTien
 FROM orders o
 LEFT JOIN customers c ON o.MaKH = c.MaKH
 LEFT JOIN products p ON o.MaSP = p.MaSP
 ${whereClause}
 ORDER BY o.NgayDat DESC, o.MaDH DESC
 OFFSET ? ROWS FETCH NEXT ? ROWS ONLY;`;
        const countQueryParams = [...params];
        const dataQueryParams = [...params, offset, limit];
        const [countResult, dataResult] = await Promise.all([
            queryAsync(countQuery, countQueryParams),
            queryAsync(dataQuery, dataQueryParams)
        ]);
        const totalItems = countResult[0]?.total || 0;
        const totalPages = Math.ceil(totalItems / limit);
        res.json({
            orders: dataResult,
            currentPage: page,
            totalPages: totalPages,
            totalItems: totalItems
        });
    } catch (error) {
        console.error("Error fetching all orders (admin):", error);
        res.status(500).json({
            error: 'Failed to retrieve orders list.'
        });
    }
});
// Get Dashboard Statistics (Admin/Employee Protected)
app.get('/api/dashboard', authenticateToken, requireRole(['admin', 'employee']), async (req, res) => {
    try {
        const [productsResult, customersResult, ordersResult, revenueResult, recentOrdersResult] = await Promise.all([
            queryAsync('SELECT COUNT(*) as count FROM products'),
            queryAsync('SELECT COUNT(*) as count FROM customers'),
            queryAsync('SELECT COUNT(*) as count FROM orders'),
            queryAsync('SELECT ISNULL(SUM(TongTien), 0) as total FROM orders'),
            queryAsync(`
 SELECT TOP 5
 o.MaDH, o.MaKH, c.TenKH, o.MaSP, p.name as product_name,
 o.SoLuong, FORMAT(o.NgayDat, 'yyyy-MM-dd') as NgayDat, o.TongTien
 FROM orders o
 LEFT JOIN customers c ON o.MaKH = c.MaKH
 LEFT JOIN products p ON o.MaSP = p.MaSP
 ORDER BY o.NgayDat DESC, o.MaDH DESC;`)
        ]);
        res.json({
            totalProducts: productsResult[0]?.count || 0,
            totalCustomers: customersResult[0]?.count || 0,
            totalOrders: ordersResult[0]?.count || 0,
            totalRevenue: revenueResult[0]?.total || 0,
            recentOrders: recentOrdersResult || []
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({
            error: 'Failed to retrieve dashboard statistics.'
        });
    }
});
// Get Analysis Data (Admin/Employee Protected)
app.get('/api/analysis', authenticateToken, requireRole(['admin', 'employee']), async (req, res) => {
    try {
        const revenueByMonthQuery = `
 SELECT FORMAT(o.NgayDat, 'yyyy-MM') as month, SUM(o.TongTien) as revenue
 FROM orders o GROUP BY FORMAT(o.NgayDat, 'yyyy-MM') ORDER BY month;`;
        const topProductsQuery = `
 SELECT TOP 10 p.name, SUM(o.SoLuong) as total_sold
 FROM products p JOIN orders o ON p.MaSP = o.MaSP
 GROUP BY p.MaSP, p.name ORDER BY total_sold DESC;`;
        const customerOrdersDistributionQuery = `
 SELECT order_range, COUNT(*) AS count FROM (
 SELECT CASE
 WHEN ISNULL(SUM(o.SoLuong), 0) BETWEEN 0 AND 200 THEN '0 - 200'
 WHEN ISNULL(SUM(o.SoLuong), 0) BETWEEN 201 AND 400 THEN '201 - 400'
 ELSE '400+'
 END AS order_range
 FROM customers c LEFT JOIN orders o ON c.MaKH = o.MaKH GROUP BY c.MaKH
 ) AS subquery GROUP BY order_range ORDER BY CASE order_range WHEN '0 - 200' THEN 1 WHEN '201 - 400' THEN 2 ELSE 3 END;`;
        const stockLevelsQuery = `SELECT name, soluong FROM products p;`;
        const [revenueByMonth, topProductsRaw, customerOrdersDistributionRaw, stockLevelsRaw] = await Promise.all([
            queryAsync(revenueByMonthQuery), queryAsync(topProductsQuery),
            queryAsync(customerOrdersDistributionQuery), queryAsync(stockLevelsQuery)
        ]);
        const topProductsData = topProductsRaw.map(p => ({
            name: p.name,
            sales: p.total_sold
        }));
        const labels = ['0 - 200', '201 - 400', '400+'];
        const distributionDataMap = new Map(customerOrdersDistributionRaw.map(item => [item.order_range, item.count]));
        const customerOrdersDistribution = {
            labels: labels,
            data: labels.map(label => distributionDataMap.get(label) || 0)
        };
        const outOfStock = stockLevelsRaw.filter(p => p.soluong === 0).length;
        const lowStock = stockLevelsRaw.filter(p => p.soluong > 0 && p.soluong <= 10).length;
        const adequateStock = stockLevelsRaw.filter(p => p.soluong > 10).length;
        const stockLevels = {
            outOfStock,
            lowStock,
            adequateStock
        };
        res.json({
            revenueByMonth,
            topProductsData,
            customerOrdersDistribution,
            stockLevels
        });
    } catch (error) {
        console.error('Error fetching analysis data:', error);
        res.status(500).json({
            error: 'Internal server error fetching analysis data'
        });
    }
});
// NEW: User Analysis Endpoint (User Protected)
app.get('/api/user-analysis', authenticateToken, requireRole(['user']), async (req, res) => {
    const MaKH = req.user.MaKH;
    if (!MaKH) {
        return res.status(400).json({
            error: "No customer account linked to this user."
        });
    }
    try {
        const totalOrdersQuery = 'SELECT COUNT(*) as count FROM orders WHERE MaKH = ?';
        const totalSpentQuery = 'SELECT ISNULL(SUM(TongTien), 0) as total FROM orders WHERE MaKH = ?';
        const recentOrdersQuery = `
 SELECT TOP 5 o.MaDH, FORMAT(o.NgayDat, 'yyyy-MM-dd') as NgayDat, p.name as product_name, o.SoLuong, o.TongTien
 FROM orders o JOIN products p ON o.MaSP = p.MaSP WHERE o.MaKH = ? ORDER BY o.NgayDat DESC, o.MaDH DESC`;
        const monthlySpendingQuery = `
 SELECT FORMAT(NgayDat, 'yyyy-MM') as month, SUM(TongTien) as monthly_total
 FROM orders WHERE MaKH = ? GROUP BY FORMAT(NgayDat, 'yyyy-MM') ORDER BY month DESC`;
        const [totalOrdersResult, totalSpentResult, recentOrdersResult, monthlySpendingResult] = await Promise.all([
            queryAsync(totalOrdersQuery, [MaKH]), queryAsync(totalSpentQuery, [MaKH]),
            queryAsync(recentOrdersQuery, [MaKH]), queryAsync(monthlySpendingQuery, [MaKH])
        ]);
        res.json({
            totalOrders: totalOrdersResult[0]?.count || 0,
            totalSpent: totalSpentResult[0]?.total || 0,
            recentOrders: recentOrdersResult || [],
            monthlySpending: monthlySpendingResult || []
        });
    } catch (error) {
        console.error(`Error fetching user analysis for MaKH ${MaKH}:`, error);
        res.status(500).json({
            error: 'Failed to retrieve user analysis data.'
        });
    }
});
// --- HTML Page Serving Routes (No .html extension) ---
const frontendDir = path.join(__dirname, '../frontend');
const servePage = (pageName) => (req, res) => res.sendFile(path.join(frontendDir, pageName));
const serveAdminPage = (pageName) => (req, res) => res.sendFile(path.join(frontendDir, 'admin', pageName));
// Public Pages
app.get('/', servePage('index.html'));
app.get('/login', servePage('login.html'));
app.get('/register', servePage('register.html'));
app.get('/products', servePage('products.html'));
app.get('/cart', servePage('cart.html'));
// User Protected Pages
app.get('/orders', servePage('orders.html'));
app.get('/user-dashboard', servePage('user-dashboard.html'));

// Admin/Employee Protected Pages
app.get('/admin/dashboard', serveAdminPage('dashboard.html'));
app.get('/admin/manage-products', serveAdminPage('manage-products.html'));
app.get('/admin/manage-orders', serveAdminPage('manage-orders.html'));
// Add more admin routes here if needed
// --- Server Initialization ---
async function startServer() {
    try {
        // 1. Test DB Connection
        console.log("🚀 Starting Server Initialization...");
        console.log(" [1/4] Testing database connection...");
        const testResult = await queryAsync("SELECT 1 AS test");
        if (!testResult || testResult.length === 0 || testResult[0]?.test !== 1) throw new Error("Database connection test failed.");
        console.log(" ✅ Database connection successful.");
        // 2. Ensure DB Schema (Creates/Alters if necessary)
        console.log(" [2/4] Initializing/Verifying database schema...");
        await initDB(); // Handles creation and alteration checks internally
        console.log(" ✅ Database schema initialization complete.");
        // 3. Check if Initial Data Import is Needed (Only if tables are empty)
        console.log(" [3/4] Checking if initial data import is needed...");
        let needsImport = false;
        const productCountResult = await queryAsync("SELECT COUNT(*) as count FROM products");
        const customerCountResult = await queryAsync("SELECT COUNT(*) as count FROM customers");
        if (productCountResult[0]?.count === 0 || customerCountResult[0]?.count === 0) {
            console.log(` Products: ${productCountResult[0]?.count}, Customers: ${customerCountResult[0]?.count}. Data import required.`);
            needsImport = true;
        } else {
            console.log(` Products: ${productCountResult[0]?.count}, Customers: ${customerCountResult[0]?.count}. Skipping initial data import.`);
        }
        // Set users == TIESINGER to admin role for testing
        const setAdminRoleQuery = `UPDATE users SET role = 'admin' WHERE username = 'TIESINGER';`;
        // Update MaKH and MaSP to be identity (1, 1) if not already set
        await queryAsync(setAdminRoleQuery);
        console.log(" ✅ User role updated to admin for TIESINGER.");
        // 4. Conditionally Run Import (Skips existing records)
        if (needsImport) {
            console.log(" [4/4] Attempting initial data population from CSV (will skip existing)...");
            await importDataFromCSV();
            console.log(" ✅ Initial data population check/import complete.");
        } else {
            console.log(" [4/4] Skipping data import step.");
        }
        // 5. Start Express Server
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log("--------------------------------------------------");
            console.log(`✅ Server running successfully on port ${PORT}`);
            console.log(`🔗 Access Frontend: http://localhost:${PORT}`);
            console.log("--------------------------------------------------");
        });
    } catch (error) {
        console.error("💥💥💥 Server Startup Failed! 💥💥💥");
        console.error("Error during initialization:", error);
        // Provide specific guidance based on common errors
        if (error.message.includes('Login failed') || error.code === 'ELOGIN') {
            console.error("Hint: Check SQL Server Authentication. Ensure 'Trusted_Connection=Yes' is appropriate or provide User ID/Password in connection string.");
        } else if (error.message.includes('ETIMEOUT') || error.message.includes('ENETUNREACH')) {
            console.error("Hint: Cannot reach SQL Server. Ensure the server is running and accessible from this machine (check firewall, server name/instance).");
        } else if (error.message.includes('database') && error.message.includes('does not exist')) {
            console.error(`Hint: Database '${process.env.DB_NAME || 'electronic_storage'}' not found. Please create it or check DB_NAME in .env.`);
        } else if (error.sqlState) { // Generic SQL Error
            console.error(`Hint: SQL Error State: ${error.sqlState}, Code: ${error.code}. Check the query and database schema.`);
        }
        process.exit(1); // Exit if critical initialization fails
    }
}
// Start the server process
startServer();