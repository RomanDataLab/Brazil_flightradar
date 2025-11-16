/**
 * OpenSky API service for fetching flight data
 */

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimate aircraft capacity based on ICAO24 and callsign
 * @param {string} icao24 - ICAO24 address
 * @param {string} callsign - Aircraft callsign
 * @returns {number} Estimated capacity
 */
function estimateAircraftCapacity(icao24, callsign) {
  // Simple estimation based on common aircraft types
  // In production, use a proper aircraft database
  const callsignUpper = (callsign || '').toUpperCase();
  
  // Large wide-body aircraft (A380, B777, B787, A350)
  if (callsignUpper.includes('A380') || callsignUpper.includes('B777') || 
      callsignUpper.includes('B787') || callsignUpper.includes('A350')) {
    return 300;
  }
  
  // Medium wide-body (A330, B767)
  if (callsignUpper.includes('A330') || callsignUpper.includes('B767')) {
    return 250;
  }
  
  // Narrow-body large (A321, B737-900)
  if (callsignUpper.includes('A321') || callsignUpper.includes('B739')) {
    return 200;
  }
  
  // Narrow-body medium (A320, B737)
  if (callsignUpper.includes('A320') || callsignUpper.includes('B737') || 
      callsignUpper.includes('B738')) {
    return 180;
  }
  
  // Small narrow-body (A319, B737-700)
  if (callsignUpper.includes('A319') || callsignUpper.includes('B737')) {
    return 150;
  }
  
  // Regional jets (ERJ, CRJ)
  if (callsignUpper.includes('ERJ') || callsignUpper.includes('CRJ')) {
    return 100;
  }
  
  // Small regional (ATR, Dash)
  if (callsignUpper.includes('ATR') || callsignUpper.includes('DH8')) {
    return 70;
  }
  
  // Default medium capacity
  return 150;
}

/**
 * Calculate Jenks natural breaks classification
 * @param {Array<number>} values - Array of values to classify
 * @param {number} nClasses - Number of classes
 * @returns {Array<number>} Array of break points
 */
export function jenksBreaks(values, nClasses) {
  if (!values || values.length === 0) return [];
  
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  
  if (n <= nClasses) {
    return sorted;
  }
  
  // Simple equal interval as fallback (true jenks is more complex)
  const min = sorted[0];
  const max = sorted[n - 1];
  const breaks = [min];
  
  for (let i = 1; i < nClasses; i++) {
    breaks.push(min + (max - min) * (i / nClasses));
  }
  breaks.push(max);
  
  return breaks;
}

/**
 * Fetch all flights in the air around Brazil
 * Uses OpenSky API /api/states/all endpoint with bounding box
 * @param {Object} credentials - OpenSky API credentials
 * @returns {Promise<Array>} Array of all aircraft in the air with enhanced data
 */
