-- Movies table
CREATE TABLE IF NOT EXISTS movies (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  genres TEXT[] NOT NULL,
  duration INTEGER NOT NULL, -- in minutes
  rating VARCHAR(10),
  language VARCHAR(50),
  description TEXT,
  poster_url TEXT,
  trailer_url TEXT,
  director VARCHAR(255),
  cast TEXT[],
  release_year INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schedules table
CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
  showtime_date DATE NOT NULL,
  showtime_time TIME NOT NULL,
  theater VARCHAR(255) NOT NULL,
  screen VARCHAR(100),
  available_seats INTEGER NOT NULL,
  total_seats INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(movie_id, showtime_date, showtime_time, theater, screen)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(showtime_date);
CREATE INDEX IF NOT EXISTS idx_schedules_movie ON schedules(movie_id);
CREATE INDEX IF NOT EXISTS idx_schedules_theater ON schedules(theater);
CREATE INDEX IF NOT EXISTS idx_schedules_date_theater ON schedules(showtime_date, theater);
CREATE INDEX IF NOT EXISTS idx_movies_genres ON movies USING GIN(genres);