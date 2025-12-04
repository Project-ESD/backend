-- Bookings and Seat Reservation System Schema

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  customer_email VARCHAR(255) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  payment_status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed, cancelled
  stripe_session_id VARCHAR(255),
  stripe_payment_intent VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create seat_reservations table
CREATE TABLE IF NOT EXISTS seat_reservations (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  seat_row VARCHAR(5) NOT NULL,
  seat_number INTEGER NOT NULL,
  ticket_type VARCHAR(20) NOT NULL, -- 'adult' or 'child'
  price DECIMAL(10, 2) NOT NULL,
  status VARCHAR(20) DEFAULT 'reserved', -- reserved, confirmed, cancelled
  reserved_until TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, seat_row, seat_number, status) -- Prevent double booking of same seat
);

-- Create seat_layouts table (defines theater auditorium seating configuration)
CREATE TABLE IF NOT EXISTS seat_layouts (
  id SERIAL PRIMARY KEY,
  auditorium_id INTEGER NOT NULL REFERENCES auditoriums(id) ON DELETE CASCADE,
  seat_row VARCHAR(5) NOT NULL,
  seat_number INTEGER NOT NULL,
  is_available BOOLEAN DEFAULT true, -- for maintenance/broken seats
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(auditorium_id, seat_row, seat_number)
);

-- Create ticket_prices table
CREATE TABLE IF NOT EXISTS ticket_prices (
  id SERIAL PRIMARY KEY,
  ticket_type VARCHAR(20) NOT NULL UNIQUE, -- 'adult' or 'child'
  price DECIMAL(10, 2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default ticket prices
INSERT INTO ticket_prices (ticket_type, price, description) VALUES
  ('adult', 12.00, 'Standard adult ticket'),
  ('child', 8.00, 'Child ticket (under 12 years)')
ON CONFLICT (ticket_type) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_schedule ON bookings(schedule_id);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(customer_email);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_seat_reservations_schedule ON seat_reservations(schedule_id);
CREATE INDEX IF NOT EXISTS idx_seat_reservations_booking ON seat_reservations(booking_id);
CREATE INDEX IF NOT EXISTS idx_seat_reservations_status ON seat_reservations(status);
CREATE INDEX IF NOT EXISTS idx_seat_reservations_expires ON seat_reservations(reserved_until);
CREATE INDEX IF NOT EXISTS idx_seat_layouts_auditorium ON seat_layouts(auditorium_id);

-- Create a view for easy revenue tracking per movie
CREATE OR REPLACE VIEW movie_revenue AS
SELECT
  m.id as movie_id,
  m.title,
  s.id as schedule_id,
  s.showtime_date,
  s.showtime_time,
  s.theater,
  s.screen,
  COUNT(DISTINCT b.id) as total_bookings,
  COUNT(sr.id) as total_tickets_sold,
  SUM(CASE WHEN sr.ticket_type = 'adult' THEN 1 ELSE 0 END) as adult_tickets,
  SUM(CASE WHEN sr.ticket_type = 'child' THEN 1 ELSE 0 END) as child_tickets,
  SUM(sr.price) as total_revenue
FROM movies m
JOIN schedules s ON m.id = s.movie_id
LEFT JOIN bookings b ON s.id = b.schedule_id AND b.payment_status = 'completed'
LEFT JOIN seat_reservations sr ON b.id = sr.booking_id AND sr.status = 'confirmed'
GROUP BY m.id, m.title, s.id, s.showtime_date, s.showtime_time, s.theater, s.screen
ORDER BY s.showtime_date DESC, s.showtime_time DESC;
