# Environment Variables Setup

## Local Development

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your actual values in `.env`:
   - `DB_HOST`: Your PostgreSQL database host
   - `DB_USER`: Database username
   - `DB_PASSWORD`: Database password
   - `DB_NAME`: Database name
   - `STRIPE_SECRET_KEY`: Your Stripe secret key (starts with `sk_test_` or `sk_live_`)
   - `STRIPE_WEBHOOK_SECRET`: Your Stripe webhook signing secret (starts with `whsec_`)

## Azure App Service Deployment

Set environment variables in Azure Portal:

1. Go to Azure Portal → Your App Service → Configuration → Application settings
2. Add the following environment variables:
   - `DB_HOST`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME`
   - `DB_PORT`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `PORT` (optional, defaults to 8080)
   - `FRONTEND_URL` (optional, your frontend URL)

3. Click "Save" and restart the App Service

## Getting Stripe Webhook Secret

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-backend-url.azurewebsites.net/api/webhook/stripe`
3. Select event: `checkout.session.completed`
4. Copy the webhook signing secret (starts with `whsec_`)
5. Add it to your environment variables

## Security Notes

- **NEVER** commit `.env` to git (it's already in `.gitignore`)
- Keep your Stripe keys secure
- Use test keys (`sk_test_`) for development
- Use live keys (`sk_live_`) only in production
