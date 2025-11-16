import React, { useState, useEffect, useMemo, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { Map, Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CiAirportSign1 } from 'react-icons/ci';
import { fetchAllFlightsBrazil, jenksBreaks, getBrazilAirports } from './api/opensky';
import { MAPBOX_TOKEN } from './config/mapbox';
import { saveFlightsToGitHub, loadFlightsFromGitHub, deleteFlightsFromGitHub } from './api/github';
import { loadCredentials, getOpenskyCredentials, getGitHubToken, logCredentialStatus } from './utils/credentials';

// Center of Brazil
const BRAZIL_CENTER = {
  longitude: -51.9253,
  latitude: -14.2350
};

// Initial view state centered on Brazil
const INITIAL_VIEW_STATE = {
  longitude: BRAZIL_CENTER.longitude,
  latitude: BRAZIL_CENTER.latitude,
  zoom: 4.5,
  pitch: 50,
  bearing: 0
};

function App() {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [hoveredObject, setHoveredObject] = useState(null);
  const [hoveredPosition, setHoveredPosition] = useState(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [rateLimitUntil, setRateLimitUntil] = useState(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const mapRef = useRef(null);

  useEffect(() => {
    async function loadAircraft() {
      // Check if we're still rate limited
      const rateLimitUntilStr = localStorage.getItem('rateLimitUntil');
      if (rateLimitUntilStr) {
        const rateLimitUntil = new Date(rateLimitUntilStr);
        if (new Date() < rateLimitUntil) {
          console.log('Still rate limited, loading from GitHub...');
          setRateLimited(true);
          setRateLimitUntil(rateLimitUntil);
          
          // Try to load from GitHub
          const githubFlights = await loadFlightsFromGitHub();
          if (githubFlights && githubFlights.length > 0) {
            setFlights(githubFlights);
            setLastUpdate(new Date());
            setError(null);
            setLoading(false);
            return;
          } else {
            setError('Rate limited and no backup data available');
            setLoading(false);
            return;
          }
        } else {
          // Rate limit expired, clear it
          localStorage.removeItem('rateLimitUntil');
          setRateLimited(false);
          setRateLimitUntil(null);
        }
      }

      try {
        setLoading(true);
        setError(null);
        setRateLimited(false);

        // Load credentials from credentials.json
        const creds = await loadCredentials();
        logCredentialStatus(creds);
        
        // Extract OpenSky API credentials
        const openskyCreds = getOpenskyCredentials(creds);
        const githubToken = getGitHubToken(creds);
        
        // Debug: Log credential status
        if (!openskyCreds) {
          console.warn('⚠️ CRITICAL: No OpenSky credentials found!');
          console.warn('📝 Action required: Create public/credentials.json file');
          console.warn('📁 File location: C:\\12_CODINGHARD\\airflight\\public\\credentials.json');
          console.warn('');
          console.warn('📋 File content should be:');
          console.warn(JSON.stringify({
            opensky: {
              username: 'casadel-api-client',
              password: 'YOUR_ACTUAL_PASSWORD'
            }
          }, null, 2));
        } else {
          console.log(`✅ Credentials loaded: username=${openskyCreds.username}, password=${openskyCreds.password ? '***' : 'MISSING'}`);
        }

        // Fetch aircraft using OpenSky API credentials
        const aircraft = await fetchAllFlightsBrazil(openskyCreds);
        console.log('Fetched aircraft:', aircraft.length);
        console.log('Sample aircraft data:', aircraft.length > 0 ? aircraft[0] : 'No aircraft');
        
        if (aircraft.length > 0) {
          console.log('Aircraft positions:', aircraft.slice(0, 3).map(a => ({ 
            lon: a.longitude, 
            lat: a.latitude, 
            callsign: a.callsign 
          })));
        }
        
        setFlights(aircraft);
        setLastUpdate(new Date());
        
        // If we had rate limit before and now we got data, delete old GitHub file
        if (rateLimitUntilStr && aircraft.length > 0) {
          if (githubToken) {
            await deleteFlightsFromGitHub(githubToken);
          }
        }
      } catch (err) {
        console.error('Failed to load aircraft:', err);
        const errorMsg = err.message || 'Unknown error';
        
        if (errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('Rate limit')) {
          // Extract retry time from error message
          const retryMatch = errorMsg.match(/Retry after ([\d.]+) hours/);
          if (retryMatch) {
            const retryHours = parseFloat(retryMatch[1]);
            const retryUntil = new Date(Date.now() + retryHours * 3600 * 1000);
            localStorage.setItem('rateLimitUntil', retryUntil.toISOString());
            setRateLimitUntil(retryUntil);
          }
          
          setRateLimited(true);
          setError(errorMsg);
          
          // Save current flights to GitHub before rate limit
          if (flights.length > 0) {
            // Reload credentials to get GitHub token
            const credsForGitHub = await loadCredentials();
            const githubTokenForSave = getGitHubToken(credsForGitHub);
            
            if (githubTokenForSave) {
              console.log('Saving flights to GitHub before rate limit...');
              await saveFlightsToGitHub(flights, githubTokenForSave);
            } else {
              console.warn('No GitHub token found in credentials.json. Cannot save flights to GitHub.');
              console.warn('Add GitHub token to credentials.json to enable backup functionality');
            }
          }
          
          // Try to load from GitHub as fallback
          const githubFlights = await loadFlightsFromGitHub();
          if (githubFlights && githubFlights.length > 0) {
            setFlights(githubFlights);
            console.log('Loaded backup flights from GitHub');
          }
        } else {
          setError(errorMsg);
        }
      } finally {
        setLoading(false);
      }
    }

    // Load immediately
    loadAircraft();

    // Refresh every 5 minutes
    const interval = setInterval(loadAircraft, 300000);

    return () => clearInterval(interval);
  }, []);

  // Calculate capacity breaks using jenks
  const capacityBreaks = useMemo(() => {
    if (flights.length === 0) return [];
    const capacities = flights.map(f => f.capacity || 150);
    const breaks = jenksBreaks(capacities, 5);
    return breaks;
  }, [flights]);

  // Get size based on capacity class (jenks: smallest X to largest X*2)
  const getSizeByCapacity = (capacity) => {
    if (capacityBreaks.length < 2) return 15;
    const baseSize = 12; // X (smallest)
    const maxSize = baseSize * 2; // X*2 (largest)
    
    // Find which jenks class this capacity belongs to
    for (let i = 0; i < capacityBreaks.length - 1; i++) {
      if (capacity <= capacityBreaks[i + 1]) {
        // Interpolate size based on class (0 to capacityBreaks.length-2)
        const classRatio = i / (capacityBreaks.length - 2); // 0 to 1
        return baseSize + (maxSize - baseSize) * classRatio;
      }
    }
    return maxSize; // Largest
  };

  // Create plane icon from SVG and load as image
  const [iconAtlas, setIconAtlas] = useState(null);
  
  // Create airport icon from react-icons and load as image
  const [airportIconAtlas, setAirportIconAtlas] = useState(null);

  useEffect(() => {
    // Create SVG plane icon
    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6.428 1.151C6.708.591 7.213 0 8 0s1.292.592 1.572 1.151C9.861 1.73 10 2.431 10 3v3.691l5.17 2.585a1.5 1.5 0 0 1 .83 1.342V12a.5.5 0 0 1-.582.493l-5.507-.918-.375 2.253 1.318 1.318A.5.5 0 0 1 10.5 16h-5a.5.5 0 0 1-.354-.854l1.319-1.318-.376-2.253-5.507.918A.5.5 0 0 1 0 12v-1.382a1.5 1.5 0 0 1 .83-1.342L6 6.691V3c0-.568.14-1.271.428-1.849"/>
      </svg>
    `;
    
    // Convert SVG to data URI
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    
    // Load SVG as image
    const img = new Image();
    img.onload = () => {
      setIconAtlas(img);
      URL.revokeObjectURL(svgUrl);
    };
    img.onerror = () => {
      // Fallback: create canvas version if SVG fails
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000000';
      // Draw simplified plane shape
      ctx.beginPath();
      ctx.moveTo(32, 10);
      ctx.lineTo(50, 32);
      ctx.lineTo(32, 54);
      ctx.lineTo(14, 32);
      ctx.closePath();
      ctx.fill();
      const fallbackImg = new Image();
      fallbackImg.onload = () => setIconAtlas(fallbackImg);
      fallbackImg.src = canvas.toDataURL();
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  }, []);

  // Create airport icon from react-icons CiAirportSign1
  useEffect(() => {
    // Create a hidden container to render the icon
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '64px';
    container.style.height = '64px';
    container.style.color = 'white';
    document.body.appendChild(container);

    // Import react-dom/client dynamically
    import('react-dom/client').then(({ createRoot }) => {
      const root = createRoot(container);
      
      root.render(React.createElement(CiAirportSign1, { 
        style: { width: '64px', height: '64px', color: 'white' } 
      }));

      // Wait for render, then convert to image
      setTimeout(() => {
        const svgElement = container.querySelector('svg');
        if (svgElement) {
          // Clone and style the SVG
          const clonedSvg = svgElement.cloneNode(true);
          clonedSvg.setAttribute('width', '64');
          clonedSvg.setAttribute('height', '64');
          clonedSvg.setAttribute('fill', 'white');
          clonedSvg.setAttribute('color', 'white');
          
          // Set all paths/strokes to white
          clonedSvg.querySelectorAll('path, circle, rect, line, polygon').forEach(el => {
            el.setAttribute('fill', 'white');
            el.setAttribute('stroke', 'white');
            el.setAttribute('color', 'white');
          });

          const svgString = new XMLSerializer().serializeToString(clonedSvg);
          const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const svgUrl = URL.createObjectURL(svgBlob);

          const img = new Image();
          img.onload = () => {
            setAirportIconAtlas(img);
            URL.revokeObjectURL(svgUrl);
            document.body.removeChild(container);
          };
          img.onerror = () => {
            // Fallback: create simple airport icon
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            // Draw airport icon shape (simplified)
            ctx.beginPath();
            ctx.moveTo(32, 10);
            ctx.lineTo(50, 32);
            ctx.lineTo(32, 54);
            ctx.lineTo(14, 32);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            const fallbackImg = new Image();
            fallbackImg.onload = () => {
              setAirportIconAtlas(fallbackImg);
              document.body.removeChild(container);
            };
            fallbackImg.src = canvas.toDataURL();
            URL.revokeObjectURL(svgUrl);
          };
          img.src = svgUrl;
        } else {
          document.body.removeChild(container);
        }
      }, 200);
    }).catch(() => {
      // Fallback if import fails
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(32, 10);
      ctx.lineTo(50, 32);
      ctx.lineTo(32, 54);
      ctx.lineTo(14, 32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        setAirportIconAtlas(fallbackImg);
        document.body.removeChild(container);
      };
      fallbackImg.src = canvas.toDataURL();
    });
  }, []);

  // Icon mapping for deck.gl
  const iconMapping = {
    plane: {
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      anchorY: 32,
      mask: true
    },
    airport: {
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      anchorY: 32,
      mask: true
    }
  };

  // Get Brazilian airports
  const airports = useMemo(() => getBrazilAirports(), []);

  // Create layer for all aircraft with plane icons (white, sized by capacity)
  // Use ScatterplotLayer as fallback if iconAtlas not loaded yet
  const aircraftLayer = useMemo(() => {
    if (flights.length === 0) {
      console.log('No flights data, aircraftLayer will be null');
      return null;
    }

    if (iconAtlas) {
      console.log(`Creating IconLayer with ${flights.length} flights, iconAtlas loaded`);
      return new IconLayer({
        id: 'all-aircraft',
        data: flights,
        iconAtlas: iconAtlas,
        iconMapping: iconMapping,
        getIcon: () => 'plane',
        getPosition: d => {
          const pos = [d.longitude, d.latitude];
          if (!pos[0] || !pos[1] || isNaN(pos[0]) || isNaN(pos[1])) {
            console.warn('Invalid position:', d);
            return null;
          }
          return pos;
        },
        getSize: d => getSizeByCapacity(d.capacity || 150),
        getAngle: d => d.track || 0,
        getColor: [255, 255, 255], // White color
        sizeScale: 1,
        sizeMinPixels: 10,
        sizeMaxPixels: 30,
        pickable: true,
        autoHighlight: false,
        onHover: (info) => {
          if (info.object) {
            setHoveredObject(info.object);
            setHoveredPosition([info.x, info.y]);
          } else {
            setHoveredObject(null);
            setHoveredPosition(null);
          }
        }
      });
    } else {
      console.log(`Creating ScatterplotLayer fallback with ${flights.length} flights, iconAtlas not loaded yet`);
      return new ScatterplotLayer({
        id: 'all-aircraft-fallback',
        data: flights,
        getPosition: d => {
          const pos = [d.longitude, d.latitude];
          if (!pos[0] || !pos[1] || isNaN(pos[0]) || isNaN(pos[1])) {
            console.warn('Invalid position:', d);
            return null;
          }
          return pos;
        },
        getRadius: d => getSizeByCapacity(d.capacity || 150),
        getFillColor: [255, 255, 255], // White color
        radiusMinPixels: 8,
        radiusMaxPixels: 20,
        pickable: true,
        autoHighlight: false,
        onHover: (info) => {
          if (info.object) {
            setHoveredObject(info.object);
            setHoveredPosition([info.x, info.y]);
          } else {
            setHoveredObject(null);
            setHoveredPosition(null);
          }
        }
      });
    }
  }, [flights, iconAtlas, capacityBreaks]);

  // Airport markers layer using IconLayer with CiAirportSign1 icon
  const airportLayer = airportIconAtlas ? new IconLayer({
    id: 'airports',
    data: airports,
    iconAtlas: airportIconAtlas,
    iconMapping: iconMapping,
    getIcon: () => 'airport',
    getPosition: d => [d.lon, d.lat],
    getSize: 20,
    getColor: [255, 255, 255], // White color
    sizeScale: 1,
    sizeMinPixels: 15,
    sizeMaxPixels: 25,
    pickable: true
  }) : null;

  // Airport labels will be rendered using react-map-gl Marker (HTML-based) for proper Unicode support
  
  // Collision detection for airport labels to avoid overlapping
  const visibleAirports = useMemo(() => {
    if (!mapRef.current || airports.length === 0) {
      return airports;
    }

    try {
      // Estimate label dimensions (approximate)
      const labelWidth = 120; // pixels
      const labelHeight = 40; // pixels
      const padding = 5; // pixels padding between labels

      // Project all airports to screen coordinates
      const screenPositions = airports.map(airport => {
        try {
          const point = mapRef.current.project([airport.lon, airport.lat]);
          return {
            ...airport,
            screenX: point.x,
            screenY: point.y,
            visible: true
          };
        } catch (e) {
          return {
            ...airport,
            screenX: -9999,
            screenY: -9999,
            visible: false
          };
        }
      }).filter(ap => ap.visible && ap.screenX >= 0 && ap.screenY >= 0 && 
                      ap.screenX <= window.innerWidth && ap.screenY <= window.innerHeight);

      // Sort by importance (you could prioritize by airport size, traffic, etc.)
      // For now, we'll use a simple priority: keep labels that don't overlap
      const visible = [];
      const usedRects = [];

      for (const airport of screenPositions) {
        const rect = {
          x: airport.screenX + 10, // marginLeft offset
          y: airport.screenY - labelHeight / 2, // center vertically
          width: labelWidth,
          height: labelHeight
        };

        // Check if this label overlaps with any already visible label
        let overlaps = false;
        for (const usedRect of usedRects) {
          if (!(rect.x + rect.width + padding < usedRect.x ||
                usedRect.x + usedRect.width + padding < rect.x ||
                rect.y + rect.height + padding < usedRect.y ||
                usedRect.y + usedRect.height + padding < rect.y)) {
            overlaps = true;
            break;
          }
        }

        if (!overlaps) {
          visible.push(airport);
          usedRects.push(rect);
        }
      }

      return visible;
    } catch (e) {
      console.warn('Error calculating visible airports:', e);
      return airports; // Fallback: show all airports
    }
  }, [airports, viewState]);

  // Format time from Unix timestamp
  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString();
  };

  // Get aircraft type from callsign
  const getAircraftType = (callsign) => {
    if (!callsign) return 'Unknown';
    const upper = callsign.toUpperCase();
    if (upper.includes('A380')) return 'Airbus A380';
    if (upper.includes('A350')) return 'Airbus A350';
    if (upper.includes('A330')) return 'Airbus A330';
    if (upper.includes('A321')) return 'Airbus A321';
    if (upper.includes('A320')) return 'Airbus A320';
    if (upper.includes('A319')) return 'Airbus A319';
    if (upper.includes('B777')) return 'Boeing 777';
    if (upper.includes('B787')) return 'Boeing 787';
    if (upper.includes('B767')) return 'Boeing 767';
    if (upper.includes('B737')) return 'Boeing 737';
    if (upper.includes('ERJ')) return 'Embraer ERJ';
    if (upper.includes('CRJ')) return 'Bombardier CRJ';
    if (upper.includes('ATR')) return 'ATR';
    return 'Commercial Aircraft';
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', margin: 0, padding: 0 }}>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={[airportLayer, aircraftLayer].filter(layer => layer !== null && layer !== undefined)}
      >
        <Map
          ref={mapRef}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
          reuseMaps={true}
          preventStyleDiffing={true}
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
          attributionControl={true}
          onMove={evt => setViewState(evt.viewState)}
        >
          {/* Airport labels using Marker for proper Unicode rendering - with collision detection */}
          {visibleAirports.map((airport, idx) => (
            <Marker
              key={`airport-label-${airport.code}-${idx}`}
              longitude={airport.lon}
              latitude={airport.lat}
              anchor="left"
            >
              <div style={{
                marginLeft: '10px',
                background: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '3px',
                fontFamily: 'Arial, sans-serif',
                fontSize: '11px',
                lineHeight: '1.3',
                whiteSpace: 'nowrap',
                pointerEvents: 'none'
              }}>
                <div style={{ fontWeight: 'bold' }}>{airport.code}</div>
                <div style={{ fontSize: '10px', opacity: 0.9 }}>{airport.name}</div>
              </div>
            </Marker>
          ))}
        </Map>
      </DeckGL>

      {/* Hover popup */}
      {hoveredObject && hoveredPosition && (
        <div style={{
          position: 'absolute',
          left: hoveredPosition[0] + 10,
          top: hoveredPosition[1] - 10,
          background: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '12px',
          borderRadius: '5px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '12px',
          zIndex: 2000,
          pointerEvents: 'none',
          minWidth: '200px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #555', paddingBottom: '4px' }}>
            Flight Information
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Flight:</strong> {hoveredObject.callsign || 'N/A'}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Origin Country:</strong> {hoveredObject.origin || 'Unknown'}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>ICAO24:</strong> {hoveredObject.icao24 || 'N/A'}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Aircraft Type:</strong> {getAircraftType(hoveredObject.callsign)}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Capacity:</strong> {hoveredObject.capacity || 'N/A'} passengers
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Altitude:</strong> {Math.round(hoveredObject.altitude || 0)} m
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Speed:</strong> {Math.round((hoveredObject.velocity || 0) * 3.6)} km/h
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Last Contact:</strong> {formatTime(hoveredObject.lastContact)}
          </div>
        </div>
      )}

      {/* Info overlay */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '15px',
        borderRadius: '5px',
        fontFamily: 'Arial, sans-serif',
        zIndex: 1000
      }}>
        <h2 style={{ margin: '0 0 10px 0', fontSize: '18px' }}>
          Brazil Flight Tracker
        </h2>
        <p style={{ margin: '5px 0', fontSize: '14px', fontWeight: 'bold' }}>
          All Flights in the Air
        </p>
        <p style={{ margin: '5px 0', fontSize: '14px' }}>
          <span style={{ color: '#000000' }}>✈</span> Total Flights: {loading ? 'Loading...' : flights.length}
        </p>
        {lastUpdate && (
          <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#cccccc' }}>
            Last update: {lastUpdate.toLocaleTimeString()}
          </p>
        )}
        <p style={{ margin: '5px 0', fontSize: '11px', color: '#aaaaaa', marginTop: '10px' }}>
          Updates every 5 minutes
        </p>
        {rateLimited && rateLimitUntil && (
          <div style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#ffaa00' }}>
            <p style={{ margin: '0 0 3px 0' }}>⚠️ Rate limited until: {new Date(rateLimitUntil).toLocaleString()}</p>
            <p style={{ margin: '0', fontSize: '10px' }}>Using backup data from GitHub</p>
          </div>
        )}
        {error && (
          <div style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#ff6b6b' }}>
            <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>Error: {error}</p>
            {error.includes('429') || error.includes('rate limit') ? (
              <p style={{ margin: '0', fontSize: '11px', color: '#ffaa00' }}>
                ⚠️ Rate limit exceeded. Loading from GitHub backup or add credentials.json for higher limits.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
