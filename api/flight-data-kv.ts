// Vercel serverless function using Vercel KV for persistent storage
// To use this, install @vercel/kv and set up Vercel KV in your project
// This file is optional - only used if @vercel/kv is installed

// @ts-ignore - Optional dependency, may not be installed
let kv: any = null;
let useKV = false;

try {
  // @ts-ignore
  kv = require('@vercel/kv');
  useKV = true;
} catch (e) {
  // KV not installed - this is optional
  useKV = false;
}

const FLIGHT_DATA_KEY = 'flight_data';
const FLIGHT_DATA_TIMESTAMP_KEY = 'flight_data_timestamp';

export default async function handler(req: any, res: any) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!useKV || !kv) {
    return res.status(503).json({
      success: false,
      error: 'Vercel KV not configured',
      message: 'Install @vercel/kv and configure Vercel KV to use this endpoint'
    });
  }

  try {
    if (req.method === 'GET') {
      // Retrieve flight data
      const data = await kv.get<string>(FLIGHT_DATA_KEY);
      const timestamp = await kv.get<string>(FLIGHT_DATA_TIMESTAMP_KEY);

      if (!data) {
        return res.status(200).json({
          success: true,
          data: null,
          timestamp: null
        });
      }

      const flightData = typeof data === 'string' ? JSON.parse(data) : data;
      
      return res.status(200).json({
        success: true,
        data: flightData,
        timestamp: timestamp ? parseInt(timestamp) : null
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

      const flightData = { time, states };
      
      // Store data in KV
      await kv.set(FLIGHT_DATA_KEY, JSON.stringify(flightData));
      await kv.set(FLIGHT_DATA_TIMESTAMP_KEY, Date.now().toString());

      return res.status(200).json({
        success: true,
        message: `Saved ${states.length} aircraft states`,
        timestamp: Date.now()
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error in flight-data-kv API:', error);
    
    // If KV is not set up, return helpful error
    if (error.message?.includes('KV') || error.message?.includes('redis')) {
      return res.status(503).json({
        success: false,
        error: 'Storage not configured',
        message: 'Please set up Vercel KV or use the file-based storage endpoint',
        setup: 'See README.md for storage setup instructions'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}

