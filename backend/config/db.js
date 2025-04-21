const sql = require('msnodesqlv8');
require('dotenv').config();
const connectionString = `server=.;Database=${process.env.DB_NAME || 'electronic_storage'};Trusted_Connection=Yes;Driver={ODBC Driver 17 for SQL Server}`; // Ensure correct driver
console.log(`📦 Database configuration loaded for msnodesqlv8. DB: ${process.env.DB_NAME || 'electronic_storage'}, Trusted: Yes`);
module.exports = {
    sql,
    connectionString
};