# Brazil Flight Tracker

A deck.gl visualization showing real-time flights in Brazilian airspace with airport locations and detailed flight information.

## Features

- Interactive 3D map visualization using deck.gl
- Real-time aircraft positions displayed as plane icons
- Aircraft sized by capacity (using Jenks natural breaks classification)
- Color-coded aircraft: White plane icons
- Real-time data from OpenSky Network API
- Airport markers with names and codes
- Hover popups showing detailed flight information
- Centered on Brazil

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure credentials:**
   - Create a `public` folder if it doesn't exist: `mkdir public`
   - Copy `credentials.json.example` to `public/credentials.json`
   - Add your OpenSky API password:
     ```json
     {
       "opensky": {
         "username": "casadel-api-client",
         "password": "YOUR_PASSWORD_HERE"
       }
     }
     ```
   - **Note:** `credentials.json` is gitignored for security. The app will work without it (using unauthenticated API calls), but authenticated requests have higher rate limits.
   - **Security Warning:** Files in the `public` folder are served publicly. For production, use environment variables or a backend proxy instead.

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

## Configuration

The app is configured to show:
- **Region:** Brazil (bounded by coordinates: -33.75° to 5.27° latitude, -73.99° to -34.79° longitude)
- **Update Interval:** Every 5 minutes
- **Aircraft Filter:** Only aircraft in the air (altitude > 50m, not on ground)

You can modify these settings in `src/api/opensky.js`:
```javascript
const bbox = {
  lamin: -33.75,  // Southern boundary
  lomin: -73.99,  // Western boundary
  lamax: 5.27,    // Northern boundary
  lomax: -34.79   // Eastern boundary
};
```

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
- If the API request fails or returns no data, the app will display sample flight data for demonstration purposes.
- Historical data requires authentication and is processed nightly
- Time interval must be smaller than 7 days for airport queries
- For production use, consider using environment variables or a backend proxy to keep credentials secure.

See [OPENSKY_API_GUIDE.md](./OPENSKY_API_GUIDE.md) for detailed connection instructions.

## Technologies

- **React** - UI framework
- **deck.gl** - WebGL-powered visualization framework
- **Mapbox GL** - Base map rendering
- **Vite** - Build tool and dev server
- **OpenSky Network API** - Flight data source

## Map Style

The app uses Carto's Dark Matter basemap style, which doesn't require a Mapbox access token. You can change this in `src/App.jsx` if you prefer a different style.

## License

MIT

