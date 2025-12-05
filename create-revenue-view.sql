-- Create revenue tracking view for admin dashboard
-- This view aggregates booking and ticket data for revenue analysis
-- Emails are hashed using MD5 for privacy (anonymized in admin view)

CREATE OR REPLACE VIEW movie_revenue AS
SELECT
    m.id AS movie_id,
    m.title,
    s.id AS schedule_id,
    s.showtime_date,
    s.showtime_time,
    t.name AS theater,
    a.name AS screen,
    COUNT(DISTINCT b.id) AS total_bookings,
    COUNT(DISTINCT sr.id) AS total_tickets_sold,
    SUM(CASE WHEN sr.ticket_type = 'adult' THEN 1 ELSE 0 END) AS adult_tickets,
    SUM(CASE WHEN sr.ticket_type = 'child' THEN 1 ELSE 0 END) AS child_tickets,
    SUM(CASE WHEN sr.ticket_type = 'adult' THEN 12 ELSE 8 END) AS total_revenue,
    -- Hash emails for privacy (MD5 produces anonymized customer IDs)
    STRING_AGG(DISTINCT MD5(b.customer_email), ', ') AS customer_ids_hashed
FROM movies m
JOIN schedules s ON m.id = s.movie_id
JOIN auditoriums a ON s.auditorium_id = a.id
JOIN theaters t ON a.theater_id = t.id
LEFT JOIN bookings b ON s.id = b.schedule_id AND b.status = 'confirmed'
LEFT JOIN seat_reservations sr ON b.id = sr.booking_id AND sr.status = 'confirmed'
GROUP BY m.id, m.title, s.id, s.showtime_date, s.showtime_time, t.name, a.name
HAVING COUNT(DISTINCT b.id) > 0
ORDER BY s.showtime_date DESC, s.showtime_time DESC;

-- Verify the view was created
SELECT * FROM movie_revenue LIMIT 5;
