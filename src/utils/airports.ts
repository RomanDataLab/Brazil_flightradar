// Airport data utilities
// Data source: https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat

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

export async function fetchAirports(): Promise<Airport[]> {
  try {
    const response = await fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat');
    const text = await response.text();
    
    const airports: Airport[] = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Parse CSV line (handling quoted fields)
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
      
      // Filter for Brazil airports
      if (airport.country === 'Brazil' && airport.latitude && airport.longitude) {
        airports.push(airport);
      }
    }
    
    console.log(`✅ Loaded ${airports.length} Brazil airports`);
    return airports;
  } catch (error) {
    console.error('❌ Error fetching airports:', error);
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

