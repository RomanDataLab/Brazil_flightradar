import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import DeckGL from '@deck.gl/react';
import { IconLayer } from '@deck.gl/layers';
import { Map } from 'react-map-gl/maplibre';
import { setCredentials, hasCredentials, getAuthHeader, clearCredentials } from './utils/credentials';
import { fetchBrazilFlights, DATA_INDEX } from './api/opensky';
import { saveFlightData, loadFlightData, loadFlightDataEmergency, recordApiFailure, loadStaticFlightData, loadFlightDataFromVercel, isRateLimited, getCacheAge } from './utils/storage';
import { fetchAirports, Airport } from './utils/airports';
import { fetchAirlines, Airline } from './utils/airlines';
import 'maplibre-gl/dist/maplibre-gl.css';

// Brazil center coordinates
const BRAZIL_CENTER = {
  longitude: -55.0,
  latitude: -10.0
};

const INITIAL_VIEW_STATE = {
  ...BRAZIL_CENTER,
  zoom: 4.2,
  pitch: 45,
  bearing: 0
};

// Dark OpenStreetMap style (CartoDB Dark Matter)
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';

// Update interval: 5 minutes
const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

interface AircraftData {
  position: [number, number, number];
  heading: number;
  icao24: string;
  callsign: string | null;
  altitude: number;
  velocity: number | null;
}

// --- API Key Modal ---
function ApiKeyModal({ onSubmit, onSkip }: { onSubmit: (u: string, p: string) => void; onSkip: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.85)'
    }}>
      <div style={{
        background: '#1a1a2e', borderRadius: 8, padding: 32,
        maxWidth: 420, width: '90%', color: '#fff', fontFamily: 'monospace'
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>OpenSky API Credentials</h2>
        <p style={{ fontSize: 13, opacity: 0.7, margin: '0 0 20px' }}>
          Enter your OpenSky Network credentials for higher API rate limits.
          Without credentials, you get ~400 requests/day (anonymous).
          With credentials, you get significantly more.
        </p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Username</label>
          <input
            type="text" value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="OpenSky username"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 4,
              border: '1px solid #444', background: '#0d0d1a', color: '#fff',
              fontFamily: 'monospace', fontSize: 14, boxSizing: 'border-box'
            }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Password</label>
          <input
            type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="OpenSky password"
            onKeyDown={e => { if (e.key === 'Enter' && username && password) onSubmit(username, password); }}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 4,
              border: '1px solid #444', background: '#0d0d1a', color: '#fff',
              fontFamily: 'monospace', fontSize: 14, boxSizing: 'border-box'
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => { if (username && password) onSubmit(username, password); }}
            disabled={!username || !password}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 4, border: 'none',
              background: username && password ? '#4CAF50' : '#333',
              color: '#fff', cursor: username && password ? 'pointer' : 'not-allowed',
              fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold'
            }}
          >
            Connect
          </button>
          <button
            onClick={onSkip}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 4,
              border: '1px solid #555', background: 'transparent',
              color: '#aaa', cursor: 'pointer', fontFamily: 'monospace', fontSize: 14
            }}
          >
            Skip (use cached)
          </button>
        </div>
        <p style={{ fontSize: 11, opacity: 0.5, margin: '16px 0 0', textAlign: 'center' }}>
          Credentials are only sent to the server proxy — never exposed in client code.
          Register at opensky-network.org
        </p>
      </div>
    </div>
  );
}

