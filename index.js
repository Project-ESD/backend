const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Root route
app.get('/', (req, res) => {
  res.send('Hello World from Azure!');
});

// Health check
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
    const result = await pool.query('SELECT * FROM movies');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific movie by ID (includes poster and description)
app.get('/api/movies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM movies WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new movie (POST)
app.post('/api/movies', async (req, res) => {
  try {
    const { title, genres, duration, rating, language, description, poster_url, trailer_url, director, cast, release_year } = req.body;
    const query = `
      INSERT INTO movies (title, genres, duration, rating, language, description, poster_url, trailer_url, director, cast, release_year)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const values = [title, genres, duration, rating, language, description, poster_url, trailer_url, director, cast, release_year];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a movie (PUT)
app.put('/api/movies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, genres, duration, rating, language, description, poster_url, trailer_url, director, cast, release_year } = req.body;
    const query = `
      UPDATE movies
      SET title = $1, genres = $2, duration = $3, rating = $4, language = $5, description = $6, poster_url = $7, trailer_url = $8, director = $9, cast = $10, release_year = $11
      WHERE id = $12
      RETURNING *
    `;
    const values = [title, genres, duration, rating, language, description, poster_url, trailer_url, director, cast, release_year, id];
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a movie (DELETE)
app.delete('/api/movies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM movies WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    res.json({ message: 'Movie deleted', movie: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get schedules for today
app.get('/api/schedules/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query('SELECT * FROM schedules WHERE showtime_date = $1', [today]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get weekly schedules
app.get('/api/schedules/weekly', async (req, res) => {
  try {
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const week = weekFromNow.toISOString().split('T')[0];
    const result = await pool.query('SELECT * FROM schedules WHERE showtime_date <= $1', [week]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new schedule (POST)
app.post('/api/schedules', async (req, res) => {
  try {
    const { movie_id, showtime_date, showtime_time, theater, screen, available_seats, total_seats } = req.body;
    const query = `
      INSERT INTO schedules (movie_id, showtime_date, showtime_time, theater, screen, available_seats, total_seats)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [movie_id, showtime_date, showtime_time, theater, screen, available_seats, total_seats];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a schedule (PUT)
app.put('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { movie_id, showtime_date, showtime_time, theater, screen, available_seats, total_seats } = req.body;
    const query = `
      UPDATE schedules
      SET movie_id = $1, showtime_date = $2, showtime_time = $3, theater = $4, screen = $5, available_seats = $6, total_seats = $7
      WHERE id = $8
      RETURNING *
    `;
    const values = [movie_id, showtime_date, showtime_time, theater, screen, available_seats, total_seats, id];
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a schedule (DELETE)
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM schedules WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    res.json({ message: 'Schedule deleted', schedule: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});