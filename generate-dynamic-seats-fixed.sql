-- Dynamic Seat Generation Based on Auditorium Capacity
-- This script generates seat layouts that match the actual auditorium capacities

-- STEP 1: Update auditorium capacities to match your theater data (MUST BE DONE FIRST)
UPDATE auditoriums SET total_seats = 145 WHERE id = (SELECT a.id FROM auditoriums a JOIN theaters t ON a.theater_id = t.id WHERE t.name = 'Cinema Nova Oulu' AND a.name = 'Auditorium 1');
UPDATE auditoriums SET total_seats = 87 WHERE id = (SELECT a.id FROM auditoriums a JOIN theaters t ON a.theater_id = t.id WHERE t.name = 'Cinema Nova Oulu' AND a.name = 'Auditorium 2');
UPDATE auditoriums SET total_seats = 163 WHERE id = (SELECT a.id FROM auditoriums a JOIN theaters t ON a.theater_id = t.id WHERE t.name = 'Cinema Nova Oulu' AND a.name = 'Auditorium 3');

UPDATE auditoriums SET total_seats = 192 WHERE id = (SELECT a.id FROM auditoriums a JOIN theaters t ON a.theater_id = t.id WHERE t.name = 'Kino Baltic Turku' AND a.name = 'Auditorium 1');
UPDATE auditoriums SET total_seats = 76 WHERE id = (SELECT a.id FROM auditoriums a JOIN theaters t ON a.theater_id = t.id WHERE t.name = 'Kino Baltic Turku' AND a.name = 'Auditorium 2');
UPDATE auditoriums SET total_seats = 134 WHERE id = (SELECT a.id FROM auditoriums a JOIN theaters t ON a.theater_id = t.id WHERE t.name = 'Kino Baltic Turku' AND a.name = 'Auditorium 3');
UPDATE auditoriums SET total_seats = 58 WHERE id = (SELECT a.id FROM auditoriums a JOIN theaters t ON a.theater_id = t.id WHERE t.name = 'Kino Baltic Turku' AND a.name = 'Auditorium 4');

UPDATE auditoriums SET total_seats = 178 WHERE id = (SELECT a.id FROM auditoriums a JOIN theaters t ON a.theater_id = t.id WHERE t.name = 'Elokuvateatteri Helsinki Central' AND a.name = 'Auditorium 1');
UPDATE auditoriums SET total_seats = 121 WHERE id = (SELECT a.id FROM auditoriums a JOIN theaters t ON a.theater_id = t.id WHERE t.name = 'Elokuvateatteri Helsinki Central' AND a.name = 'Auditorium 2');

-- STEP 2: Clear existing seats (now that capacities are updated)
DELETE FROM seat_layouts;

-- STEP 3: Generate new seat layouts based on updated capacities
DO $$
DECLARE
    aud RECORD;
    v_total_seats INT;
    num_rows INT;
    seats_per_row INT;
    remaining_seats INT;
    current_row VARCHAR(5);
    row_letters VARCHAR[] := ARRAY['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];
    seat_num INT;
BEGIN
    FOR aud IN SELECT id, total_seats FROM auditoriums LOOP
        v_total_seats := aud.total_seats;

        num_rows := GREATEST(CEIL(SQRT(v_total_seats / 1.5)), 1);
        seats_per_row := CEIL(v_total_seats::NUMERIC / num_rows);

        IF num_rows > 20 THEN
            num_rows := 20;
            seats_per_row := CEIL(v_total_seats::NUMERIC / num_rows);
        END IF;

        remaining_seats := v_total_seats;

        FOR row_idx IN 1..num_rows LOOP
            current_row := row_letters[row_idx];

            FOR seat_num IN 1..LEAST(seats_per_row, remaining_seats) LOOP
                INSERT INTO seat_layouts (auditorium_id, seat_row, seat_number, is_available)
                VALUES (aud.id, current_row, seat_num, true);
                remaining_seats := remaining_seats - 1;
            END LOOP;

            EXIT WHEN remaining_seats <= 0;
        END LOOP;

        RAISE NOTICE 'Auditorium %: % seats arranged in % rows with ~% seats per row',
            aud.id, v_total_seats, num_rows, seats_per_row;
    END LOOP;
END $$;

-- STEP 4: Verify the results
SELECT
    t.name as theater,
    a.name as auditorium,
    a.total_seats as capacity,
    COUNT(sl.id) as seats_generated,
    COUNT(DISTINCT sl.seat_row) as num_rows,
    MAX((SELECT COUNT(*) FROM seat_layouts WHERE auditorium_id = a.id AND seat_row = 'A')) as seats_in_row_a
FROM theaters t
JOIN auditoriums a ON t.id = a.theater_id
LEFT JOIN seat_layouts sl ON a.id = sl.auditorium_id
GROUP BY t.id, t.name, a.id, a.name, a.total_seats
ORDER BY t.name, a.name;
