# Brazil Flight Tracker

A real-time flight tracking visualization for Brazil using deck.gl, React, and the OpenSky Network API.

## Features

- ✈️ Real-time flight tracking over Brazil
- 🏢 Airport visualization (international airports highlighted)
- 📊 Interactive 3D map with deck.gl
- 🔄 Auto-updates every 5 minutes
- 💾 Smart caching for offline viewing

## Tech Stack

- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **deck.gl** - WebGL-powered visualization framework
- **MapLibre GL** - Map rendering
- **OpenSky Network API** - Flight data source

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

The production build will be in the `dist/` folder.

## Deployment on Vercel

This project is configured for Vercel deployment:

1. Push your code to GitHub
2. Import the repository in Vercel
3. Vercel will automatically detect the Vite configuration
4. The API proxy for OpenSky Network is configured via `vercel.json`

### Environment Variables (Optional)

If you have OpenSky Network credentials, you can add them as environment variables in Vercel:
- `OPENSKY_USERNAME` - OpenSky Network username
- `OPENSKY_PASSWORD` - OpenSky Network password

Or create a `public/credentials.json` file locally (this file is gitignored).

## Configuration

The app is configured to show:
- **Region:** Brazil (bounded by coordinates: -33.75° to 5.27° latitude, -73.99° to -34.79° longitude)
- **Update Interval:** Every 5 minutes
- **Aircraft Filter:** Only aircraft in the air (altitude > 50m, not on ground)

## OpenSky API

This project uses the OpenSky Network API to fetch flight data. The API provides:
- Real-time and historical flight tracking data
- Flight information including origin, destination, and timestamps

**API Endpoints Used:**
- `/api/states/all?lamin={lat}&lomin={lon}&lamax={lat}&lomax={lon}` - Real-time aircraft states in bounding box

**Authentication:**
- Uses HTTP Basic Authentication with username and password
- Credentials are loaded from `public/credentials.json`
- Without credentials, API calls are anonymous (limited access)

**Note:** 
- If the API request fails or returns no data, the app will display cached data for demonstration purposes.
- Historical data requires authentication and is processed nightly
- Time interval must be smaller than 7 days for airport queries
- For production use, consider using environment variables or a backend proxy to keep credentials secure.

See [OPENSKY_API_GUIDE.md](./OPENSKY_API_GUIDE.md) for detailed connection instructions.

## Project Structure

```
├── src/
│   ├── api/          # API integration (OpenSky Network)
│   ├── utils/        # Utilities (credentials, storage, airports, airlines)
│   └── app.tsx       # Main application component
├── public/           # Static assets (SVG icons, 3D models)
├── index.html        # HTML entry point
└── vercel.json       # Vercel deployment configuration
```

## License

MIT
