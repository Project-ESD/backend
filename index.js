const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { initDb } = require('./config/db-config');
const Stripe = require('stripe');
const stripe = new Stripe('sk_test_51SSD41I7jAP0ya485RmgXQVUKZhR3OA2UIX1CsJX5AZnt4iMgkSNrykJXBqXfBdCxulKXSZ48CZNfdajKF4b6bJS003htDuU29');

const app = express();
const port = process.env.PORT || 3000;

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  'https://kind-grass-0976a9210.3.azurestaticapps.net';

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

// BOOKING AND SEAT RESERVATION ENDPOINTS

// Get seat availability for a specific schedule
app.get('/api/schedules/:scheduleId/seats', async (req, res) => {
  try {
    const { scheduleId } = req.params;

    // Get all seats for this schedule's auditorium
    const schedule = await pool.query(
      `SELECT s.*,
              t.id as theater_id,
              a.id as auditorium_id
       FROM schedules s
       LEFT JOIN theaters t ON t.name = s.theater
       LEFT JOIN auditoriums a ON a.theater_id = t.id AND a.name = s.screen
       WHERE s.id = $1`,
      [scheduleId]
    );

    if (schedule.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const auditoriumId = schedule.rows[0].auditorium_id;

    // If no auditorium found or no seat layouts yet, return empty response
    if (!auditoriumId) {
      console.warn(`No auditorium found for schedule ${scheduleId}`);
      return res.json({ seats: [], layout: { rows: [], seatsPerRow: 0, totalSeats: 0 } });
    }

    // Get all seats in the auditorium
    const allSeats = await pool.query(
      'SELECT * FROM seat_layouts WHERE auditorium_id = $1 ORDER BY seat_row, seat_number',
      [auditoriumId]
    );

    // If no seats defined yet, return empty array
    if (allSeats.rows.length === 0) {
      console.warn(`No seats defined for auditorium ${auditoriumId}`);
      return res.json({ seats: [], layout: { rows: [], seatsPerRow: 0, totalSeats: 0 } });
    }

    // Calculate layout metadata
    const rows = [...new Set(allSeats.rows.map(s => s.seat_row))].sort();
    const seatsPerRow = Math.max(...allSeats.rows.map(s => s.seat_number));
    const totalSeats = allSeats.rows.length;

    // Get reserved/taken seats for this schedule
    // Join with bookings to check if payment was completed
    const reservedSeats = await pool.query(
      `SELECT sr.seat_row, sr.seat_number, sr.status, sr.reserved_until, b.payment_status
       FROM seat_reservations sr
       JOIN bookings b ON sr.booking_id = b.id
       WHERE sr.schedule_id = $1
       AND (sr.status = 'reserved' OR sr.status = 'confirmed')
       AND (b.payment_status = 'pending' OR b.payment_status = 'completed')`,
      [scheduleId]
    );

    const now = new Date();
    const seatMap = allSeats.rows.map(seat => {
      const reservation = reservedSeats.rows.find(
        r => r.seat_row === seat.seat_row && r.seat_number === seat.seat_number
      );

      let status = 'available';
      if (reservation) {
        // Seat is "taken" (red) only if BOTH seat_reservation AND booking payment are completed
        if (reservation.status === 'confirmed' && reservation.payment_status === 'completed') {
          status = 'taken';
        } else if (reservation.status === 'reserved' || reservation.payment_status === 'pending') {
          // Seat is "reserved" (orange) during checkout or if payment not completed
          const reservedUntil = new Date(reservation.reserved_until);
          if (reservedUntil > now) {
            status = 'reserved';
          } else {
            status = 'available'; // Expired reservation
          }
        }
      }

      return {
        row: seat.seat_row,
        number: seat.seat_number,
        status
      };
    });

    res.json({
      seats: seatMap,
      layout: {
        rows: rows,
        seatsPerRow: seatsPerRow,
        totalSeats: totalSeats
      }
    });
  } catch (err) {
    console.error('Error fetching seats:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create booking with seat reservation
app.post('/api/create-booking', async (req, res) => {
  const client = await pool.connect();
  try {
    const { scheduleId, movieId, email, seats } = req.body;

    if (!scheduleId || !movieId || !email || !seats || seats.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await client.query('BEGIN');

    // Get schedule and movie info
    const scheduleResult = await client.query('SELECT * FROM schedules WHERE id = $1', [scheduleId]);
    const movieResult = await client.query('SELECT * FROM movies WHERE id = $1', [movieId]);

    if (scheduleResult.rows.length === 0 || movieResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Movie or schedule not found' });
    }

    const schedule = scheduleResult.rows[0];
    const movie = movieResult.rows[0];

    // Check if seats are available
    for (const seat of seats) {
      const existing = await client.query(
        `SELECT * FROM seat_reservations
         WHERE schedule_id = $1
         AND seat_row = $2
         AND seat_number = $3
         AND (status = 'reserved' OR status = 'confirmed')
         AND (status = 'confirmed' OR reserved_until > NOW())`,
        [scheduleId, seat.row, seat.number]
      );

      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Seat ${seat.row}${seat.number} is already taken or reserved`
        });
      }
    }

    // Get ticket prices
    const pricesResult = await client.query('SELECT * FROM ticket_prices');
    const prices = {};
    pricesResult.rows.forEach(p => {
      prices[p.ticket_type] = parseFloat(p.price);
    });

    // Calculate total
    const totalAmount = seats.reduce((sum, seat) => {
      return sum + (prices[seat.ticketType] || 10);
    }, 0);

    // Create booking
    const bookingResult = await client.query(
      `INSERT INTO bookings (schedule_id, customer_email, total_amount, payment_status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [scheduleId, email, totalAmount]
    );

    const booking = bookingResult.rows[0];

    // Reserve seats (5 minutes from now)
    const reservedUntil = new Date(Date.now() + 5 * 60 * 1000);

    for (const seat of seats) {
      await client.query(
        `INSERT INTO seat_reservations
         (booking_id, schedule_id, seat_row, seat_number, ticket_type, price, status, reserved_until)
         VALUES ($1, $2, $3, $4, $5, $6, 'reserved', $7)`,
        [
          booking.id,
          scheduleId,
          seat.row,
          seat.number,
          seat.ticketType,
          prices[seat.ticketType] || 10,
          reservedUntil
        ]
      );
    }

    // Create Stripe checkout session
    const dateStr = schedule.showtime_date.toISOString
      ? schedule.showtime_date.toISOString().split('T')[0]
      : String(schedule.showtime_date).slice(0, 10);
    const timeStr = String(schedule.showtime_time).slice(0, 5);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: seats.map(seat => ({
        price_data: {
          currency: 'eur',
          product_data: {
            name: `${movie.title} - ${seat.ticketType === 'adult' ? 'Adult' : 'Child'} Ticket`,
            description: `Seat ${seat.row}${seat.number} • ${schedule.theater} • ${schedule.screen} • ${dateStr} ${timeStr}`
          },
          unit_amount: Math.round((prices[seat.ticketType] || 10) * 100)
        },
        quantity: 1
      })),
      success_url: `${FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&booking_id=${booking.id}`,
      cancel_url: `${FRONTEND_URL}/payment-cancel?booking_id=${booking.id}`,
      metadata: {
        booking_id: booking.id.toString(),
        schedule_id: scheduleId.toString()
      }
    });

    // Update booking with Stripe session ID
    await client.query(
      'UPDATE bookings SET stripe_session_id = $1 WHERE id = $2',
      [session.id, booking.id]
    );

    await client.query('COMMIT');

    res.json({
      bookingId: booking.id,
      checkoutUrl: session.url
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Unable to create booking: ' + err.message });
  } finally {
    client.release();
  }
});

// Cancel/expire reservation
app.post('/api/reservations/:bookingId/cancel', async (req, res) => {
  try {
    const { bookingId } = req.params;

    await pool.query(
      `UPDATE seat_reservations
       SET status = 'cancelled'
       WHERE booking_id = $1 AND status = 'reserved'`,
      [bookingId]
    );

    await pool.query(
      `UPDATE bookings
       SET payment_status = 'cancelled'
       WHERE id = $1`,
      [bookingId]
    );

    res.json({ message: 'Reservation cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clean up expired reservations (called by cron job or manually)
app.post('/api/reservations/cleanup', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE seat_reservations
       SET status = 'cancelled'
       WHERE status = 'reserved'
       AND reserved_until < NOW()
       RETURNING *`
    );

    // Also mark associated bookings as cancelled
    if (result.rows.length > 0) {
      const bookingIds = [...new Set(result.rows.map(r => r.booking_id))];
      await pool.query(
        `UPDATE bookings
         SET payment_status = 'cancelled'
         WHERE id = ANY($1) AND payment_status = 'pending'`,
        [bookingIds]
      );
    }

    res.json({
      message: 'Cleanup complete',
      expiredReservations: result.rows.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stripe webhook to confirm payment
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, 'whsec_your_webhook_secret_here');
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const bookingId = session.metadata.booking_id;

    try {
      // Confirm booking payment and seats
      await pool.query(
        `UPDATE bookings
         SET payment_status = 'completed', stripe_payment_intent = $1
         WHERE id = $2`,
        [session.payment_intent, bookingId]
      );

      await pool.query(
        `UPDATE seat_reservations
         SET status = 'confirmed'
         WHERE booking_id = $1`,
        [bookingId]
      );

      console.log(`Booking ${bookingId} confirmed - payment successful`);
    } catch (err) {
      console.error(`Error confirming booking ${bookingId}:`, err);
    }
  }

  res.json({ received: true });
});

// Get revenue data from the movie_revenue view
app.get('/api/revenue', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM movie_revenue ORDER BY showtime_date DESC, showtime_time DESC');
    res.json(result.rows);
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

// Automatic cleanup of expired reservations every minute
setInterval(async () => {
  try {
    const result = await pool.query(
      `UPDATE seat_reservations
       SET status = 'cancelled'
       WHERE status = 'reserved'
       AND reserved_until < NOW()
       RETURNING booking_id`
    );

    if (result.rows.length > 0) {
      const bookingIds = [...new Set(result.rows.map(r => r.booking_id))];
      await pool.query(
        `UPDATE bookings
         SET payment_status = 'cancelled'
         WHERE id = ANY($1) AND payment_status = 'pending'`,
        [bookingIds]
      );
      console.log(`[${new Date().toISOString()}] Cleaned up ${result.rows.length} expired reservations`);
    }
  } catch (err) {
    console.error('Auto-cleanup error:', err);
  }
}, 60000); // Run every 60 seconds

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log('Automatic seat reservation cleanup enabled (every 60 seconds)');
});