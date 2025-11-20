# OpenSky Network API Connection Guide

This guide explains how to connect to the OpenSky Network API from JavaScript/React (our implementation) and how it relates to the Python API.

## API Overview

The OpenSky Network provides access to live and historical flight data through a REST API. The Python library you referenced ([documentation](https://openskynetwork.github.io/opensky-api/python.html)) is a wrapper around these REST endpoints.

## REST API Endpoints

Our JavaScript implementation uses the same REST endpoints that the Python library calls:

### 1. Arrivals Endpoint
```
GET https://opensky-network.org/api/flights/arrival?airport={ICAO}&begin={timestamp}&end={timestamp}
```

### 2. Departures Endpoint
```
GET https://opensky-network.org/api/flights/departure?airport={ICAO}&begin={timestamp}&end={timestamp}
```

**Parameters:**
- `airport`: ICAO airport code (e.g., `SBGR` for São Paulo Guarulhos)
- `begin`: Unix timestamp (seconds since epoch) for start time
- `end`: Unix timestamp (seconds since epoch) for end time

**Important Constraints:**
- Time interval must be **smaller than 7 days** for airport queries
- Historical data is processed nightly, so data may not be available immediately

## Authentication

### Method: Basic Authentication

The OpenSky API uses **HTTP Basic Authentication** with your username and password:

```javascript
// Encode credentials as Base64
const auth = btoa(`${username}:${password}`);
headers['Authorization'] = `Basic ${auth}`;
```

### Setting Up Credentials

1. **Get OpenSky Account:**
   - Visit [OpenSky Network](https://opensky-network.org/)
   - Create an account or use existing credentials
   - Your username: `casadel-api-client` (as specified)

2. **Create Credentials File:**
   - Create `public/credentials.json`:
   ```json
   {
     "opensky": {
       "username": "casadel-api-client",
       "password": "YOUR_PASSWORD_HERE"
     }
   }
   ```

3. **Security Note:**
   - Files in `public/` are served publicly
   - For production, use environment variables or a backend proxy
   - Never commit credentials to version control

## Our Implementation

Our current implementation in `src/api/opensky.js`:

```javascript
// Convert dates to Unix timestamps
const begin = Math.floor(startTime.getTime() / 1000);
const end = Math.floor(endTime.getTime() / 1000);

// Build URLs
const arrivalUrl = `https://opensky-network.org/api/flights/arrival?airport=SBGR&begin=${begin}&end=${end}`;
const departureUrl = `https://opensky-network.org/api/flights/departure?airport=SBGR&begin=${begin}&end=${end}`;

// Add Basic Auth if credentials provided
if (credentials && credentials.username && credentials.password) {
  const auth = btoa(`${credentials.username}:${credentials.password}`);
  options.headers['Authorization'] = `Basic ${auth}`;
}

// Fetch both endpoints in parallel
const [arrivalResponse, departureResponse] = await Promise.all([
  fetch(arrivalUrl, options),
  fetch(departureUrl, options)
]);
```

## Response Format

The API returns an array of flight objects with this structure:

```json
[
  {
    "icao24": "abc123",
    "firstSeen": 1746088800,
    "estDepartureAirport": "SBGR",
    "lastSeen": 1746110400,
    "estArrivalAirport": "LFPG",
    "callsign": "IB1234",
    "estDepartureAirportHorizDistance": 1500,
    "estDepartureAirportVertDistance": 200,
    "estArrivalAirportHorizDistance": 1200,
    "estArrivalAirportVertDistance": 150,
    "departureAirportCandidatesCount": 0,
    "arrivalAirportCandidatesCount": 0
  }
]
```

## Rate Limits

- **Anonymous (no auth):** Limited access, lower rate limits
- **Authenticated:** Higher rate limits, access to historical data

## Testing the Connection

You can test the API connection using curl:

```bash
# Without authentication (limited)
curl "https://opensky-network.org/api/flights/arrival?airport=SBGR&begin=1746088800&end=1746110400"

# With authentication
curl -u "casadel-api-client:YOUR_PASSWORD" \
  "https://opensky-network.org/api/flights/arrival?airport=SBGR&begin=1746088800&end=1746110400"
```

## Troubleshooting

### Common Issues:

1. **401 Unauthorized:**
   - Check credentials are correct
   - Verify Basic Auth header format

2. **No Data Returned:**
   - Historical data may not be available yet (processed nightly)
   - Check time interval is within 7 days
   - Verify airport ICAO code is correct

3. **CORS Errors:**
   - OpenSky API may have CORS restrictions
   - Consider using a backend proxy for production

4. **Rate Limiting:**
   - Use authentication for higher limits
   - Implement request throttling

## Python vs JavaScript

The Python library (`opensky-api`) provides convenience methods:

```python
from opensky_api import OpenSkyApi

api = OpenSkyApi(username='user', password='pass')
arrivals = api.get_arrivals_by_airport('SBGR', begin, end)
```

Our JavaScript implementation does the same thing using direct REST calls:

```javascript
const response = await fetch(
  `https://opensky-network.org/api/flights/arrival?airport=SBGR&begin=${begin}&end=${end}`,
  { headers: { 'Authorization': `Basic ${auth}` } }
);
```

Both methods call the same REST endpoints under the hood.

## References

- [OpenSky Python API Documentation](https://openskynetwork.github.io/opensky-api/python.html)
- [OpenSky Network Website](https://opensky-network.org/)
- [OpenSky REST API](https://openskynetwork.github.io/opensky-api/rest.html)

