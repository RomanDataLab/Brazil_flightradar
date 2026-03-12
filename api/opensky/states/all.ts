export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(200).end();
  }

  const openskyUrl = 'https://opensky-network.org/api/states/all';

  // Extract query parameters
  const queryParams: Record<string, string> = {};
  Object.keys(req.query || {}).forEach(key => {
    const value = req.query[key];
    if (typeof value === 'string') {
      queryParams[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      queryParams[key] = value[0] as string;
    }
  });

  const queryString = new URLSearchParams(queryParams).toString();
  const fullUrl = queryString ? `${openskyUrl}?${queryString}` : openskyUrl;

  console.log(`[OpenSky Proxy] Request: ${req.method} ${req.url}`);
  console.log(`[OpenSky Proxy] Full URL: ${fullUrl}`);

  try {
    const headers: HeadersInit = {
      Accept: 'application/json',
      'User-Agent': 'Brazil-Flight-Tracker/1.0'
    };

    const openskyUsername = process.env.OPENSKY_USERNAME;
    const openskyPassword = process.env.OPENSKY_PASSWORD;

    if (openskyUsername && openskyPassword) {
      const auth = Buffer.from(`${openskyUsername}:${openskyPassword}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    const response = await fetch(fullUrl, {
      method: req.method || 'GET',
      headers
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `OpenSky API error: ${response.status} ${response.statusText}`
      });
    }

    const data = await response.json();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    return res.status(200).json(data);
  } catch (error: any) {
    console.error('Error proxying OpenSky API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

