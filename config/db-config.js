const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
async function initDb() {
  try {
    const schemaPath = path.join(__dirname, '../schema.js');
    const schema = require(schemaPath);
    await pool.query(schema);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('DB init error:', err);
    throw err;
  }

  

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Database initialized');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Database init failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDb
};