const STORAGE_KEY = 'opensky_flight_data';
const STORAGE_TIMESTAMP_KEY = 'opensky_flight_timestamp';
const STORAGE_API_FAILURE_KEY = 'opensky_api_failure_count';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const EXTENDED_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours when API is unavailable

export interface FlightData {
  time: number;
  states: any[][];
}

export function saveFlightData(data: FlightData): void {
  try {
    if (!data || !data.states || data.states.length === 0) {
      console.warn('⚠️ Not saving empty flight data');
      return;
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
    // Reset API failure count on successful save
    localStorage.removeItem(STORAGE_API_FAILURE_KEY);
    console.log(`💾 Saved ${data.states.length} aircraft to cache`);
  } catch (error) {
    console.error('❌ Error saving flight data:', error);
    // If storage is full, try to clear old data
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('⚠️ Storage quota exceeded, clearing old data...');
      clearFlightData();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        localStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
        console.log('✅ Successfully saved after clearing old data');
      } catch (retryError) {
        console.error('❌ Still unable to save after clearing:', retryError);
      }
    }
  }
}

export function loadFlightData(): FlightData | null {
  try {
    const timestamp = localStorage.getItem(STORAGE_TIMESTAMP_KEY);
    if (!timestamp) {
      return null;
    }
    
    const age = Date.now() - parseInt(timestamp, 10);
    
    // Check if API has been failing - if so, use extended cache duration
    const failureCount = parseInt(localStorage.getItem(STORAGE_API_FAILURE_KEY) || '0', 10);
    const cacheDuration = failureCount > 3 ? EXTENDED_CACHE_DURATION : CACHE_DURATION;
    
    if (age > cacheDuration) {
      console.log(`⏰ Cache expired (age: ${Math.round(age / 1000 / 60)} min, max: ${Math.round(cacheDuration / 1000 / 60)} min)`);
      // Don't delete, just return null - keep data for emergency fallback
      return null;
    }
    
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return null;
    }
    
    const parsed = JSON.parse(data);
    console.log(`📦 Loaded ${parsed.states?.length || 0} aircraft from cache (age: ${Math.round(age / 1000 / 60)} min)`);
    return parsed;
  } catch (error) {
    console.error('❌ Error loading flight data:', error);
    return null;
  }
}

export function loadFlightDataEmergency(): FlightData | null {
  // Emergency fallback - load data regardless of age
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return null;
    }
    
    const parsed = JSON.parse(data);
    const timestamp = localStorage.getItem(STORAGE_TIMESTAMP_KEY);
    const age = timestamp ? Date.now() - parseInt(timestamp, 10) : 0;
    
    console.log(`🚨 Emergency: Loaded ${parsed.states?.length || 0} aircraft from cache (age: ${Math.round(age / 1000 / 60)} min)`);
    return parsed;
  } catch (error) {
    console.error('❌ Error loading emergency flight data:', error);
    return null;
  }
}

export function recordApiFailure(): void {
  try {
    const count = parseInt(localStorage.getItem(STORAGE_API_FAILURE_KEY) || '0', 10);
    localStorage.setItem(STORAGE_API_FAILURE_KEY, (count + 1).toString());
    console.log(`⚠️ API failure count: ${count + 1}`);
  } catch (error) {
    console.error('Error recording API failure:', error);
  }
}

export function clearFlightData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
  } catch (error) {
    console.error('Error clearing flight data:', error);
  }
}

