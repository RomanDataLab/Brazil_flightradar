// Vercel serverless function to store and retrieve flight data
// Uses Vercel KV for persistent storage (or falls back to file-based if KV not configured)

let kv: any = null;
let useKV = false;

// Try to import Vercel KV
try {
  kv = require('@vercel/kv');
  useKV = true;
} catch (e) {
  // KV not installed - will use file-based fallback
  console.log('Vercel KV not available, using file-based storage');
}

const FLIGHT_DATA_KEY = 'flight_data';
const FLIGHT_DATA_TIMESTAMP_KEY = 'flight_data_timestamp';

// File-based storage fallback removed - not possible in serverless functions
// Use Vercel KV or static files instead

export default async function handler(req: any, res: any) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Retrieve flight data
      if (useKV && kv) {
        try {
          const data = await kv.get(FLIGHT_DATA_KEY);
          const timestamp = await kv.get(FLIGHT_DATA_TIMESTAMP_KEY);

          if (!data) {
            return res.status(200).json({
              success: true,
              data: null,
              timestamp: null
            });
          }

          const flightData = typeof data === 'string' ? JSON.parse(data) : data;
          
          // Add cache headers
          res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
          res.setHeader('ETag', `"${timestamp || '0'}"`); // ETag for conditional requests
          
          return res.status(200).json({
            success: true,
            data: flightData,
            timestamp: timestamp ? parseInt(timestamp) : null
          });
        } catch (kvError: any) {
          console.error('KV error:', kvError);
          // Fall through to return null
        }
      }

      // Fallback: return null (client will use static file)
      // Add cache headers to reduce repeated calls
      res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
      return res.status(200).json({
        success: true,
        data: null,
        timestamp: null,
        message: 'KV not configured. Using static fallback file.'
      });
    }

    if (req.method === 'POST') {
      // Save flight data
      const { time, states } = req.body;

      if (!states || !Array.isArray(states)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid data format. Expected { time, states }'
        });
      }

      if (useKV && kv) {
        try {
          const flightData = { time, states };
          await kv.set(FLIGHT_DATA_KEY, JSON.stringify(flightData));
          await kv.set(FLIGHT_DATA_TIMESTAMP_KEY, Date.now().toString());

          return res.status(200).json({
            success: true,
            message: `Saved ${states.length} aircraft states to Vercel KV`,
            timestamp: Date.now()
          });
        } catch (kvError: any) {
          console.error('KV save error:', kvError);
          return res.status(503).json({
            success: false,
            error: 'Storage error',
            message: kvError.message
          });
        }
      }

      // Fallback: acknowledge but don't persist
      return res.status(200).json({
        success: true,
        message: `Received ${states.length} aircraft states (KV not configured - data not persisted)`,
        timestamp: Date.now(),
        note: 'Install @vercel/kv and configure Vercel KV for persistent storage'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error in flight-data API:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}

