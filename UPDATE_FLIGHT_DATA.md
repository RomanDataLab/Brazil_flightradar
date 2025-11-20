# How to Update Flight Data on Vercel

## Option 1: Export from Local Development (Recommended)

1. **Run the app locally** and let it fetch flight data:
   ```bash
   npm run dev
   ```

2. **Open the export tool**:
   - Open `export-flight-data.html` in your browser
   - Or visit: `http://localhost:5173/export-flight-data.html`

3. **Export your data**:
   - Click "Export & Upload to Vercel"
   - This will:
     - Download `flight-data-fallback.json` with ALL your cached flights
     - Upload to Vercel storage (if KV is configured)

4. **Replace the static file**:
   - Copy the downloaded `flight-data-fallback.json`
   - Replace `public/flight-data-fallback.json` in your project
   - Commit and push to GitHub

## Option 2: Fix the API to Fetch Real Data

The 404 error means `/api/opensky/states/all` isn't working. Once fixed, the app will automatically:
- Fetch real-time flight data
- Save it to LocalStorage
- Upload it to Vercel storage
- Update the static fallback file

## Option 3: Upload Existing Data Manually

If you have flight data in JSON format:

1. Format it like this:
```json
{
  "time": 1735689600,
  "states": [
    ["icao24", "callsign", "country", ...],
    ...
  ]
}
```

2. Replace `public/flight-data-fallback.json`

3. Commit and push

## Check Current Data Source

Open browser console and look for:
- `📦 Using cached flight data: X aircraft` - LocalStorage
- `☁️ Loaded X aircraft from Vercel storage` - Vercel KV
- `📦 Loaded X aircraft from static fallback data` - Static file (15 flights)

