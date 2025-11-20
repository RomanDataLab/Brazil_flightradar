# Flight Data Storage Setup

This project uses Vercel KV (Redis) for persistent storage of flight data. This allows the app to:
- Store all flight data on Vercel
- Update data incrementally after each API fetch
- Retrieve data when the API is unavailable

## Setup Instructions

### Option 1: Vercel KV (Recommended)

1. **Install Vercel KV:**
   ```bash
   npm install @vercel/kv
   ```

2. **Set up Vercel KV in your Vercel project:**
   - Go to your Vercel project dashboard
   - Navigate to Storage → Create Database → KV
   - Follow the setup instructions
   - Copy the environment variables to your project

3. **Add environment variables to Vercel:**
   - `KV_URL` - Your KV database URL
   - `KV_REST_API_URL` - KV REST API URL
   - `KV_REST_API_TOKEN` - KV REST API token
   - `KV_REST_API_READ_ONLY_TOKEN` - KV read-only token (optional)

4. **The API will automatically use KV once configured**

### Option 2: Upstash Redis (Alternative)

1. **Create a free Upstash Redis database:**
   - Go to https://upstash.com/
   - Create a new Redis database
   - Copy the REST API URL and token

2. **Install Upstash:**
   ```bash
   npm install @upstash/redis
   ```

3. **Update `api/flight-data.ts`** to use Upstash instead of Vercel KV

### Option 3: Static File (Current Fallback)

The app currently falls back to `public/flight-data-fallback.json` if KV is not configured.

**To update the static file:**
1. Export your flight data using `export-flight-data.html`
2. Replace `public/flight-data-fallback.json` with your exported data
3. Commit and push to GitHub

## How It Works

1. **Saving Data:**
   - After each successful API fetch, data is saved to:
     - LocalStorage (immediate, browser-only)
     - Vercel KV (persistent, shared across all users)

2. **Loading Data:**
   - First: Try LocalStorage cache
   - Second: Try Vercel KV storage
   - Third: Try static fallback file

3. **Incremental Updates:**
   - Each API fetch overwrites the previous data in KV
   - This ensures the most recent data is always available

## Testing

1. **Test locally:**
   ```bash
   npm run dev
   ```
   - Load the app and let it fetch flight data
   - Check browser console for "Saved X aircraft to Vercel storage"
   - Check Vercel function logs for successful saves

2. **Test on Vercel:**
   - Deploy to Vercel
   - Check function logs in Vercel dashboard
   - Verify data is being saved and retrieved

## Troubleshooting

- **"KV not configured" message:** Set up Vercel KV as described above
- **Data not persisting:** Check Vercel KV environment variables
- **Storage errors:** Verify KV database is active and accessible

