// Cron job to clean up expired seat reservations
// Run this every minute using a cron scheduler or Azure Functions Timer Trigger

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function cleanupExpiredReservations() {
  try {
    console.log(`[${new Date().toISOString()}] Running cleanup...`);

    const response = await axios.post(`${API_URL}/api/reservations/cleanup`);

    console.log(`[${new Date().toISOString()}] Cleanup complete:`, response.data);

    if (response.data.expiredReservations > 0) {
      console.log(`  → Cancelled ${response.data.expiredReservations} expired reservations`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Cleanup error:`, error.message);
  }
}

// If run directly (not imported)
if (require.main === module) {
  cleanupExpiredReservations()
    .then(() => {
      console.log('Cleanup job finished');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Cleanup job failed:', err);
      process.exit(1);
    });
}

module.exports = { cleanupExpiredReservations };
