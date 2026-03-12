# Brazil Flight Tracker

Real-time flight tracking visualization over Brazil. Shows live aircraft positions on a dark 3D map with airport markers, airline data, and interactive tooltips.

Live: aircraft positions update every 5 minutes via OpenSky Network ADS-B data.

---

## Architecture

```
Browser (React + deck.gl + MapLibre)
  |
  |  GET /api/opensky/states/all?lamin=...&lomin=...
  v
Vercel Serverless Proxy (api/opensky/[...path].ts)
  |
  |  Injects OPENSKY_USERNAME/PASSWORD from env vars
  v
OpenSky Network REST API (opensky-network.org/api)
  |
  v
Flight state vectors (ICAO24, lat, lon, altitude, heading, speed)
  |
  v
Browser renders on deck.gl IconLayer
```

### Key Components

| File | Role |
|------|------|
| `src/app.tsx` | Main React component — map, layers, API key modal, data fetching loop |
| `src/api/opensky.ts` | OpenSky API client — builds bounding-box query, filters airborne aircraft |
| `src/utils/storage.ts` | IndexedDB-based cache (up to 10GB) with rate-limit awareness and multi-tier fallback |
| `src/utils/credentials.ts` | In-memory credential store — never persisted to disk or bundled in JS |
| `src/utils/airports.ts` | Fetches Brazil airports from OpenFlights dataset, cached 7 days in localStorage |
| `src/utils/airlines.ts` | Fetches Brazil airlines from OpenFlights dataset, cached 7 days in localStorage |
| `api/opensky/[...path].ts` | Vercel serverless proxy — forwards requests to OpenSky with server-side credentials |
| `api/flight-data.ts` | Vercel serverless function — stores/retrieves flight data in Vercel KV (optional) |
| `vercel.json` | Vercel build/deploy configuration |
| `vite.config.js` | Vite dev server with proxy to OpenSky (local development) |

### Data Flow

1. On page load, the app checks IndexedDB for cached flight data
2. If no cache exists, an API key modal is shown (user enters OpenSky credentials or skips)
3. Credentials are held in memory only and sent to `/api/opensky/...` (our proxy)
4. The Vercel serverless proxy injects server-side `OPENSKY_USERNAME`/`OPENSKY_PASSWORD` env vars (or forwards the user-provided header)
5. OpenSky returns state vectors for the Brazil bounding box
6. Valid airborne aircraft are filtered and rendered as rotated airplane icons on deck.gl
7. Data is cached in IndexedDB; on API failure, fallback chain: IndexedDB -> Vercel KV -> static JSON

### Caching Strategy

| Layer | Storage | TTL | Purpose |
|-------|---------|-----|---------|
| IndexedDB | Browser (up to 10GB) | 5 min (24h if rate-limited) | Primary flight data cache |
| Vercel KV | Server-side Redis | Until overwritten | Shared cache across all users |
| Static JSON | `public/flight-data-fallback.json` | Permanent | Last-resort demo data |
| localStorage | Browser (5MB) | 7 days | Airport & airline reference data |

When the OpenSky API returns HTTP 429 (rate limit), the app records the event and serves cached data for 24 hours without making further API calls.

---

## APIs Used

### OpenSky Network (primary data source)
- **Endpoint**: `https://opensky-network.org/api/states/all`
- **Auth**: HTTP Basic (username/password) — optional but recommended
- **Rate limits**: Anonymous: ~400 req/day, 10 req/10s. Authenticated: significantly higher
- **Data**: Real-time ADS-B aircraft positions (ICAO24, callsign, lat, lon, altitude, heading, velocity)
- **Docs**: https://openskynetwork.github.io/opensky-api/rest.html
- **Register**: https://opensky-network.org/index.php?option=com_users&view=registration

### CartoDB Basemaps (map tiles)
- **Endpoint**: `https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json`
- **Auth**: None
- **Free tier**: No hard limits for reasonable usage

### OpenFlights (reference data)
- **Airports**: `https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat`
- **Airlines**: `https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat`
- **Auth**: None (GitHub raw CDN)
- **Note**: This dataset is community-maintained and may be slightly outdated. Cached locally for 7 days.

### Vercel KV (optional server-side cache)
- Redis-based key-value store provided by Vercel
- Used to share cached flight data across users/sessions
- Not required — app works fully without it

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18 | UI framework |
| TypeScript | 5 | Type safety |
| Vite | 5 | Build tool, dev server, HMR |
| deck.gl | 9 | WebGL-powered map visualization |
| MapLibre GL | 3 | Vector map rendering |
| Vercel | - | Hosting, serverless functions, KV storage |

---

## Local Development

### Prerequisites

- Node.js 18+
- npm
- (Optional) OpenSky Network account for higher API rate limits

### Setup

```bash
# Clone the repository
git clone https://github.com/RomanDataLab/Brazil_flightradar.git
cd Brazil_flightradar

# Install dependencies
npm install

# Start dev server
npm run dev
```

The app will be available at `http://localhost:5173`.

In development, Vite proxies `/api/opensky/*` requests directly to `opensky-network.org` (configured in `vite.config.js`), so no serverless functions are needed locally.

### OpenSky Credentials (Optional)

On first load, the app shows a modal where you can enter your OpenSky username and password. You can also skip this to use cached/fallback data.

Credentials are stored in memory only for the current session. They are never written to disk, localStorage, or bundled into the JS output.

---

## Build

