const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrateTheaters() {
  const client = await pool.connect();

  try {
    console.log('Starting theater migration...');

    // Create theaters table
    await client.query(`
      CREATE TABLE IF NOT EXISTS theaters (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        location VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Theaters table created');

    // Create auditoriums table
    await client.query(`
      CREATE TABLE IF NOT EXISTS auditoriums (
        id SERIAL PRIMARY KEY,
        theater_id INTEGER REFERENCES theaters(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        total_seats INTEGER NOT NULL DEFAULT 100,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(theater_id, name)
      );
    `);
    console.log('✓ Auditoriums table created');

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_auditoriums_theater ON auditoriums(theater_id);
    `);
    console.log('✓ Indexes created');

    // Migrate existing data from schedules table
    console.log('Migrating existing theater data from schedules...');

    // Get unique theaters from schedules
    const theatersResult = await client.query(`
      SELECT DISTINCT theater FROM schedules WHERE theater IS NOT NULL AND theater != ''
    `);

    for (const row of theatersResult.rows) {
      await client.query(`
        INSERT INTO theaters (name, location)
        VALUES ($1, 'Location TBD')
        ON CONFLICT (name) DO NOTHING
      `, [row.theater]);
    }
    console.log(`✓ Migrated ${theatersResult.rows.length} theaters`);

    // Get unique theater-screen combinations from schedules
    const auditoriumsResult = await client.query(`
      SELECT DISTINCT s.theater, s.screen, s.total_seats
      FROM schedules s
      WHERE s.theater IS NOT NULL AND s.theater != ''
        AND s.screen IS NOT NULL AND s.screen != ''
    `);

    for (const row of auditoriumsResult.rows) {
      // Get theater id
      const theaterResult = await client.query(
        'SELECT id FROM theaters WHERE name = $1',
        [row.theater]
      );

      if (theaterResult.rows.length > 0) {
        const theaterId = theaterResult.rows[0].id;
        await client.query(`
          INSERT INTO auditoriums (theater_id, name, total_seats)
          VALUES ($1, $2, $3)
          ON CONFLICT (theater_id, name) DO NOTHING
        `, [theaterId, row.screen, row.total_seats || 100]);
      }
    }
    console.log(`✓ Migrated ${auditoriumsResult.rows.length} auditoriums`);

    console.log('\n✅ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Review the migrated theaters and auditoriums in the admin panel');
    console.log('2. Add any missing theaters or auditoriums');
    console.log('3. Update locations for theaters as needed');

  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateTheaters().catch(console.error);