export async function fetchAllFlightsBrazil(credentials) {
  try {
    // Bounding box for Brazil
    // Brazil: -33.75°S to 5.27°N, -73.99°W to -34.79°W
    const bbox = {
      lamin: -33.75,  // Minimum latitude (south)
      lomin: -73.99,  // Minimum longitude (west)
      lamax: 5.27,   // Maximum latitude (north)
      lomax: -34.79  // Maximum longitude (east)
    };

    const url = `https://opensky-network.org/api/states/all?lamin=${bbox.lamin}&lomin=${bbox.lomin}&lamax=${bbox.lamax}&lomax=${bbox.lomax}`;
    
    console.log('🌐 Fetching flights from OpenSky API');
    console.log('📍 URL:', url);
    console.log('📦 Bounding box:', bbox);
    console.log('🔐 Using credentials:', credentials ? `Yes (${credentials.username})` : 'No (unauthenticated)');
    
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    // Add authentication if credentials are provided
    if (credentials && credentials.username && credentials.password) {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      options.headers['Authorization'] = `Basic ${auth}`;
      console.log('✅ Using authenticated OpenSky API request');
    } else {
      console.log('⚠️ Using unauthenticated OpenSky API request (rate limited)');
    }

    console.log('⏳ Sending API request...');
    const response = await fetch(url, options);
    
    console.log('📡 API Response Status:', response.status, response.statusText);
    console.log('📋 Response Headers:', {
      contentType: response.headers.get('content-type'),
      rateLimitRemaining: response.headers.get('x-rate-limit-remaining'),
      rateLimitReset: response.headers.get('x-rate-limit-reset')
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      const retryAfter = response.headers.get('x-rate-limit-retry-after-seconds');
      
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('x-rate-limit-retry-after-seconds');
        let retryHours = 'unknown';
        let retryMinutes = 'unknown';
        
        if (retryAfterHeader) {
          const seconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(seconds)) {
            retryHours = Math.round(seconds / 3600 * 10) / 10;
            retryMinutes = Math.round(seconds / 60);
          }
        }
        
        console.error('🚫 OpenSky API rate limit exceeded (429)');
        console.error(`⏰ Retry after: ${retryHours} hours (${retryMinutes} minutes)`);
        console.error('');
        console.error('💡 Solutions:');
        console.error('1. Create public/credentials.json with your OpenSky API credentials');
        console.error('2. Wait for the rate limit to reset');
        console.error('');
        console.error('📝 Example credentials.json format:');
        console.error(JSON.stringify({
          opensky: {
            username: 'casadel-api-client',
            password: 'YOUR_PASSWORD_HERE'
          },
          github: {
            token: 'YOUR_GITHUB_TOKEN_HERE'
          }
        }, null, 2));
        
        throw new Error(`Rate limit exceeded (429). Retry after ${retryHours} hours`);
      }
      
      console.error(`OpenSky API error: ${response.status} ${response.statusText}`, errorText);
      return [];
    }

    const data = await response.json();
    
    console.log('OpenSky API response:', {
      time: data.time,
      statesCount: data.states ? data.states.length : 0,
      hasStates: !!data.states,
      responseKeys: Object.keys(data),
      sampleState: data.states && data.states.length > 0 ? data.states[0] : null
    });
    
    if (!data) {
      console.error('OpenSky API returned null or undefined');
      return [];
    }
    
    if (!data.states) {
      console.warn('OpenSky API response missing "states" field. Response:', data);
      return [];
    }
    
    if (!Array.isArray(data.states)) {
      console.error('OpenSky API "states" is not an array:', typeof data.states, data.states);
      return [];
    }
    
    if (data.states.length === 0) {
      console.warn('OpenSky API returned empty states array. No aircraft in Brazil airspace at this time.');
      return [];
    }

    const aircraft = [];

    let skippedNoPosition = 0;
    let skippedOnGround = 0;
    let skippedLowAltitude = 0;

    // Process each aircraft state
    data.states.forEach(state => {
      // State vector format: [icao24, callsign, origin_country, time_position, last_contact, 
      // longitude, latitude, baro_altitude, on_ground, velocity, true_track, vertical_rate, ...]
      const [
        icao24,
        callsign,
        originCountry,
        timePosition,
        lastContact,
        lon,
        lat,
        baroAltitude,
        onGround,
        velocity,
        trueTrack,
        verticalRate
      ] = state;

      // Skip if no position data
      if (lon === null || lat === null) {
        skippedNoPosition++;
        return;
      }

      // Only show aircraft in the air (not on ground)
      if (onGround === true) {
        skippedOnGround++;
        return;
      }

      // Only include aircraft with valid altitude (lowered threshold to catch more flights)
      if (baroAltitude === null || baroAltitude === undefined || baroAltitude < 50) {
        skippedLowAltitude++;
        return;
      }

      const capacity = estimateAircraftCapacity(icao24, callsign);
      
      aircraft.push({
        id: icao24,
        callsign: (callsign || '').trim() || 'UNKNOWN',
        latitude: lat,
        longitude: lon,
        altitude: baroAltitude || 0,
        velocity: velocity || 0,
        track: trueTrack || 0,
        verticalRate: verticalRate || 0,
        origin: originCountry || 'UNKNOWN',
        capacity: capacity,
        icao24: icao24,
        timePosition: timePosition,
        lastContact: lastContact
      });
    });

    console.log(`✅ Processed ${aircraft.length} aircraft in the air over Brazil`);
    console.log(`📊 Filtering stats: ${skippedNoPosition} no position, ${skippedOnGround} on ground, ${skippedLowAltitude} low altitude`);
    
    if (aircraft.length === 0 && data.states.length > 0) {
      console.warn('⚠️ All aircraft were filtered out!');
      console.warn(`Total states: ${data.states.length}, Filtered: ${skippedNoPosition + skippedOnGround + skippedLowAltitude}`);
      console.warn('Check filtering criteria (altitude > 50m, onGround = false, valid coordinates)');
    }
    
    return aircraft;
  } catch (error) {
    console.error('Error fetching flights:', error);
    return [];
  }
}

