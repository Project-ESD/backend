# Movie Theater Booking System

Complete implementation of a cinema booking system with seat selection, reservations, and payment processing.

## Features Implemented

### 1. **Seat Selection & Visualization**
- Interactive seat map with color-coded status:
  - **Green**: Available seats
  - **Blue**: Your selected seats
  - **Orange**: Reserved by someone else (temporary)
  - **Red**: Taken/confirmed
- 8 rows (A-H) × 12 seats per row = 96 seats per auditorium
- Real-time seat availability updates every 5 seconds

### 2. **Ticket Types & Pricing**
- **Adult tickets**: €12.00
- **Child tickets**: €8.00
- Select ticket type before choosing seats
- Mixed bookings supported (e.g., 2 adults + 1 child)

### 3. **Temporary Seat Reservation**
- Seats are reserved for **5 minutes** when user enters checkout
- Prevents double-booking
- Automatically released if payment not completed
- Orange indicator shows seats temporarily held by others

### 4. **Payment Integration**
- Stripe Checkout integration
- Separate line items for each seat
- Email collection for ticket delivery
- Payment confirmation via webhook

### 5. **Automatic Cleanup**
- Background job runs every 60 seconds
- Cancels expired reservations (>5 minutes old)
- Frees up seats for other customers

## Database Schema

### New Tables Created

**bookings** - Stores customer booking information
- Tracks schedule_id, customer_email, total_amount
- Payment status: pending, completed, failed, cancelled
- Links to Stripe session and payment intent

**seat_reservations** - Individual seat reservations
- Links to booking and schedule
- Seat position (row, number)
- Ticket type (adult/child) and price
- Status: reserved, confirmed, cancelled
- Reserved until timestamp (5 min expiry)

**seat_layouts** - Physical seat configuration
- Defines available seats per auditorium
- Allows marking seats as unavailable (maintenance)

**ticket_prices** - Configurable pricing
- Currently: adult (€12), child (€8)

**movie_revenue** - View for revenue tracking
- Shows bookings, tickets sold, and revenue per movie/schedule

## API Endpoints

### Seat Management
```
GET /api/schedules/:scheduleId/seats
  → Returns seat map with availability status

POST /api/create-booking
  Body: { scheduleId, movieId, email, seats: [{ row, number, ticketType }] }
  → Creates booking, reserves seats, returns Stripe checkout URL

POST /api/reservations/:bookingId/cancel
  → Cancels a reservation and frees seats

POST /api/reservations/cleanup
  → Manual trigger for expired reservation cleanup
```

### Webhook
```
POST /api/webhook/stripe
  → Stripe webhook for payment confirmation
  → Converts 'reserved' seats to 'confirmed'
```

## Setup Instructions

### 1. Run Database Migrations

On your Azure VM (connected to the database):

```bash
# Run the booking system schema
psql -h esddb.postgres.database.azure.com -p 5432 -U own postgres
\i /home/own/movieback/backend/bookings-schema.sql

# Populate seat layouts for existing auditoriums
\i /home/own/movieback/backend/populate-seats.sql
```

### 2. Configure Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://esdbackend-gcfqacahh8ancvfx.swedencentral-01.azurewebsites.net/api/webhook/stripe`
3. Select event: `checkout.session.completed`
4. Copy webhook signing secret
5. Add to backend environment variables:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### 3. Deploy Backend

The backend at `/Users/eemelikarjalainen/movieback/backend/index.js` now includes:
- All booking endpoints
- Seat reservation logic
- Automatic cleanup interval
- Stripe payment processing

Deploy this to Azure App Service.

### 4. Deploy Frontend

The customer frontend at `/Users/eemelikarjalainen/CustomerView/vitereact` now includes:
- `src/components/SeatMap.tsx` - Visual seat selector
- `src/pages/TicketCheckout.tsx` - Complete booking flow
- Adult/child ticket selection
- Email input
- Real-time seat updates

Deploy to Azure Static Web Apps.

## User Flow

1. **Browse Movies** - Customer sees movie schedules on home page
2. **Click "Buy Ticket"** - Redirects to checkout page
3. **Select Ticket Type** - Choose adult or child
4. **Choose Seats** - Click on green seats to select
5. **Enter Email** - For ticket confirmation
6. **Pay** - Redirected to Stripe checkout
7. **Confirmation** - Seats confirmed, email sent (via Stripe)

## Security Features

### Double Booking Prevention
- Database unique constraint on (schedule_id, seat_row, seat_number, status)
- Transaction-based seat checking before reservation
- Real-time validation during booking creation

### Reservation Expiry
- 5-minute timeout on seat holds
- Automatic cleanup every 60 seconds
- Expired reservations freed for others

### Payment Verification
- Webhook signature validation
- Only confirmed payments convert reservations to bookings
- Cancelled payments automatically release seats

## Revenue Tracking

Query the `movie_revenue` view for admin dashboard:

```sql
SELECT * FROM movie_revenue
WHERE showtime_date >= CURRENT_DATE
ORDER BY total_revenue DESC;
```

Shows:
- Total bookings per schedule
- Tickets sold (adult vs child breakdown)
- Total revenue per movie
- Revenue per showtime

## Files Created

### Backend
- `backend/bookings-schema.sql` - Database schema
- `backend/populate-seats.sql` - Seat layout population
- `backend/cleanup-cron.js` - External cron job script (optional)
- `backend/index.js` - Updated with booking endpoints

### Frontend
- `vitereact/src/components/SeatMap.tsx` - Seat visualization
- `vitereact/src/pages/TicketCheckout.tsx` - Complete booking flow
- `vitereact/src/App.tsx` - Added checkout route

## Testing

### Test the Booking Flow
1. Navigate to customer view
2. Click "Buy ticket" on any movie
3. Select seats and ticket types
4. Use Stripe test card: `4242 4242 4242 4242`
5. Any future expiry, any CVC

### Test Reservation Timeout
1. Start booking but don't complete payment
2. Wait 5 minutes
3. Check seat becomes available again (orange → green)

### Test Double Booking Prevention
1. Open two browser windows
2. Try to book same seat simultaneously
3. Second request should fail with "seat already taken" error

## Next Steps (Optional Enhancements)

- [ ] Email notifications after successful booking
- [ ] QR code ticket generation
- [ ] Admin dashboard for revenue analytics
- [ ] Seat selection preferences (aisle, center, etc.)
- [ ] Group booking discounts
- [ ] Refund/cancellation workflow
