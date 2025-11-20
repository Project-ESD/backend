const fs = require('fs');
console.log('Script started');
const movieIds = [30, 31, 32, 33, 34, 35, 36];

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

const startDate = new Date('2025-11-21');
const days = 93;
const showtimes = ['12:00', '15:00', '18:00', '21:00'];

let sql = `-- Auto-generated schedules for all auditoriums in all theaters over ${days} days with multiple showtimes\n`;

for (let i = 0; i < days; i++) {
  const date = new Date(startDate);
  date.setDate(startDate.getDate() + i);
  const dateStr = date.toISOString().slice(0, 10);

  theaters.forEach(theater => {
    theater.auditoriums.forEach((aud, audIdx) => {
      // Track movies used for this auditorium on this day to avoid duplicates
      let usedMovies = new Set();
      showtimes.forEach((showtime, stIdx) => {
        // Find the next unused movie for this auditorium/day
        let movieOffset = 0;
        let movieId;
        do {
          movieId = movieIds[(i + audIdx + stIdx + movieOffset) % movieIds.length];
          movieOffset++;
        } while (usedMovies.has(movieId) && movieOffset < movieIds.length);
        usedMovies.add(movieId);

        sql += `INSERT INTO schedules (movie_id, showtime_date, showtime_time, theater, screen, available_seats, total_seats)\n`;
        sql += `VALUES (${movieId}, '${dateStr}', '${showtime}', '${theater.name}', '${aud.screen}', ${aud.seats}, ${aud.seats});\n\n`;
      });
    });
  });
}

fs.writeFileSync('schedules.sql', sql);

console.log('Generated schedules.sql with rotating movie schedule for all auditoriums and multiple showtimes.');