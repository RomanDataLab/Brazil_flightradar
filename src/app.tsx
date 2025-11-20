import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import DeckGL from '@deck.gl/react';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { Map } from 'react-map-gl/maplibre';
import { loadCredentials, getAuthHeader } from './utils/credentials';
import { fetchBrazilFlights, DATA_INDEX } from './api/opensky';
import { saveFlightData, loadFlightData, loadFlightDataEmergency, recordApiFailure } from './utils/storage';
import { fetchAirports, Airport } from './utils/airports';
import { fetchAirlines, Airline } from './utils/airlines';
import 'maplibre-gl/dist/maplibre-gl.css';

// Airplane 3D model URL - try local file first, then fallback to remote
// Local model file in public folder
const AIRPLANE_MODEL_URL = '/airplane.glb';

// Brazil center coordinates
const BRAZIL_CENTER = {
  longitude: -55.0,
  latitude: -10.0
};

// Initial view state - tilted view to see 3D planes (pitch: 45)
const INITIAL_VIEW_STATE = {
  ...BRAZIL_CENTER,
  zoom: 4.2,
  pitch: 45, // Tilted view to see 3D planes better
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

function App() {
  const [aircraftData, setAircraftData] = useState<AircraftData[]>([]);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [hoverInfo, setHoverInfo] = useState<any>(null);
  const [credentials, setCredentials] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cacheStatus, setCacheStatus] = useState<string>('');
  const [useIconFallback, setUseIconFallback] = useState(false);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [airlines, setAirlines] = useState<Airline[]>([]);

  // Load credentials, airports, and airlines on mount
  useEffect(() => {
    loadCredentials().then(creds => {
      setCredentials(creds);
      console.log('✅ Credentials loaded');
    }).catch(err => {
      console.error('❌ Failed to load credentials:', err);
      setError('Failed to load credentials');
    });
    
    // Load airports
    fetchAirports().then(data => {
      setAirports(data);
    });
    
    // Load airlines
    fetchAirlines().then(data => {
      setAirlines(data);
    });
    
    setIsLoading(false);
  }, []);

  // Fetch flight data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Try to load cached data first (for immediate display)
      const cachedData = loadFlightData();
      if (cachedData && cachedData.states && cachedData.states.length > 0) {
        const timestamp = localStorage.getItem('opensky_flight_timestamp');
        const age = timestamp ? Date.now() - parseInt(timestamp, 10) : 0;
        const ageMinutes = Math.round(age / 1000 / 60);
        console.log(`📦 Using cached flight data: ${cachedData.states.length} aircraft`);
        setCacheStatus(`📦 Loaded from cache (${ageMinutes} min old)`);
        processFlightData(cachedData);
      }

      // Try to fetch fresh data (with or without credentials)
      const authHeader = credentials ? getAuthHeader(credentials) : null;
      console.log('🔄 Fetching flight data...', authHeader ? 'with credentials' : 'without credentials');
      
      const data = await fetchBrazilFlights(authHeader);
      
      console.log(`✅ Fetched ${data.states.length} aircraft states`);
      
      if (data.states.length === 0) {
        console.warn('⚠️ No aircraft found in response');
        // Keep using cached data if available, but don't save empty data
        return;
      }
      
      // Save to cache (always save successful API responses)
      saveFlightData(data);
      setCacheStatus(`✅ Saved ${data.states.length} aircraft`);
      
      // Process and update aircraft data
      processFlightData(data);
    } catch (err: any) {
      console.error('❌ Error fetching flights:', err);
      setError(err.message || 'Failed to fetch flight data');
      
      // Record API failure for extended cache duration
      recordApiFailure();
      
      // Try to use cached data as fallback (normal cache first)
      let cachedData = loadFlightData();
      
      // If normal cache expired, try emergency fallback (any cached data)
      if (!cachedData || !cachedData.states || cachedData.states.length === 0) {
        console.log('🔄 Normal cache expired, trying emergency fallback...');
        cachedData = loadFlightDataEmergency();
      }
      
      if (cachedData && cachedData.states && cachedData.states.length > 0) {
        const timestamp = localStorage.getItem('opensky_flight_timestamp');
        const age = timestamp ? Date.now() - parseInt(timestamp, 10) : Infinity;
        const ageMinutes = Math.round(age / 1000 / 60);
        console.log(`📦 Using cached data as fallback: ${cachedData.states.length} aircraft (age: ${ageMinutes} min)`);
        setCacheStatus(`📦 Using cached data (${ageMinutes} min old)`);
        processFlightData(cachedData);
      } else {
        console.warn('⚠️ No cached data available - showing empty map');
        setCacheStatus('⚠️ No cached data available');
        setAircraftData([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [credentials]);

  // Process flight data and transform to deck.gl format
  const processFlightData = useCallback((data: { time: number; states: any[][] }) => {
    if (!data || !data.states || !Array.isArray(data.states)) {
      console.error('❌ Invalid data format:', data);
      return;
    }

    const aircraft: AircraftData[] = [];

    data.states.forEach((state, index) => {
      if (!state || !Array.isArray(state)) {
        console.warn(`⚠️ Invalid state at index ${index}:`, state);
        return;
      }

      const lon = state[DATA_INDEX.LONGITUDE];
      const lat = state[DATA_INDEX.LATITUDE];
      const baroAltitude = state[DATA_INDEX.BARO_ALTITUDE];
      const trueTrack = state[DATA_INDEX.TRUE_TRACK];
      const icao24 = state[DATA_INDEX.ICAO24];
      const callsign = state[DATA_INDEX.CALLSIGN];
      const velocity = state[DATA_INDEX.VELOCITY];

      if (lon === null || lat === null || baroAltitude === null) {
        return;
      }

      // Scale altitude for visibility - planes fly at 10-12km but need scaling for deck.gl
      // deck.gl uses meters, but at zoom 4.2, we need to scale down for visibility
      // Scale: divide by 100 so 10km becomes 100 units
      const altitude = baroAltitude / 100;

      // Convert heading from degrees (0-360) to deck.gl format
      // deck.gl orientation: [pitch, yaw, roll] in degrees
      // yaw: 0 = north, clockwise is positive
      const heading = trueTrack !== null ? trueTrack : 0;

      aircraft.push({
        position: [lon, lat, altitude],
        heading,
        icao24: icao24 || `unknown-${index}`,
        callsign: callsign ? callsign.trim() : null,
        altitude: baroAltitude, // Keep original altitude for display
        velocity: velocity || null
      });
    });

    setAircraftData(aircraft);
    console.log(`✈️ Processed ${aircraft.length} aircraft`);
    if (aircraft.length > 0) {
      console.log('📍 Sample aircraft:', aircraft[0]);
    }
  }, []);

  // Initial data fetch (try even without credentials)
  useEffect(() => {
    // Wait a bit for credentials to load, then fetch
    const timer = setTimeout(() => {
      fetchData();
    }, 1000);
    return () => clearTimeout(timer);
  }, [fetchData]);

  // Set up periodic updates
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('🔄 Updating flight data...');
      fetchData();
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchData]);


  // Create icon layer for airplane display
  const iconLayer = useMemo(() => {
    if (!aircraftData.length) {
      return null;
    }
    
    console.log('✈️ Creating icon layer with', aircraftData.length, 'aircraft');
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
      getAngle: (d: AircraftData) => -d.heading, // Rotate icon based on heading
      sizeScale: 8, // Increased scale since icon is smaller (16x16)
      sizeMinPixels: 16,
      sizeMaxPixels: 64,
      pickable: true,
      onHover: (info: any) => {
        setHoverInfo(info);
        if (info.object) {
          console.log('🖱️ Hovered aircraft:', info.object);
        }
      }
    });
  }, [aircraftData]);

  // Create airports layer
  const airportsLayer = useMemo(() => {
    if (!airports.length) {
      console.log('⚠️ No airports data available');
      return null;
    }
    
    // Helper function to check if airport is international
    const isInternational = (airport: Airport): boolean => {
      const nameLower = airport.name.toLowerCase();
      const typeLower = airport.type.toLowerCase();
      return nameLower.includes('international') || 
             nameLower.includes('internacional') ||
             typeLower.includes('international');
    };

    const internationalCount = airports.filter(isInternational).length;
    console.log('🏢 Creating airports layer with', airports.length, 'airports');
    console.log('🌍 International airports:', internationalCount);
    console.log('📍 Sample airport:', airports[0]);
    
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
      getSize: (d: Airport) => isInternational(d) ? 2 : 1, // 2x size for international
      sizeScale: 2,
      sizeMinPixels: 16, // Min size for regular airports
      sizeMaxPixels: 64, // Max size to accommodate 2x international airports
      pickable: true,
      onHover: (info: any) => {
        if (info.object) {
          setHoverInfo(info);
          const airport = info.object as Airport;
          console.log('🖱️ Hovered airport:', airport.name, isInternational(airport) ? '(International)' : '(Domestic)');
        }
      },
      onError: (error: any) => {
        console.error('❌ Airport icon error:', error);
      }
    });
  }, [airports]);

  // Create scenegraph layer (3D models) - only if model file exists
  const scenegraphLayer = useMemo(() => {
    // Skip 3D layer for now, use icons instead
    // if (!aircraftData.length || useIconFallback) {
    //   return null;
    // }
    return null; // Disable 3D models, use icons instead

    console.log(`✈️ Creating scenegraph layer with ${aircraftData.length} aircraft`);
    if (aircraftData.length > 0) {
      console.log('📍 First aircraft position:', JSON.stringify(aircraftData[0]?.position));
      console.log('📍 First aircraft heading:', aircraftData[0]?.heading);
      console.log('📍 First aircraft altitude (original):', aircraftData[0]?.altitude);
    }
    
    // Use all aircraft data - ensure positions are valid
    const processedData = aircraftData.filter(d => {
      const pos = d.position;
      return pos && pos.length >= 2 && 
             typeof pos[0] === 'number' && 
             typeof pos[1] === 'number' &&
             !isNaN(pos[0]) && !isNaN(pos[1]);
    }).map((d) => ({
      ...d,
      position: [d.position[0], d.position[1], d.position[2] || 0] as [number, number, number]
    }));
    
    console.log('🧪 Processing', processedData.length, 'valid aircraft');
    if (processedData.length > 0) {
      console.log('📍 Sample positions:', processedData.slice(0, 3).map(d => ({
        lon: d.position[0],
        lat: d.position[1],
        alt: d.position[2]
      })));
    }
    
    return new ScenegraphLayer({
      id: 'aircraft-layer',
      data: processedData,
      scenegraph: AIRPLANE_MODEL_URL,
      loadOptions: {
        fetch: {
          mode: 'cors'
        }
      },
      getPosition: (d: AircraftData) => d.position,
      getOrientation: (d: AircraftData) => {
        // deck.gl orientation: [pitch, yaw, roll] in degrees
        // Based on deck.gl scenegraph example: [0, -heading, 90]
        // pitch: 0 = level flight
        // yaw: negative because deck.gl yaw is counter-clockwise from north
        // roll: 90 degrees to orient airplane correctly (wings horizontal)
        const yaw = -d.heading; // Convert clockwise heading to counter-clockwise yaw
        return [0, yaw, 90];
      },
      getScale: [1, 1, 1],
      sizeScale: 500,
      sizeMinPixels: 10,
      sizeMaxPixels: 200,
      _animations: {
        '*': {
          speed: 1
        }
      },
      _lighting: 'pbr',
      pickable: true,
      onHover: (info: any) => {
        setHoverInfo(info);
        if (info.object) {
          console.log('🖱️ Hovered aircraft:', info.object);
        }
      },
      onError: (error: any) => {
        console.error('❌ ScenegraphLayer error:', error);
        if (error.message && error.message.includes('404')) {
          console.warn('⚠️ Model URL failed (404), switching to icon fallback...');
          setUseIconFallback(true);
        }
      }
    });
  }, [aircraftData, useIconFallback]);

  // Get tooltip content
  const getTooltip = useCallback((info: any) => {
    if (!info.object) return null;

    // Check if it's an airport
    if ('name' in info.object && 'city' in info.object) {
      const airport = info.object as Airport;
      return {
        html: `
          <div style="padding: 8px; font-family: monospace; font-size: 12px;">
            <div><strong>${airport.name}</strong></div>
            <div>City: ${airport.city}</div>
            ${airport.iata && `<div>IATA: ${airport.iata}</div>`}
            ${airport.icao && `<div>ICAO: ${airport.icao}</div>`}
            <div>Altitude: ${Math.round(airport.altitude)} ft</div>
          </div>
        `,
        style: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          borderRadius: '4px'
        }
      };
    }

    // Otherwise it's an aircraft
    const aircraft = info.object as AircraftData;
    const callsign = aircraft.callsign || 'Unknown';
    const altitude = Math.round(aircraft.altitude);
    const velocity = aircraft.velocity ? Math.round(aircraft.velocity * 3.6) : 'N/A'; // Convert m/s to km/h

    return {
      html: `
        <div style="padding: 8px; font-family: monospace; font-size: 12px;">
          <div><strong>Callsign:</strong> ${callsign}</div>
          <div><strong>ICAO24:</strong> ${aircraft.icao24}</div>
          <div><strong>Altitude:</strong> ${altitude} m</div>
          <div><strong>Speed:</strong> ${velocity} km/h</div>
        </div>
      `,
      style: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        borderRadius: '4px'
      }
    };
  }, []);

  useEffect(() => {
    console.log('🗺️ Map style:', MAP_STYLE);
    console.log('📍 View state:', viewState);
    console.log('✈️ Aircraft count:', aircraftData.length);
    console.log('🔍 ScenegraphLayer exists:', scenegraphLayer !== null);
    if (scenegraphLayer) {
      console.log('🔍 ScenegraphLayer ID:', scenegraphLayer.id);
      console.log('🔍 ScenegraphLayer data length:', scenegraphLayer.props?.data?.length);
    }
  }, [viewState, aircraftData.length, scenegraphLayer]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        viewState={viewState}
        onViewStateChange={({ viewState }) => setViewState(viewState)}
        controller={true}
        layers={[
          ...(airportsLayer ? [airportsLayer] : []),
          ...(scenegraphLayer ? [scenegraphLayer] : []),
          ...(iconLayer ? [iconLayer] : [])
        ]}
        getTooltip={getTooltip}
        onLoad={() => {
          console.log('✅ DeckGL loaded');
          console.log('🔍 Layers count:', scenegraphLayer ? 1 : 0);
          if (scenegraphLayer) {
            console.log('🔍 ScenegraphLayer props:', {
              dataLength: scenegraphLayer.props?.data?.length,
              scenegraph: scenegraphLayer.props?.scenegraph,
              sizeScale: scenegraphLayer.props?.sizeScale
            });
          }
        }}
        onError={(error) => {
          console.error('❌ DeckGL error:', error);
        }}
      >
        <Map
          mapStyle={MAP_STYLE}
          reuseMaps={true}
          preventStyleDiffing={true}
          longitude={viewState.longitude}
          latitude={viewState.latitude}
          zoom={viewState.zoom}
          pitch={viewState.pitch}
          bearing={viewState.bearing}
          onLoad={() => {
            console.log('✅ Map loaded successfully');
            setIsLoading(false);
          }}
          onError={(e) => {
            console.error('❌ Map error:', e);
            setError(`Map error: ${e.error?.message || 'Unknown error'}`);
          }}
        />
      </DeckGL>
      
      {error && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          padding: '10px',
          backgroundColor: 'rgba(255, 0, 0, 0.8)',
          color: 'white',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '12px',
          zIndex: 1000
        }}>
          ⚠️ {error}
        </div>
      )}
      
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          padding: '10px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '12px',
          zIndex: 1000
        }}>
          🔄 Loading...
        </div>
      )}
      
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        padding: '10px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '12px',
        zIndex: 1000
      }}>
        <div>✈️ Aircraft: {aircraftData.length}</div>
        <div>🏢 Airports: {airports.length}</div>
        <div>🔄 Updates every 5 min</div>
        {cacheStatus && <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.8 }}>{cacheStatus}</div>}
      </div>
      
      {/* Airlines Legend */}
      {airlines.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          padding: '10px',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '11px',
          zIndex: 1000,
          maxHeight: '80vh',
          overflowY: 'auto',
          minWidth: '200px',
          maxWidth: '300px'
        }}>
          <div style={{ 
            fontWeight: 'bold', 
            marginBottom: '8px', 
            fontSize: '12px',
            borderBottom: '1px solid rgba(255,255,255,0.3)',
            paddingBottom: '4px'
          }}>
            🇧🇷 Brazil Airlines ({airlines.length})
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
                <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>
                  {airline.iata && `IATA: ${airline.iata}`}
                  {airline.iata && airline.icao && ' • '}
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

