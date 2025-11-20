const fs = require('fs');
console.log('Script started');
// Movie IDs (replace with your actual IDs if different)
const movieIds = [30, 31, 32, 33, 34, 35, 36];

// Theater and auditorium info
const theaters = [
  {
    name: 'Cinema Nova Oulu',
    auditoriums: [
      { screen: 'Auditorium 1', seats: 145 },
      { screen: 'Auditorium 2', seats: 87 },
      { screen: 'Auditorium 3', seats: 163 }
    ]
  },
  {
    name: 'Kino Baltic Turku',
    auditoriums: [
      { screen: 'Auditorium 1', seats: 192 },
      { screen: 'Auditorium 2', seats: 76 },
      { screen: 'Auditorium 3', seats: 134 },
      { screen: 'Auditorium 4', seats: 58 }
    ]
  },
  {
    name: 'Elokuvateatteri Helsinki Central',
    auditoriums: [
      { screen: 'Auditorium 1', seats: 178 },
      { screen: 'Auditorium 2', seats: 121 }
    ]
  }
];

// Date range (3 months)
const startDate = new Date('2025-11-21');
const days = 93;
const showtime = '18:00';

// Generate SQL
let sql = `-- Auto-generated schedules for all auditoriums in all theaters over 7 days\n`;

for (let i = 0; i < days; i++) {
  const date = new Date(startDate);
  date.setDate(startDate.getDate() + i);
  const dateStr = date.toISOString().slice(0, 10);

  theaters.forEach(theater => {
    theater.auditoriums.forEach((aud, idx) => {
      // Rotate movie for each auditorium and day
      const movieId = movieIds[(i + idx) % movieIds.length];
      sql += `INSERT INTO schedules (movie_id, showtime_date, showtime_time, theater, screen, available_seats, total_seats)\n`;
      sql += `VALUES (${movieId}, '${dateStr}', '${showtime}', '${theater.name}', '${aud.screen}', ${aud.seats}, ${aud.seats});\n\n`;
    });
  });
}

// Write to schedules.sql
fs.writeFileSync('schedules.sql', sql);

console.log('Generated schedules.sql with rotating movie schedule for all auditoriums.');