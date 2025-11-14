const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    'https://mango-forest-09c515d10.3.azurestaticapps.net', // admin
    'https://kind-grass-0976a9210.3.azurestaticapps.net', // customer
  ],
  credentials: true
}));
app.use(express.json());

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test route
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'healthy', timestamp: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all movies
app.get('/api/movies', async (req, res) => {
  try {
    const { genre, search } = req.query;
    let query = 'SELECT * FROM movies WHERE 1=1';
    const params = [];

    if (genre && genre !== 'All Genres') {
      params.push(genre);
      query += ` AND $${params.length} = ANY(genres)`;
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      query += ` AND LOWER(title) LIKE $${params.length}`;
    }

    query += ' ORDER BY title';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get today's schedules
app.get('/api/schedules/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT 
        s.*,
        m.title as movie_title,
        m.poster_url,
        m.duration,
        m.rating,
        m.language,
        m.genres
      FROM schedules s
      JOIN movies m ON s.movie_id = m.id
      WHERE s.showtime_date = $1
      ORDER BY s.showtime_time, m.title
    `;

    const result = await pool.query(query, [today]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get weekly schedules
app.get('/api/schedules/weekly', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const endDate = nextWeek.toISOString().split('T')[0];

    const query = `
      SELECT 
        s.*,
        m.title as movie_title,
        m.poster_url,
        m.duration,
        m.rating,
        m.language,
        m.genres
      FROM schedules s
      JOIN movies m ON s.movie_id = m.id
      WHERE s.showtime_date >= $1 AND s.showtime_date < $2
      ORDER BY s.showtime_date, s.showtime_time, m.title
    `;

    const result = await pool.query(query, [today, endDate]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
