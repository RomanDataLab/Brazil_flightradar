// Airline data utilities
// Data source: https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat
// Cached in localStorage to avoid re-fetching stale data on every page load

export interface Airline {
  id: number;
  name: string;
  alias: string;
  iata: string;
  icao: string;
  callsign: string;
  country: string;
  active: string;
}

const CACHE_KEY = 'openflights_airlines';
const CACHE_TS_KEY = 'openflights_airlines_ts';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function fetchAirlines(): Promise<Airline[]> {
  // Try cache first
  try {
    const ts = localStorage.getItem(CACHE_TS_KEY);
    if (ts && Date.now() - parseInt(ts, 10) < CACHE_DURATION) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const airlines = JSON.parse(cached) as Airline[];
        console.log(`Loaded ${airlines.length} Brazil airlines from cache`);
        return airlines;
      }
    }
  } catch {
    // Cache miss, fetch fresh
  }

  try {
    const response = await fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat');
    const text = await response.text();

    const airlines: Airline[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const fields = parseCSVLine(line);
      if (fields.length < 8) continue;

      const airline: Airline = {
        id: parseInt(fields[0]) || 0,
        name: fields[1] || '',
        alias: fields[2] === '\\N' ? '' : fields[2] || '',
        iata: fields[3] === '\\N' ? '' : fields[3] || '',
        icao: fields[4] === '\\N' ? '' : fields[4] || '',
        callsign: fields[5] === '\\N' ? '' : fields[5] || '',
        country: fields[6] || '',
        active: fields[7] === '\\N' ? 'Y' : fields[7] || 'N'
      };

      if (airline.country === 'Brazil' && airline.active === 'Y') {
        airlines.push(airline);
      }
    }

    airlines.sort((a, b) => a.name.localeCompare(b.name));

    // Cache the result
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(airlines));
      localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
    } catch {
      // Storage full — non-critical
    }

    console.log(`Fetched ${airlines.length} Brazil airlines`);
    return airlines;
  } catch (error) {
    console.error('Error fetching airlines:', error);
    // Try stale cache as fallback
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached) as Airline[];
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
