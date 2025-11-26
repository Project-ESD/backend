-- Theaters table
CREATE TABLE IF NOT EXISTS theaters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  location VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Auditoriums table (screens/halls within theaters)
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