/**
 * Fetch real-time arriving and departing aircraft near a specific airport
 * Uses OpenSky API /api/states/all endpoint
 * @param {number} airportLat - Airport latitude
 * @param {number} airportLon - Airport longitude
 * @param {number} radiusKm - Radius in kilometers (default: 50)
 * @param {Object} credentials - OpenSky API credentials
 * @returns {Promise<Object>} Object with arriving and departing aircraft arrays
 */
export async function fetchRealTimeAircraft(airportLat, airportLon, radiusKm = 50, credentials) {
  try {
    const url = 'https://opensky-network.org/api/states/all';
    
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    // Add authentication if credentials are provided
    if (credentials && credentials.username && credentials.password) {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      options.headers['Authorization'] = `Basic ${auth}`;
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      console.warn(`OpenSky API error: ${response.status} ${response.statusText}`);
      return { arriving: [], departing: [] };
    }

    const data = await response.json();
    
    if (!data || !data.states || !Array.isArray(data.states)) {
      console.warn('Unexpected API response format');
      return { arriving: [], departing: [] };
    }
    
    const arriving = [];
    const departing = [];

    // Process each aircraft state
    data.states.forEach(state => {
      // State vector format: [icao24, callsign, origin_country, time_position, last_contact, 
      // longitude, latitude, baro_altitude, on_ground, velocity, true_track, vertical_rate, ...]
      const [
        icao24,
        callsign,
        originCountry,
        timePosition,
        lastContact,
        lon,
        lat,
        baroAltitude,
        onGround,
        velocity,
        trueTrack,
        verticalRate
      ] = state;

      // Skip if no position data
      if (lon === null || lat === null) return;

      // Calculate distance from airport
      const distance = calculateDistance(lat, lon, airportLat, airportLon);

      // Only consider aircraft within radius
      if (distance > radiusKm) return;

      // Skip aircraft on ground (already landed or at gate)
      if (onGround) return;

      // Determine if arriving or departing based on altitude and distance
      // Arriving: low altitude (< 5000m) and close to airport (< 30km) OR descending
      // Departing: higher altitude OR ascending and close to airport
      const isArriving = (baroAltitude < 5000 && distance < 30) || 
                        (verticalRate < 0 && distance < 40); // Descending
      const isDeparting = (baroAltitude > 1000 && distance < 20) || 
                         (verticalRate > 0 && distance < 30); // Ascending

      const aircraft = {
        id: icao24,
        callsign: callsign || 'UNKNOWN',
        latitude: lat,
        longitude: lon,
        altitude: baroAltitude || 0,
        velocity: velocity || 0,
        track: trueTrack || 0,
        verticalRate: verticalRate || 0,
        distance: distance,
        origin: originCountry || 'UNKNOWN'
      };

      if (isArriving && !isDeparting) {
        arriving.push(aircraft);
      } else if (isDeparting && !isArriving) {
        departing.push(aircraft);
      }
    });

    return { arriving, departing };
  } catch (error) {
    console.error('Error fetching real-time aircraft:', error);
    return { arriving: [], departing: [] };
  }
}

/**
 * Fetch flights from OpenSky API for a specific airport and time window
 * Uses OpenSky API endpoints: /api/flights/arrival and /api/flights/departure
 * @param {string} airportIcao - ICAO airport code (e.g., 'SBGR' for São Paulo Guarulhos)
 * @param {Date} startTime - Start of the time window
 * @param {Date} endTime - End of the time window
 * @param {Object} credentials - OpenSky API credentials
 * @returns {Promise<Array>} Array of flight data
 */
