// IndexedDB-based storage (supports up to 10GB+ depending on browser/disk)
// Falls back to localStorage if IndexedDB is unavailable

const DB_NAME = 'airflight_db';
const DB_VERSION = 1;
const STORE_NAME = 'flight_data';
const FLIGHT_DATA_KEY = 'current_flight_data';
const METADATA_KEY = 'metadata';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
// When API rate-limited (429), cache until daily reset (~24h from first failure)
const RATE_LIMIT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export interface FlightData {
  time: number;
  states: any[][];
}

interface FlightMetadata {
  timestamp: number;
  apiFailureCount: number;
  rateLimitedUntil: number | null; // epoch ms when rate limit resets
}

// --- IndexedDB helpers ---

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// --- Metadata ---

async function getMetadata(): Promise<FlightMetadata> {
  try {
    const meta = await idbGet<FlightMetadata>(METADATA_KEY);
    return meta || { timestamp: 0, apiFailureCount: 0, rateLimitedUntil: null };
  } catch {
    return { timestamp: 0, apiFailureCount: 0, rateLimitedUntil: null };
  }
}

async function setMetadata(meta: FlightMetadata): Promise<void> {
  try {
    await idbSet(METADATA_KEY, meta);
  } catch (error) {
    console.error('Failed to save metadata:', error);
  }
}

// --- Public API ---

export async function saveFlightData(data: FlightData): Promise<void> {
  if (!data || !data.states || data.states.length === 0) {
    console.warn('Not saving empty flight data');
    return;
  }

  try {
    await idbSet(FLIGHT_DATA_KEY, data);
    await setMetadata({
      timestamp: Date.now(),
      apiFailureCount: 0,
      rateLimitedUntil: null
    });
    console.log(`Saved ${data.states.length} aircraft to IndexedDB`);

    // Also sync to Vercel in the background (non-blocking)
    saveFlightDataToVercel(data).catch(err => {
      console.debug('Vercel sync failed (non-critical):', err);
    });
  } catch (error) {
    console.error('Error saving flight data to IndexedDB:', error);
    // Fallback to localStorage
    try {
      localStorage.setItem('opensky_flight_data', JSON.stringify(data));
      localStorage.setItem('opensky_flight_timestamp', Date.now().toString());
    } catch (lsError) {
      console.error('localStorage fallback also failed:', lsError);
    }
  }
}

export async function loadFlightData(): Promise<FlightData | null> {
  try {
    const meta = await getMetadata();
    if (!meta.timestamp) return null;

    const age = Date.now() - meta.timestamp;

    // If rate-limited, use extended cache duration until limit resets
    let cacheDuration = CACHE_DURATION;
    if (meta.rateLimitedUntil && Date.now() < meta.rateLimitedUntil) {
      cacheDuration = meta.rateLimitedUntil - meta.timestamp;
      console.log(`Rate-limited: using cached data until ${new Date(meta.rateLimitedUntil).toLocaleTimeString()}`);
    } else if (meta.apiFailureCount > 3) {
      cacheDuration = RATE_LIMIT_CACHE_DURATION;
    }

    if (age > cacheDuration) {
      console.log(`Cache expired (age: ${Math.round(age / 1000 / 60)} min)`);
      return null;
    }

    const data = await idbGet<FlightData>(FLIGHT_DATA_KEY);
    if (data && data.states) {
      console.log(`Loaded ${data.states.length} aircraft from cache (age: ${Math.round(age / 1000 / 60)} min)`);
    }
    return data;
  } catch {
    return null;
  }
}

export async function loadFlightDataEmergency(): Promise<FlightData | null> {
  try {
    const data = await idbGet<FlightData>(FLIGHT_DATA_KEY);
    if (data && data.states) {
      const meta = await getMetadata();
      const age = meta.timestamp ? Date.now() - meta.timestamp : 0;
      console.log(`Emergency: Loaded ${data.states.length} aircraft (age: ${Math.round(age / 1000 / 60)} min)`);
    }
    return data;
  } catch {
    // Try localStorage fallback
    try {
      const raw = localStorage.getItem('opensky_flight_data');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export async function recordApiFailure(statusCode?: number): Promise<void> {
  const meta = await getMetadata();
  meta.apiFailureCount += 1;

  // If rate-limited (429), set a reset time ~24h from now
  if (statusCode === 429) {
    meta.rateLimitedUntil = Date.now() + RATE_LIMIT_CACHE_DURATION;
    console.log(`Rate limited (429). Caching data until ${new Date(meta.rateLimitedUntil).toLocaleTimeString()}`);
  }

  await setMetadata(meta);
  console.log(`API failure count: ${meta.apiFailureCount}`);
}

export async function isRateLimited(): Promise<boolean> {
  const meta = await getMetadata();
  return !!(meta.rateLimitedUntil && Date.now() < meta.rateLimitedUntil);
}

export async function getCacheAge(): Promise<number> {
  const meta = await getMetadata();
  return meta.timestamp ? Date.now() - meta.timestamp : Infinity;
}

export async function loadStaticFlightData(): Promise<FlightData | null> {
  try {
    const response = await fetch('/flight-data-fallback.json');
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.states && Array.isArray(data.states)) {
      console.log(`Loaded ${data.states.length} aircraft from static fallback`);
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

// Vercel storage functions

export async function saveFlightDataToVercel(data: FlightData): Promise<boolean> {
  if (!data || !data.states || data.states.length === 0) return false;

  try {
    const response = await fetch('/api/flight-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time: data.time, states: data.states })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // Check if data was actually persisted
      if (result.persisted === false) {
        console.warn('Vercel acknowledged data but did NOT persist (KV not configured)');
        return false;
      }
      console.log(`Saved ${data.states.length} aircraft to Vercel storage`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function loadFlightDataFromVercel(): Promise<FlightData | null> {
  try {
    const cacheKey = 'vercel_storage_checked';
    if (sessionStorage.getItem(cacheKey)) return null;

    const response = await fetch('/api/flight-data', { cache: 'no-cache' });
    sessionStorage.setItem(cacheKey, 'true');

    if (!response.ok) return null;

    const result = await response.json();
    if (result.success && result.data && result.data.states && Array.isArray(result.data.states)) {
      console.log(`Loaded ${result.data.states.length} aircraft from Vercel storage`);
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}
