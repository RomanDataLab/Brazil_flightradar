// Airport data utilities
// Data source: https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat
// Cached in localStorage to avoid re-fetching stale data on every page load

export interface Airport {
  id: number;
  name: string;
  city: string;
  country: string;
  iata: string;
  icao: string;
  latitude: number;
  longitude: number;
  altitude: number;
  timezone: string;
  dst: string;
  tz: string;
  type: string;
  source: string;
}

const CACHE_KEY = 'openflights_airports';
const CACHE_TS_KEY = 'openflights_airports_ts';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days (data rarely changes)

export async function fetchAirports(): Promise<Airport[]> {
  // Try cache first
  try {
    const ts = localStorage.getItem(CACHE_TS_KEY);
    if (ts && Date.now() - parseInt(ts, 10) < CACHE_DURATION) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const airports = JSON.parse(cached) as Airport[];
        console.log(`Loaded ${airports.length} Brazil airports from cache`);
        return airports;
      }
    }
  } catch {
    // Cache miss, fetch fresh
  }

  try {
    const response = await fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat');
    const text = await response.text();

    const airports: Airport[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const fields = parseCSVLine(line);
      if (fields.length < 14) continue;

      const airport: Airport = {
        id: parseInt(fields[0]) || 0,
        name: fields[1] || '',
        city: fields[2] || '',
        country: fields[3] || '',
        iata: fields[4] === '\\N' ? '' : fields[4] || '',
        icao: fields[5] === '\\N' ? '' : fields[5] || '',
        latitude: parseFloat(fields[6]) || 0,
        longitude: parseFloat(fields[7]) || 0,
        altitude: parseFloat(fields[8]) || 0,
        timezone: fields[9] === '\\N' ? '' : fields[9] || '',
        dst: fields[10] === '\\N' ? '' : fields[10] || '',
        tz: fields[11] === '\\N' ? '' : fields[11] || '',
        type: fields[12] === '\\N' ? '' : fields[12] || '',
        source: fields[13] === '\\N' ? '' : fields[13] || ''
      };

      if (airport.country === 'Brazil' && airport.latitude && airport.longitude) {
        airports.push(airport);
      }
    }

    // Cache the result
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(airports));
      localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
    } catch {
      // Storage full — non-critical
    }

    console.log(`Fetched ${airports.length} Brazil airports`);
    return airports;
  } catch (error) {
    console.error('Error fetching airports:', error);
    // Try stale cache as fallback
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached) as Airport[];
    } catch {}
    return [];
  }
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}