export async function fetchFlightsForAirport(airportIcao, startTime, endTime, credentials) {
  try {
    // Convert dates to Unix timestamps (seconds)
    const begin = Math.floor(startTime.getTime() / 1000);
    const end = Math.floor(endTime.getTime() / 1000);

    // OpenSky API endpoints for arrivals and departures at specific airport
    // These endpoints are more efficient than /api/flights/all
    const arrivalUrl = `https://opensky-network.org/api/flights/arrival?airport=${airportIcao}&begin=${begin}&end=${end}`;
    const departureUrl = `https://opensky-network.org/api/flights/departure?airport=${airportIcao}&begin=${begin}&end=${end}`;
    
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    // Add authentication if credentials are provided
    // OpenSky API supports Basic Auth with username:password
    if (credentials && credentials.username && credentials.password) {
      // Basic authentication for OpenSky API
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      options.headers['Authorization'] = `Basic ${auth}`;
    }

    // Fetch both arrivals and departures in parallel
    const [arrivalResponse, departureResponse] = await Promise.all([
      fetch(arrivalUrl, options),
      fetch(departureUrl, options)
    ]);
    
    // Check if requests were successful
    if (!arrivalResponse.ok && !departureResponse.ok) {
      const errorStatus = arrivalResponse.status || departureResponse.status;
      const errorText = arrivalResponse.statusText || departureResponse.statusText;
      console.warn(`OpenSky API error: ${errorStatus} ${errorText}. Using sample data.`);
      return getSampleFlights();
    }

    // Parse responses
    const arrivals = arrivalResponse.ok ? await arrivalResponse.json() : [];
    const departures = departureResponse.ok ? await departureResponse.json() : [];
    
    // Combine arrivals and departures
    const allFlights = [...(Array.isArray(arrivals) ? arrivals : []), ...(Array.isArray(departures) ? departures : [])];

    // If no flights found, return sample data
    if (allFlights.length === 0) {
      console.warn(`No flights found for airport ${airportIcao} in the specified time window. Using sample data.`);
      return getSampleFlights();
    }

    // Transform flight data to include coordinates
    return allFlights.map(flight => {
      const origin = flight.estDepartureAirport || flight.origin;
      const destination = flight.estArrivalAirport || flight.destination;
      
      // Get airport coordinates (simplified - in production, use airport database)
      const originCoords = getAirportCoordinates(origin);
      const destCoords = getAirportCoordinates(destination);

      return {
        id: flight.icao24 || `${flight.callsign || 'UNKNOWN'}-${flight.firstSeen || Date.now()}`,
        callsign: flight.callsign || 'UNKNOWN',
        origin: origin,
        destination: destination,
        source: originCoords,
        target: destCoords,
        departureTime: flight.firstSeen || flight.estDepartureTime,
        arrivalTime: flight.lastSeen || flight.estArrivalTime,
        // Color: red for departures, blue for arrivals
        color: origin === airportIcao ? [255, 0, 0] : [0, 0, 255]
      };
    });
  } catch (error) {
    console.error('Error fetching flights:', error);
    // Return sample data for development if API fails
    return getSampleFlights();
  }
}

/**
 * Get major Brazilian airports
 * @returns {Array} Array of airport objects with coordinates, names, and codes
 */