```bash
npm run build
```

Output goes to `dist/`. Preview the production build:

```bash
npm run preview
```

---

## Deploy to Vercel

### Step 1: Push to GitHub

```bash
# Stage your changes
git add -A

# Commit
git commit -m "Your commit message"

# Push to main branch
git push origin main
```

### Step 2: Connect to Vercel (first time only)

1. Go to https://vercel.com/dashboard
2. Click **"Add New..."** > **"Project"**
3. Select **"Import Git Repository"** and choose `RomanDataLab/Brazil_flightradar`
4. Vercel auto-detects the Vite framework from `vercel.json`:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
5. Click **"Deploy"**

After the first import, every push to `main` triggers an automatic deployment.

### Step 3: Set Environment Variables

In Vercel Dashboard > Your Project > **Settings** > **Environment Variables**, add:

| Variable | Value | Environments |
|----------|-------|-------------|
| `OPENSKY_USERNAME` | Your OpenSky username | Production, Preview, Development |
| `OPENSKY_PASSWORD` | Your OpenSky password | Production, Preview, Development |

These are used **server-side only** by the API proxy (`api/opensky/[...path].ts`). They are never exposed to the browser.

**Do NOT set `VITE_OPENSKY_*` variables** — those would be bundled into client-side JavaScript and visible to anyone.

After adding variables, Vercel will automatically redeploy.

### Step 4: (Optional) Set Up Vercel KV

Vercel KV provides a server-side Redis cache shared across all users:

1. In Vercel Dashboard > Your Project > **Storage** > **Create Database** > **KV**
2. Follow the setup wizard — Vercel automatically sets the connection env vars
3. Install the KV package:
   ```bash
   npm install @vercel/kv
   git add package.json package-lock.json
   git commit -m "Add Vercel KV dependency"
   git push origin main
   ```

Without KV, the app still works — it just uses client-side IndexedDB and the static fallback file.

### Step 5: Verify Deployment

1. Open your Vercel deployment URL
2. The API key modal should appear (unless server-side env vars handle auth)
3. Check browser DevTools console for `Processed N aircraft`
4. Check Vercel Dashboard > **Deployments** > latest > **Functions** tab for serverless function logs

### Redeployment

Every `git push origin main` triggers a new deployment automatically. To manually redeploy:

```bash
# Vercel CLI (optional)
npm i -g vercel
vercel --prod
```

Or use the **"Redeploy"** button in the Vercel Dashboard.

---

## Project Structure

```
Brazil_flightradar/
├── api/                          # Vercel serverless functions
│   ├── opensky/
│   │   └── [...path].ts          # Proxy to OpenSky API (injects server-side creds)
│   ├── flight-data.ts            # Vercel KV read/write endpoint
│   └── flight-data-kv.ts         # Dedicated KV endpoint (optional)
├── src/
│   ├── api/
│   │   └── opensky.ts            # OpenSky client (bounding box query, data filtering)
│   ├── utils/
│   │   ├── credentials.ts        # In-memory credential store
│   │   ├── storage.ts            # IndexedDB cache + rate-limit handling + fallbacks
│   │   ├── airports.ts           # Airport data fetch + 7-day cache
│   │   └── airlines.ts           # Airline data fetch + 7-day cache
│   ├── app.tsx                   # Main application (map, layers, UI, fetch loop)
│   └── vite-env.d.ts             # Vite type declarations
├── public/
│   ├── airplane.svg              # Aircraft icon
│   ├── airport.svg               # Domestic airport icon
│   ├── airport-yellow.svg        # International airport icon
│   ├── flight-data-fallback.json # Static fallback flight data
│   └── credentials.json.example  # Credential file template
├── index.html                    # HTML entry point
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── vite.config.js                # Vite config (dev proxy, build settings)
├── vercel.json                   # Vercel deployment configuration
└── .gitignore                    # Git ignore rules
```

---

## Security Notes

- **Server-side credentials only**: OpenSky credentials are set as Vercel environment variables (`OPENSKY_USERNAME`, `OPENSKY_PASSWORD`) and only accessed in serverless functions. They never appear in the client JS bundle.
- **In-memory UI credentials**: When a user enters credentials via the API key modal, they are stored in a JavaScript variable for the current session only. They are sent to **our own proxy** (`/api/opensky/...`), not directly to OpenSky from the browser.
- **No `VITE_` credential variables**: Previous versions used `VITE_OPENSKY_*` env vars which were bundled into client code. This has been removed.
- **CORS**: The serverless proxy sets `Access-Control-Allow-Origin: *`. For tighter security, restrict this to your domain.
- **gitignored secrets**: `credentials.json`, `.env`, and `.env*.local` are all in `.gitignore`.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No aircraft showing | Check browser console for API errors. Enter OpenSky credentials via the modal or set env vars on Vercel. |
| HTTP 429 (rate limit) | The app auto-caches data for 24h when rate-limited. Wait for the daily reset, or add authenticated credentials for higher limits. |
| Map not loading | Check network tab for CartoDB tile errors. May be a network/firewall issue. |
| "KV not configured" in logs | Install `@vercel/kv` and set up Vercel KV storage (optional — app works without it). |
| Stale airport/airline data | Clear localStorage (`openflights_airports`, `openflights_airlines`) to force a re-fetch. |
| Build errors | Run `npx tsc --noEmit` to check for TypeScript errors. Ensure Node.js 18+. |

---

## License

MIT
