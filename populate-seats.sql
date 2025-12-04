-- Script to populate seat layouts for all existing auditoriums
-- Creates a standard 8x12 seat layout (rows A-H, seats 1-12)

-- Insert seats for all auditoriums
INSERT INTO seat_layouts (auditorium_id, seat_row, seat_number)
SELECT
  a.id as auditorium_id,
  row_letter,
  seat_num
FROM auditoriums a
CROSS JOIN (
  SELECT unnest(ARRAY['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) as row_letter
) rows
CROSS JOIN (
  SELECT generate_series(1, 12) as seat_num
) seats
ON CONFLICT (auditorium_id, seat_row, seat_number) DO NOTHING;

-- Verify the seats were created
SELECT
  t.name as theater,
  a.name as auditorium,
  COUNT(sl.id) as total_seats
FROM theaters t
JOIN auditoriums a ON t.id = a.theater_id
LEFT JOIN seat_layouts sl ON a.id = sl.auditorium_id
GROUP BY t.id, t.name, a.id, a.name
ORDER BY t.name, a.name;
