-- Complete Theater Migration Script
-- Creates tables and migrates existing data from schedules

-- Create theaters table
CREATE TABLE IF NOT EXISTS theaters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  location VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create auditoriums table
CREATE TABLE IF NOT EXISTS auditoriums (
  id SERIAL PRIMARY KEY,
  theater_id INTEGER REFERENCES theaters(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  total_seats INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(theater_id, name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_auditoriums_theater ON auditoriums(theater_id);

-- Migrate existing theaters from schedules table
INSERT INTO theaters (name, location)
SELECT DISTINCT theater, 'Location TBD'
FROM schedules
WHERE theater IS NOT NULL AND theater != ''
ON CONFLICT (name) DO NOTHING;

-- Migrate existing auditoriums from schedules table
INSERT INTO auditoriums (theater_id, name, total_seats)
SELECT t.id, s.screen, COALESCE(s.total_seats, 100)
FROM (
  SELECT DISTINCT theater, screen, total_seats
  FROM schedules
  WHERE theater IS NOT NULL AND theater != ''
    AND screen IS NOT NULL AND screen != ''
) s
JOIN theaters t ON t.name = s.theater
ON CONFLICT (theater_id, name) DO NOTHING;

-- Show results
SELECT 'Theaters created:' as info, COUNT(*) as count FROM theaters
UNION ALL
SELECT 'Auditoriums created:' as info, COUNT(*) as count FROM auditoriums;