export function getBrazilAirports() {
  return [
    { code: 'SBGR', name: 'S\u00E3o Paulo Guarulhos', lat: -23.4321, lon: -46.4695 },
    { code: 'SBSP', name: 'S\u00E3o Paulo Congonhas', lat: -23.6267, lon: -46.6553 },
    { code: 'SBGL', name: 'Rio de Janeiro Gale\u00E3o', lat: -22.8089, lon: -43.2436 },
    { code: 'SBRJ', name: 'Rio de Janeiro Santos Dumont', lat: -22.9103, lon: -43.1631 },
    { code: 'SBKP', name: 'Campinas Viracopos', lat: -23.0075, lon: -47.1344 },
    { code: 'SBBR', name: 'Bras\u00EDlia', lat: -15.8711, lon: -47.9186 },
    { code: 'SBCF', name: 'Belo Horizonte Confins', lat: -19.6337, lon: -43.9689 },
    { code: 'SBPA', name: 'Porto Alegre', lat: -29.9944, lon: -51.1714 },
    { code: 'SBFZ', name: 'Fortaleza', lat: -3.7763, lon: -38.5326 },
    { code: 'SBRF', name: 'Recife', lat: -8.1268, lon: -34.9230 },
    { code: 'SBVT', name: 'Vit\u00F3ria', lat: -20.2581, lon: -40.2864 },
    { code: 'SBSV', name: 'Salvador', lat: -12.9107, lon: -38.3310 },
    { code: 'SBFL', name: 'Florian\u00F3polis', lat: -27.6702, lon: -48.5525 },
    { code: 'SBCY', name: 'Cuiab\u00E1', lat: -15.6513, lon: -56.1167 },
    { code: 'SBEG', name: 'Manaus', lat: -3.0386, lon: -60.0497 },
    { code: 'SBBE', name: 'Bel\u00E9m', lat: -1.3792, lon: -48.4763 },
    { code: 'SBAT', name: 'Aracaju', lat: -10.9842, lon: -37.0703 },
    { code: 'SBMO', name: 'Macei\u00F3', lat: -9.5108, lon: -35.7917 },
    { code: 'SBJP', name: 'Jo\u00E3o Pessoa', lat: -7.1484, lon: -34.9507 },
    { code: 'SBNT', name: 'Natal', lat: -5.7681, lon: -35.3761 }
  ];
}

/**
 * Get airport coordinates (simplified - use airport database in production)
 * @param {string} icao - ICAO airport code
 * @returns {Array} [longitude, latitude]
 */
function getAirportCoordinates(icao) {
  // Common airports - in production, use a proper airport database
  const airports = {
    'SBGR': [-46.4695, -23.4321], // São Paulo Guarulhos
    'SBSP': [-46.6553, -23.6267],  // São Paulo Congonhas
    'SBGL': [-43.2436, -22.8089],  // Rio de Janeiro Galeão
    'LFPG': [2.5477, 49.0097],     // Paris CDG
    'EGLL': [-0.4619, 51.4700],    // London Heathrow
    'EDDF': [8.5706, 50.0379],     // Frankfurt
    'LHR': [-0.4619, 51.4700],    // London Heathrow (IATA)
    'CDG': [2.5477, 49.0097],      // Paris CDG (IATA)
    'FRA': [8.5706, 50.0379],      // Frankfurt (IATA)
  };

  // Try ICAO first, then try uppercase
  return airports[icao] || airports[icao?.toUpperCase()] || [0, 0];
}

/**
 * Generate sample flight data for development/testing
 * @returns {Array} Sample flight data
 */
function getSampleFlights() {
  const saoPaulo = [-46.4695, -23.4321]; // São Paulo Guarulhos (SBGR)
  
  return [
    {
      id: 'sample-1',
      callsign: 'G31234',
      origin: 'SBGR',
      destination: 'SBGL',
      source: saoPaulo,
      target: [-43.2436, -22.8089], // Rio de Janeiro Galeão
      departureTime: Date.now() / 1000,
      arrivalTime: Date.now() / 1000 + 7200,
      color: [255, 0, 0] // Red for departure
    },
    {
      id: 'sample-2',
      callsign: 'LA5678',
      origin: 'SBGL',
      destination: 'SBGR',
      source: [-43.2436, -22.8089], // Rio de Janeiro Galeão
      target: saoPaulo,
      departureTime: Date.now() / 1000,
      arrivalTime: Date.now() / 1000 + 7200,
      color: [0, 0, 255] // Blue for arrival
    },
    {
      id: 'sample-3',
      callsign: 'G39012',
      origin: 'SBBR',
      destination: 'SBGR',
      source: [-47.9186, -15.8711], // Brasília
      target: saoPaulo,
      departureTime: Date.now() / 1000,
      arrivalTime: Date.now() / 1000 + 7200,
      color: [0, 0, 255] // Blue for arrival
    },
    {
      id: 'sample-4',
      callsign: 'G33456',
      origin: 'SBGR',
      destination: 'SBBR',
      source: saoPaulo,
      target: [-47.9186, -15.8711], // Brasília
      departureTime: Date.now() / 1000,
      arrivalTime: Date.now() / 1000 + 7200,
      color: [255, 0, 0] // Red for departure
    }
  ];
}

