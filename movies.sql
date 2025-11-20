INSERT INTO movies (title, genres, duration, rating, language, description, poster_url, trailer_url, director, "cast", release_year)
VALUES (
  'Inception',
  ARRAY['Action', 'Sci-Fi'],
  148,
  'PG-13',
  'English',
  'A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea into the mind of a CEO.',
  'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_FMjpg_UX1000_.jpg',
  'https://youtube.com/inceptiontrailer',
  'Christopher Nolan',
  ARRAY['Leonardo DiCaprio', 'Joseph Gordon-Levitt'],
  2010
);
INSERT INTO movies (title, genres, duration, rating, language, description, poster_url, trailer_url, director, "cast", release_year)
VALUES (
  'Iron Man',
  ARRAY['Action', 'Adventure', 'Sci-Fi'],
  126,
  'PG-13',
  'English',
  'After being held captive in an Afghan cave, billionaire engineer Tony Stark creates a unique weaponized suit of armor to fight evil.',
  'https://m.media-amazon.com/images/M/MV5BMTczNTI2ODUwOF5BMl5BanBnXkFtZTcwMTU0NTIzMw@@._V1_FMjpg_UX1000_.jpg',
  'https://youtube.com/ironmantrailer',
  'Jon Favreau',
  ARRAY['Robert Downey Jr.', 'Gwyneth Paltrow', 'Terrence Howard'],
  2008
);

INSERT INTO movies (title, genres, duration, rating, language, description, poster_url, trailer_url, director, "cast", release_year)
VALUES (
  'Batman Begins',
  ARRAY['Action', 'Adventure'],
  140,
  'PG-13',
  'English',
  'After training with his mentor, Batman begins his fight to free crime-ridden Gotham City from corruption.',
  'https://m.media-amazon.com/images/M/MV5BMzA2NDQzZDEtNDU5Ni00YTlkLTg2OWEtYmQwM2Y1YTBjMjFjXkEyXkFqcGc@._V1_.jpg',
  'https://youtube.com/batmanbeginstrailer',
  'Christopher Nolan',
  ARRAY['Christian Bale', 'Michael Caine', 'Liam Neeson'],
  2005
);
INSERT INTO movies (title, genres, duration, rating, language, description, poster_url, trailer_url, director, "cast", release_year)
VALUES (
  'Iron Man 2',
  ARRAY['Action', 'Adventure', 'Sci-Fi'],
  124,
  'PG-13',
  'English',
  'With the world now aware of his identity as Iron Man, Tony Stark must contend with both his declining health and a vengeful madman with ties to his father''s legacy.',
  'https://m.media-amazon.com/images/M/MV5BYWYyOGQzOGYtMGQ1My00ZWYxLTgzZjktZWYzN2IwYjkxYzM0XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg',
  'https://youtube.com/ironman2trailer',
  'Jon Favreau',
  ARRAY['Robert Downey Jr.', 'Gwyneth Paltrow', 'Don Cheadle', 'Scarlett Johansson'],
  2010
);

INSERT INTO movies (title, genres, duration, rating, language, description, poster_url, trailer_url, director, "cast", release_year)
VALUES (
  'Casino Royale',
  ARRAY['Action', 'Adventure', 'Thriller'],
  144,
  'PG-13',
  'English',
  'After earning his 00 status, James Bond heads to Madagascar, where he uncovers a link to Le Chiffre, a man who finances terrorist organizations.',
  'https://m.media-amazon.com/images/M/MV5BMWQ1ZDM4NDktMWY0NC00MjcxLWJlMDMtNmE2MGVhYzRjMWQ0XkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg',
  'https://youtube.com/casinoroyaletrailer',
  'Martin Campbell',
  ARRAY['Daniel Craig', 'Eva Green', 'Mads Mikkelsen', 'Judi Dench'],
  2006
  );

INSERT INTO movies (title, genres, duration, rating, language, description, poster_url, trailer_url, director, "cast", release_year)
VALUES (
  'The Dark Knight',
  ARRAY['Action', 'Crime', 'Drama'],
  152,
  'PG-13',
  'English',
  'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.',
  'https://m.media-amazon.com/images/M/MV5BMTMxNTMwODM0NF5BMl5BanBnXkFtZTcwODAyMTk2Mw@@._V1_FMjpg_UX1000_.jpg',
  'https://youtube.com/thedarkknighttrailer',
  'Christopher Nolan',
  ARRAY['Christian Bale', 'Heath Ledger', 'Aaron Eckhart'],
  2008
);

INSERT INTO movies (title, genres, duration, rating, language, description, poster_url, trailer_url, director, "cast", release_year)
VALUES (
  'The Batman',
  ARRAY['Action', 'Crime', 'Drama'],
  176,
  'PG-13',
  'English',
  'When a sadistic serial killer begins murdering key political figures in Gotham, Batman is forced to investigate the city''s hidden corruption and question his family''s involvement.',
  'https://m.media-amazon.com/images/M/MV5BMmU5NGJlMzAtMGNmOC00YjJjLTgyMzUtNjAyYmE4Njg5YWMyXkEyXkFqcGc@._V1_.jpg',
  'https://youtube.com/thebatman2022trailer',
  'Matt Reeves',
  ARRAY['Robert Pattinson', 'Zoë Kravitz', 'Jeffrey Wright', 'Colin Farrell'],
  2022
);

-- Casino Royale (movie_id 5) on 2025-11-21

-- Cinema Nova Oulu, Auditorium 1 (145 seats)
INSERT INTO schedules (movie_id, showtime_date, showtime_time, theater, screen, available_seats, total_seats)
VALUES
  (5, '2025-11-21', '18:30', 'Cinema Nova Oulu', 'Auditorium 1', 145, 145),
  (5, '2025-11-21', '14:00', 'Cinema Nova Oulu', 'Auditorium 1', 145, 145);

-- Kino Baltic Turku, Auditorium 3 (134 seats)
INSERT INTO schedules (movie_id, showtime_date, showtime_time, theater, screen, available_seats, total_seats)
VALUES
  (5, '2025-11-21', '18:30', 'Kino Baltic Turku', 'Auditorium 3', 134, 134),
    (5, '2025-11-21', '14:00', 'Kino Baltic Turku', 'Auditorium 3', 134, 134);