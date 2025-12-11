require('dotenv').config();
console.log("DATABASE_URL loaded:", process.env.DATABASE_URL);
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { initDb } = require('./config/db-config');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');

// Stripe secret key 
const stripe = new Stripe('sk_test_51SSD41I7jAP0ya485RmgXQVUKZhR3OA2UIX1CsJX5AZnt4iMgkSNrykJXBqXfBdCxulKXSZ48CZNfdajKF4b6bJS003htDuU29');

const app = express();
const port = process.env.PORT || 3000;

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  'https://kind-grass-0976a9210.3.azurestaticapps.net';

// Email / SMTP config
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT || 465),
  secure: String(process.env.EMAIL_SECURE).toLowerCase() === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Simple helper to send booking confirmation email
async function sendBookingConfirmationEmail(booking, schedule, movie) {
  if (!booking || !booking.customer_email) {
    console.error('No customer email found for booking', booking && booking.id);
    return;
  }

  const dateStr = schedule.showtime_date.toISOString
    ? schedule.showtime_date.toISOString().split('T')[0]
    : String(schedule.showtime_date).slice(0, 10);
  const timeStr = String(schedule.showtime_time).slice(0, 5);

  const fromEmail = process.env.FROM_EMAIL || process.env.EMAIL_USER;

  const mailOptions = {
    from: fromEmail,
    to: booking.customer_email,
    subject: `Your ticket is confirmed – Booking #${booking.id}`,
    text: `
Thank you for your purchase!

Booking details:
- Movie: ${movie.title}
- Date: ${dateStr}
- Time: ${timeStr}
- Theater: ${schedule.theater}
- Screen: ${schedule.screen}
- Total paid: €${booking.total_amount}

Your booking ID is: ${booking.id}

Please arrive at the cinema a bit early and show this email at the counter.

Best regards,
Northstar Tickets
    `.trim()
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Confirmation email sent to ${booking.customer_email} for booking ${booking.id}`);
  } catch (err) {
    console.error('Error sending confirmation email:', err);
  }
}

const allowedOrigins = [
  'https://mango-forest-09c515d10.3.azurestaticapps.net',
  'https://kind-grass-0976a9210.3.azurestaticapps.net',
  'http://localhost:5173'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 1) STRIPE WEBHOOK ROUTE – must be before express.json()
app.post(
  '/api/webhook/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const bookingId = session.metadata && session.metadata.booking_id;

      try {
        // Mark booking as paid
        const bookingResult = await pool.query(
          `UPDATE bookings
           SET payment_status = 'completed', stripe_payment_intent = $1
           WHERE id = $2
           RETURNING *`,
          [session.payment_intent, bookingId]
        );

        const booking = bookingResult.rows[0];

        // Confirm seat reservations
        await pool.query(
          `UPDATE seat_reservations
           SET status = 'confirmed'
           WHERE booking_id = $1`,
          [bookingId]
        );

        console.log(`Booking ${bookingId} confirmed - payment successful`);

        // Load schedule + movie info for the email
        if (booking) {
          const schedAndMovie = await pool.query(
            `SELECT s.*, m.*
             FROM schedules s
             JOIN movies m ON s.movie_id = m.id
             WHERE s.id = $1`,
            [booking.schedule_id]
          );

          if (schedAndMovie.rows.length > 0) {
            const row = schedAndMovie.rows[0];
            const schedule = {
              showtime_date: row.showtime_date,
              showtime_time: row.showtime_time,
              theater: row.theater,
              screen: row.screen
            };
            const movie = {
              title: row.title
            };

            // Send confirmation email
            await sendBookingConfirmationEmail(booking, schedule, movie);
          } else {
            console.warn('No schedule/movie found for booking', bookingId);
          }
        }
      } catch (err) {
        console.error(`Error confirming booking ${bookingId}:`, err);
      }
    }

    res.json({ received: true });
  }
);

// 2) JSON body parser for all other routes
app.use(express.json());

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

// Create Stripe Checkout Session for ticket purchase (simple)
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { scheduleId, movieId, quantity, pricePerTicket } = req.body;

    if (!scheduleId || !movieId || !quantity || !pricePerTicket) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const movieResult = await pool.query('SELECT * FROM movies WHERE id = $1', [movieId]);
    const scheduleResult = await pool.query('SELECT * FROM schedules WHERE id = $1', [scheduleId]);

    if (movieResult.rows.length === 0 || scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Movie or schedule not found.' });
    }

    const movie = movieResult.rows[0];
    const schedule = scheduleResult.rows[0];

    if (quantity > schedule.available_seats) {
      return res.status(400).json({ error: 'Not enough available seats.' });
    }

    const unitAmountCents = Math.round(Number(pricePerTicket) * 100);

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
            currency: 'eur',
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

// The rest of your routes stay exactly the same as before.
// I am keeping them unchanged, only pasted below so you have one full file.

app.get('/api/schedules/:scheduleId/seats', async (req, res) => {
  try {
    const { scheduleId } = req.params;

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

    if (!auditoriumId) {
      console.warn(`No auditorium found for schedule ${scheduleId}`);
      return res.json({ seats: [], layout: { rows: [], seatsPerRow: 0, totalSeats: 0 } });
    }

    const allSeats = await pool.query(
      'SELECT * FROM seat_layouts WHERE auditorium_id = $1 ORDER BY seat_row, seat_number',
      [auditoriumId]
    );

    if (allSeats.rows.length === 0) {
      console.warn(`No seats defined for auditorium ${auditoriumId}`);
      return res.json({ seats: [], layout: { rows: [], seatsPerRow: 0, totalSeats: 0 } });
    }

    const rows = [...new Set(allSeats.rows.map(s => s.seat_row))].sort();
    const seatsPerRow = Math.max(...allSeats.rows.map(s => s.seat_number));
    const totalSeats = allSeats.rows.length;

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
        if (reservation.status === 'confirmed' && reservation.payment_status === 'completed') {
          status = 'taken';
        } else if (reservation.status === 'reserved' || reservation.payment_status === 'pending') {
          const reservedUntil = new Date(reservation.reserved_until);
          if (reservedUntil > now) {
            status = 'reserved';
          } else {
            status = 'available';
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

app.post('/api/create-booking', async (req, res) => {
  const client = await pool.connect();
  try {
    const { scheduleId, movieId, email, seats } = req.body;

    if (!scheduleId || !movieId || !email || !seats || seats.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await client.query('BEGIN');

    const scheduleResult = await client.query('SELECT * FROM schedules WHERE id = $1', [scheduleId]);
    const movieResult = await client.query('SELECT * FROM movies WHERE id = $1', [movieId]);

    if (scheduleResult.rows.length === 0 || movieResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Movie or schedule not found' });
    }

    const schedule = scheduleResult.rows[0];
    const movie = movieResult.rows[0];

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

    const pricesResult = await client.query('SELECT * FROM ticket_prices');
    const prices = {};
    pricesResult.rows.forEach(p => {
      prices[p.ticket_type] = parseFloat(p.price);
    });

    const totalAmount = seats.reduce((sum, seat) => {
      return sum + (prices[seat.ticketType] || 10);
    }, 0);

    const bookingResult = await client.query(
      `INSERT INTO bookings (schedule_id, customer_email, total_amount, payment_status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [scheduleId, email, totalAmount]
    );

    const booking = bookingResult.rows[0];

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

app.post('/api/reservations/cleanup', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE seat_reservations
       SET status = 'cancelled'
       WHERE status = 'reserved'
       AND reserved_until < NOW()
       RETURNING *`
    );

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
    event = stripe.webhooks.constructEvent(req.body, sig, 'whsec_R96uN180Rvgv32UYmUjkXK4pF50sggLI');
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

app.get('/api/movies', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM movies');
  res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

app.get('/api/schedules/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query('SELECT * FROM schedules WHERE showtime_date = $1', [today]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

app.get('/api/admin/schedules', async (req, res) => {
  const result = await pool.query('SELECT * FROM schedules ORDER BY showtime_date, showtime_time');
  res.json(result.rows);
});

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

app.delete('/api/admin/schedules/:id', async (req, res) => {
  await pool.query('DELETE FROM schedules WHERE id=$1', [req.params.id]);
  res.sendStatus(200);
});

app.get('/api/theaters', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM theaters ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
}, 60000);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log('Automatic seat reservation cleanup enabled (every 60 seconds)');
});
