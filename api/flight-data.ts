// Vercel serverless function to store and retrieve flight data
// Uses Upstash Redis (via REST) for persistent storage, or falls back to null

import { Redis } from '@upstash/redis';

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!
    })
  : null;

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

  try {
    if (req.method === 'GET') {
      // Retrieve flight data
      if (redis) {
        try {
          const data = await redis.get(FLIGHT_DATA_KEY);
          const timestamp = await redis.get<number | null>(FLIGHT_DATA_TIMESTAMP_KEY);

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
            timestamp: typeof timestamp === 'number' ? timestamp : null
          });
        } catch (kvError: any) {
          console.error('Upstash error:', kvError);
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

      if (redis) {
        try {
          const flightData = { time, states };
          await redis.set(FLIGHT_DATA_KEY, JSON.stringify(flightData));
          await redis.set(FLIGHT_DATA_TIMESTAMP_KEY, Date.now());

          return res.status(200).json({
            success: true,
            persisted: true,
            message: `Saved ${states.length} aircraft states to Upstash Redis`,
            timestamp: Date.now()
          });
        } catch (kvError: any) {
          console.error('Upstash save error:', kvError);
          return res.status(503).json({
            success: false,
            error: 'Storage error',
            message: kvError.message
          });
        }
      }

      // Fallback: tell client data was NOT persisted
      return res.status(200).json({
        success: true,
        persisted: false,
        message: `Received ${states.length} aircraft states but KV not configured - data NOT persisted`,
        timestamp: Date.now(),
        note: 'Configure Upstash Redis (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) for persistent storage'
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

