// OpenSky Network API integration
// Based on: https://openskynetwork.github.io/opensky-api/rest.html

// Brazil bounding box (approximate)
// lat: -33.75 to 5.27, lon: -73.99 to -32.43
export const BRAZIL_BOUNDS = {
  lamin: -33.75,
  lomin: -73.99,
  lamax: 5.27,
  lomax: -32.43
};

// State vector indices (from OpenSky API documentation)
export const DATA_INDEX = {
  ICAO24: 0,
  CALLSIGN: 1,
  ORIGIN_COUNTRY: 2,
  TIME_POSITION: 3,
  LAST_CONTACT: 4,
  LONGITUDE: 5,
  LATITUDE: 6,
  BARO_ALTITUDE: 7,
  ON_GROUND: 8,
  VELOCITY: 9,
  TRUE_TRACK: 10,
  VERTICAL_RATE: 11,
  SENSORS: 12,
  GEO_ALTITUDE: 13,
  SQUAWK: 14,
  SPI: 15,
  POSITION_SOURCE: 16
};

export interface FlightData {
  time: number;
  states: any[][];
}

export async function fetchBrazilFlights(
  authHeader: string | null
): Promise<FlightData> {
  const params = new URLSearchParams({
    lamin: BRAZIL_BOUNDS.lamin.toString(),
    lomin: BRAZIL_BOUNDS.lomin.toString(),
    lamax: BRAZIL_BOUNDS.lamax.toString(),
    lomax: BRAZIL_BOUNDS.lomax.toString()
  });

  const url = `/api/opensky/states/all?${params.toString()}`;
  
  const headers: HeadersInit = {
    'Accept': 'application/json'
  };
  
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded (429). Please wait before retrying.');
    }
    if (response.status === 401) {
      throw new Error('Unauthorized (401). Check your credentials.');
    }
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.states || !Array.isArray(data.states)) {
    throw new Error('Invalid response format from OpenSky API');
  }

  // Filter valid states
  const validStates = data.states.filter((state: any[]) => {
    if (!state || state.length < 17) return false;
    const lon = state[DATA_INDEX.LONGITUDE];
    const lat = state[DATA_INDEX.LATITUDE];
    const onGround = state[DATA_INDEX.ON_GROUND];
    const baroAltitude = state[DATA_INDEX.BARO_ALTITUDE];
    
    // Filter out invalid coordinates
    if (lon === null || lat === null || lon === 0 && lat === 0) {
      return false;
    }
    
    // Filter out aircraft on ground
    if (onGround === true) {
      return false;
    }
    
    // Filter out aircraft with no altitude or negative altitude
    if (baroAltitude === null || baroAltitude < 0) {
      return false;
    }
    
    return true;
  });

  return {
    time: data.time,
    states: validStates
  };
}

