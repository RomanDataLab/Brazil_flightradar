export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(200).end();
  }

  // Get the path from the catch-all route
  const path = Array.isArray(req.query.path) 
    ? req.query.path.join('/') 
    : req.query.path || '';

  // Build the OpenSky API URL
  const openskyUrl = `https://opensky-network.org/api/${path}`;
  
  // Extract query parameters (excluding 'path')
  const queryParams: Record<string, string> = {};
  Object.keys(req.query).forEach(key => {
    if (key !== 'path') {
      const value = req.query[key];
      if (typeof value === 'string') {
        queryParams[key] = value;
      }
    }
  });
  
  const queryString = new URLSearchParams(queryParams).toString();
  const fullUrl = queryString 
    ? `${openskyUrl}?${queryString}` 
    : openskyUrl;

  try {
    // Prepare headers
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'User-Agent': 'Brazil-Flight-Tracker/1.0'
    };

    // Check for credentials from environment variables (Vercel)
    const openskyUsername = process.env.OPENSKY_USERNAME;
    const openskyPassword = process.env.OPENSKY_PASSWORD;
    
    // Use environment variables if available, otherwise use forwarded header
    if (openskyUsername && openskyPassword) {
      const auth = Buffer.from(`${openskyUsername}:${openskyPassword}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else if (req.headers.authorization) {
      // Fallback to forwarded authorization header
      headers['Authorization'] = req.headers.authorization;
    }

    // Make the request to OpenSky API
    const response = await fetch(fullUrl, {
      method: req.method || 'GET',
      headers
    });

    // Check if the response is ok
    if (!response.ok) {
      return res.status(response.status).json({
        error: `OpenSky API error: ${response.status} ${response.statusText}`
      });
    }

    // Get the response data
    const data = await response.json();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    // Return the data
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Error proxying OpenSky API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