function App() {
  const [aircraftData, setAircraftData] = useState<AircraftData[]>([]);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cacheStatus, setCacheStatus] = useState<string>('');
  const [airports, setAirports] = useState<Airport[]>([]);
  const [airlines, setAirlines] = useState<Airline[]>([]);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Fix #9: request deduplication
  const fetchInProgress = useRef(false);

  // On mount: check if we have cached data, show modal if no creds configured
  useEffect(() => {
    (async () => {
      // Load airports & airlines (cached with 7-day TTL)
      fetchAirports().then(setAirports);
      fetchAirlines().then(setAirlines);

      // Check if server has creds configured (env vars)
      // If not, and no cached data, show the API key modal
      const cached = await loadFlightData();
      if (cached && cached.states && cached.states.length > 0) {
        // We have cached data, show it immediately
        processFlightData(cached);
        const age = await getCacheAge();
        setCacheStatus(`Loaded from cache (${Math.round(age / 1000 / 60)} min old)`);
        setInitialized(true);
        setIsLoading(false);
      } else {
        // No cached data — show API key prompt
        setShowApiKeyModal(true);
        setIsLoading(false);
      }
    })();
  }, []);

  const handleApiKeySubmit = useCallback((username: string, password: string) => {
    setCredentials({ username, password });
    setShowApiKeyModal(false);
    setInitialized(true);
  }, []);

  const handleApiKeySkip = useCallback(async () => {
    setShowApiKeyModal(false);
    setInitialized(true);
    // Try emergency/static fallbacks
    let data = await loadFlightDataEmergency();
    if (!data) data = await loadFlightDataFromVercel();
    if (!data) data = await loadStaticFlightData();
    if (data && data.states && data.states.length > 0) {
      processFlightData(data);
      setCacheStatus('Using fallback data (no API credentials)');
    } else {
      setCacheStatus('No cached data available');
    }
  }, []);

  // Process flight data into deck.gl format
  const processFlightData = useCallback((data: { time: number; states: any[][] }) => {
    if (!data || !data.states || !Array.isArray(data.states)) return;

    const aircraft: AircraftData[] = [];
    data.states.forEach((state, index) => {
      if (!state || !Array.isArray(state)) return;

      const lon = state[DATA_INDEX.LONGITUDE];
      const lat = state[DATA_INDEX.LATITUDE];
      const baroAltitude = state[DATA_INDEX.BARO_ALTITUDE];
      const trueTrack = state[DATA_INDEX.TRUE_TRACK];
      const icao24 = state[DATA_INDEX.ICAO24];
      const callsign = state[DATA_INDEX.CALLSIGN];
      const velocity = state[DATA_INDEX.VELOCITY];

      if (lon === null || lat === null || baroAltitude === null) return;

      aircraft.push({
        position: [lon, lat, baroAltitude / 100],
        heading: trueTrack !== null ? trueTrack : 0,
        icao24: icao24 || `unknown-${index}`,
        callsign: callsign ? callsign.trim() : null,
        altitude: baroAltitude,
        velocity: velocity || null
      });
    });

    setAircraftData(aircraft);
    console.log(`Processed ${aircraft.length} aircraft`);
  }, []);

  // Fetch flight data with deduplication
  const fetchData = useCallback(async () => {
    // Fix #9: prevent concurrent fetches
    if (fetchInProgress.current) return;
    fetchInProgress.current = true;

    try {
      setIsLoading(true);
      setError(null);

      // Fix #1: skip API call if currently rate-limited
      const rateLimited = await isRateLimited();
      if (rateLimited) {
        console.log('Rate-limited: using cached data');
        const cached = await loadFlightData();
        if (cached && cached.states && cached.states.length > 0) {
          processFlightData(cached);
          const age = await getCacheAge();
          setCacheStatus(`Rate-limited — using cache (${Math.round(age / 1000 / 60)} min old)`);
        }
        return;
      }

      // Try cached data first for immediate display
      const cachedData = await loadFlightData();
      if (cachedData && cachedData.states && cachedData.states.length > 0) {
        const age = await getCacheAge();
        processFlightData(cachedData);
        setCacheStatus(`Loaded from cache (${Math.round(age / 1000 / 60)} min old)`);
      }

      // Fetch fresh data — credentials go through the server-side proxy
      const authHeader = getAuthHeader();
      const data = await fetchBrazilFlights(authHeader);

      if (data.states.length === 0) {
        console.warn('No aircraft found in response');
        return;
      }

      await saveFlightData(data);
      setCacheStatus(`Live: ${data.states.length} aircraft`);
      processFlightData(data);
    } catch (err: any) {
      console.error('Error fetching flights:', err);
      setError(err.message || 'Failed to fetch flight data');

      // Fix #1: record failure with status code
      const statusCode = err.message?.includes('429') ? 429 : undefined;
      await recordApiFailure(statusCode);

      // Fallback chain
      let fallback = await loadFlightData();
      if (!fallback?.states?.length) fallback = await loadFlightDataEmergency();
      if (!fallback?.states?.length) fallback = await loadFlightDataFromVercel();
      if (!fallback?.states?.length) fallback = await loadStaticFlightData();

      if (fallback && fallback.states && fallback.states.length > 0) {
        const age = await getCacheAge();
        setCacheStatus(`API error — using cache (${Math.round(age / 1000 / 60)} min old)`);
        processFlightData(fallback);
      } else {
        setCacheStatus('No cached data available');
        setAircraftData([]);
      }
    } finally {
      setIsLoading(false);
      fetchInProgress.current = false;
    }
  }, [processFlightData]);

  // Start fetching once initialized
  useEffect(() => {
    if (!initialized) return;
    fetchData();
  }, [initialized, fetchData]);

  // Periodic updates
  useEffect(() => {
    if (!initialized) return;
    const interval = setInterval(fetchData, UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [initialized, fetchData]);

  // Icon layer for aircraft
  const iconLayer = useMemo(() => {
    if (!aircraftData.length) return null;
    return new IconLayer({
      id: 'aircraft-icon-layer',
      data: aircraftData,
      getPosition: (d: AircraftData) => [d.position[0], d.position[1]],
      getIcon: () => ({
        url: '/airplane.svg',
        width: 16,
        height: 16,
        anchorY: 8
      }),
      getAngle: (d: AircraftData) => -d.heading,
      sizeScale: 8,
      sizeMinPixels: 16,
      sizeMaxPixels: 64,
      pickable: true
    });
  }, [aircraftData]);

  // Airports layer
  const airportsLayer = useMemo(() => {
    if (!airports.length) return null;

    const isInternational = (airport: Airport): boolean => {
      const nameLower = airport.name.toLowerCase();
      const typeLower = airport.type.toLowerCase();
      return nameLower.includes('international') ||
             nameLower.includes('internacional') ||
             typeLower.includes('international');
    };

    return new IconLayer({
      id: 'airports-layer',
      data: airports,
      getPosition: (d: Airport) => [d.longitude, d.latitude],
      getIcon: (d: Airport) => ({
        url: isInternational(d) ? '/airport-yellow.svg' : '/airport.svg',
        width: 32,
        height: 32,
        anchorY: 16,
        mask: false
      }),
      getSize: (d: Airport) => isInternational(d) ? 2 : 1,
      sizeScale: 2,
      sizeMinPixels: 16,
      sizeMaxPixels: 64,
      pickable: true
    });
  }, [airports]);

  // Tooltip
  const getTooltip = useCallback((info: any) => {
    if (!info.object) return null;

    if ('name' in info.object && 'city' in info.object) {
      const airport = info.object as Airport;
      return {
        html: `
          <div style="padding: 8px; font-family: monospace; font-size: 12px;">
            <div><strong>${airport.name}</strong></div>
            <div>City: ${airport.city}</div>
            ${airport.iata ? `<div>IATA: ${airport.iata}</div>` : ''}
            ${airport.icao ? `<div>ICAO: ${airport.icao}</div>` : ''}
            <div>Altitude: ${Math.round(airport.altitude)} ft</div>
          </div>
        `,
        style: { backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white', borderRadius: '4px' }
      };
    }

    const aircraft = info.object as AircraftData;
    return {
      html: `
        <div style="padding: 8px; font-family: monospace; font-size: 12px;">
          <div><strong>Callsign:</strong> ${aircraft.callsign || 'Unknown'}</div>
          <div><strong>ICAO24:</strong> ${aircraft.icao24}</div>
          <div><strong>Altitude:</strong> ${Math.round(aircraft.altitude)} m</div>
          <div><strong>Speed:</strong> ${aircraft.velocity ? Math.round(aircraft.velocity * 3.6) : 'N/A'} km/h</div>
        </div>
      `,
      style: { backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white', borderRadius: '4px' }
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {showApiKeyModal && (
        <ApiKeyModal onSubmit={handleApiKeySubmit} onSkip={handleApiKeySkip} />
      )}

      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        viewState={viewState}
        onViewStateChange={({ viewState: newViewState }) => {
          if (newViewState) setViewState(newViewState as typeof INITIAL_VIEW_STATE);
        }}
        controller={true}
        layers={[
          ...(airportsLayer ? [airportsLayer] : []),
          ...(iconLayer ? [iconLayer] : [])
        ]}
        getTooltip={getTooltip}
      >
        <Map
          mapStyle={MAP_STYLE}
          reuseMaps={true}
          longitude={viewState.longitude}
          latitude={viewState.latitude}
          zoom={viewState.zoom}
          pitch={viewState.pitch}
          bearing={viewState.bearing}
          onError={(e) => {
            console.error('Map error:', e);
            setError(`Map error: ${e.error?.message || 'Unknown error'}`);
          }}
        />
      </DeckGL>

      {error && (
        <div style={{
          position: 'absolute', top: 10, left: 10, padding: 10,
          backgroundColor: 'rgba(255, 0, 0, 0.8)', color: 'white',
          borderRadius: 4, fontFamily: 'monospace', fontSize: 12, zIndex: 1000
        }}>
          {error}
        </div>
      )}

      {isLoading && !showApiKeyModal && (
        <div style={{
          position: 'absolute', top: 10, right: 10, padding: 10,
          backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white',
          borderRadius: 4, fontFamily: 'monospace', fontSize: 12, zIndex: 1000
        }}>
          Loading...
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 10, left: 10, padding: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white',
        borderRadius: 4, fontFamily: 'monospace', fontSize: 12, zIndex: 1000
      }}>
        <div>Aircraft: {aircraftData.length}</div>
        <div>Airports: {airports.length}</div>
        <div>Updates every 5 min</div>
        {cacheStatus && <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>{cacheStatus}</div>}
        <button
          onClick={() => {
            clearCredentials();
            setShowApiKeyModal(true);
          }}
          style={{
            marginTop: 8, padding: '4px 8px', borderRadius: 4,
            border: '1px solid #555', background: 'transparent',
            color: '#aaa', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11
          }}
        >
          {hasCredentials() ? 'Change API Key' : 'Set API Key'}
        </button>
      </div>

      {/* Airlines Legend */}
      {airlines.length > 0 && (
        <div style={{
          position: 'absolute', top: 10, right: 10, padding: 10,
          backgroundColor: 'rgba(0, 0, 0, 0.9)', color: 'white',
          borderRadius: 4, fontFamily: 'monospace', fontSize: 11, zIndex: 1000,
          maxHeight: '80vh', overflowY: 'auto', minWidth: 200, maxWidth: 300
        }}>
          <div style={{
            fontWeight: 'bold', marginBottom: 8, fontSize: 12,
            borderBottom: '1px solid rgba(255,255,255,0.3)', paddingBottom: 4
          }}>
            Brazil Airlines ({airlines.length})
          </div>
          {airlines.map((airline, index) => (
            <div
              key={airline.id || index}
              style={{
                padding: '4px 0',
                borderBottom: index < airlines.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none'
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{airline.name}</div>
              {(airline.iata || airline.icao) && (
                <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>
                  {airline.iata && `IATA: ${airline.iata}`}
                  {airline.iata && airline.icao && ' | '}
                  {airline.icao && `ICAO: ${airline.icao}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
