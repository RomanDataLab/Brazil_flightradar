// Airline data utilities
// Data source: https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat

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

export async function fetchAirlines(): Promise<Airline[]> {
  try {
    const response = await fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat');
    const text = await response.text();
    
    const airlines: Airline[] = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Parse CSV line (handling quoted fields)
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
      
      // Filter for Brazil-based airlines (active only)
      if (airline.country === 'Brazil' && airline.active === 'Y') {
        airlines.push(airline);
      }
    }
    
    // Sort by name
    airlines.sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`✅ Loaded ${airlines.length} Brazil airlines`);
    return airlines;
  } catch (error) {
    console.error('❌ Error fetching airlines:', error);
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

