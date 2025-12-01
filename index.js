const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { initDb } = require('./config/db-config');
const Stripe = require('stripe');
require('dotenv').config();




const app = express();
const port = process.env.PORT || 3000;
const stripeSecretKey =
  process.env.STRIPE_SECRET_KEY || 'sk_test_51SSD41I7jAP0ya485RmgXQVUKZhR3OA2UIX1CsJX5AZnt4iMgkSNrykJXBqXfBdCxulKXSZ48CZNfdajKF4b6bJS003htDuU29';
const stripe = new Stripe(stripeSecretKey);

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  'https://mango-forest-09c515d10.3.azurestaticapps.net';

const allowedOrigins = [
  'https://mango-forest-09c515d10.3.azurestaticapps.net',
  'https://kind-grass-0976a9210.3.azurestaticapps.net',
  'http://localhost:5173'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true // if you use cookies or authentication
}));
app.use(express.json());
// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize database (create tables)
initDb().catch(err => console.error('DB init error:', err));

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

// Create Stripe Checkout Session for ticket purchase
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { scheduleId, movieId, quantity, pricePerTicket } = req.body;

    if (!scheduleId || !movieId || !quantity || !pricePerTicket) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Load movie and schedule from DB
    const movieResult = await pool.query('SELECT * FROM movies WHERE id = $1', [movieId]);
    const scheduleResult = await pool.query('SELECT * FROM schedules WHERE id = $1', [scheduleId]);

    if (movieResult.rows.length === 0 || scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Movie or schedule not found.' });
    }

    const movie = movieResult.rows[0];
    const schedule = scheduleResult.rows[0];

    // Optional simple seat check
    if (quantity > schedule.available_seats) {
      return res.status(400).json({ error: 'Not enough available seats.' });
    }

    const unitAmountCents = Math.round(Number(pricePerTicket) * 100);

    // Format date/time for description
    const dateStr = schedule.showtime_date.toISOString
      ? schedule.showtime_date.toISOString().split('T')[0]
      : String(schedule.showtime_date).slice(0, 10);
    const timeStr = String(schedule.showtime_time).slice(0, 5);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur', // adjust if needed
            product_data: {
              name: `${movie.title} ticket`,
              description: `${schedule.theater} • ${schedule.screen} • ${dateStr} ${timeStr}`
            },
            unit_amount: unitAmountCents
          },
          quantity
        }
      ],
      success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/payment-cancel`
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: 'Unable to create checkout session.' });
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
    console.error(err);
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

app.get('/api/schedules', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.id AS schedule_id,
        s.showtime_date,
        s.showtime_time,
        s.theater,
        s.screen,
        s.available_seats,
        s.total_seats,
        TO_CHAR(s.showtime_date, 'Dy') AS weekday,
        m.id AS movie_id,
        m.title,
        m.poster_url,
        m.genres,
        m.duration,
        m.rating
      FROM schedules s
      JOIN movies m ON s.movie_id = m.id
      ORDER BY s.showtime_date, s.showtime_time
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all schedules (with optional filters)
app.get('/api/admin/schedules', async (req, res) => {
  // Add filters as needed (date, theater, etc.)
  const result = await pool.query('SELECT * FROM schedules ORDER BY showtime_date, showtime_time');
  res.json(result.rows);
});

// Update a schedule
app.put('/api/admin/schedules/:id', async (req, res) => {
  const { movie_id, showtime_date, showtime_time, theater, screen, available_seats, total_seats } = req.body;
  await pool.query(
    'UPDATE schedules SET movie_id=$1, showtime_date=$2, showtime_time=$3, theater=$4, screen=$5, available_seats=$6, total_seats=$7 WHERE id=$8',
    [movie_id, showtime_date, showtime_time, theater, screen, available_seats, total_seats, req.params.id]
  );
  res.sendStatus(200);
});
app.get('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM schedules WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a schedule
app.delete('/api/admin/schedules/:id', async (req, res) => {
  await pool.query('DELETE FROM schedules WHERE id=$1', [req.params.id]);
  res.sendStatus(200);
});

// THEATER MANAGEMENT ENDPOINTS

// Get all theaters
app.get('/api/theaters', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM theaters ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific theater
app.get('/api/theaters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM theaters WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Theater not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new theater
app.post('/api/theaters', async (req, res) => {
  try {
    const { name, location } = req.body;
    const query = 'INSERT INTO theaters (name, location) VALUES ($1, $2) RETURNING *';
    const result = await pool.query(query, [name, location]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a theater
app.put('/api/theaters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location } = req.body;
    const query = 'UPDATE theaters SET name = $1, location = $2 WHERE id = $3 RETURNING *';
    const result = await pool.query(query, [name, location, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Theater not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a theater
app.delete('/api/theaters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM theaters WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Theater not found' });
    }
    res.json({ message: 'Theater deleted', theater: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AUDITORIUM MANAGEMENT ENDPOINTS

// Get all auditoriums (optionally filtered by theater)
app.get('/api/auditoriums', async (req, res) => {
  try {
    const { theater_id } = req.query;
    let query = `
      SELECT a.*, t.name as theater_name
      FROM auditoriums a
      JOIN theaters t ON a.theater_id = t.id
    `;
    let params = [];

    if (theater_id) {
      query += ' WHERE a.theater_id = $1';
      params.push(theater_id);
    }

    query += ' ORDER BY t.name, a.name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get auditoriums for a specific theater
app.get('/api/theaters/:theater_id/auditoriums', async (req, res) => {
  try {
    const { theater_id } = req.params;
    const query = 'SELECT * FROM auditoriums WHERE theater_id = $1 ORDER BY name';
    const result = await pool.query(query, [theater_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new auditorium
app.post('/api/auditoriums', async (req, res) => {
  try {
    const { theater_id, name, total_seats } = req.body;
    const query = `
      INSERT INTO auditoriums (theater_id, name, total_seats)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await pool.query(query, [theater_id, name, total_seats || 100]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update an auditorium
app.put('/api/auditoriums/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, total_seats } = req.body;
    const query = `
      UPDATE auditoriums
      SET name = $1, total_seats = $2
      WHERE id = $3
      RETURNING *
    `;
    const result = await pool.query(query, [name, total_seats, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Auditorium not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete an auditorium
app.delete('/api/auditoriums/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM auditoriums WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Auditorium not found' });
    }
    res.json({ message: 'Auditorium deleted', auditorium: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});