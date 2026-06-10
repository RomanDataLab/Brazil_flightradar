function setCorsHeaders(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

export default async function handler(req: any, res: any) {
  // Always set CORS headers (including error responses)
  setCorsHeaders(res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
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

  console.log(`[OpenSky Proxy] Proxying: ${fullUrl}`);

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
      console.log('[OpenSky Proxy] Using server-side credentials');
    } else if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
      console.log('[OpenSky Proxy] Using client-forwarded credentials');
    } else {
      console.log('[OpenSky Proxy] No credentials (anonymous)');
    }

    // Fetch with timeout (8s to stay within Vercel's 10s limit)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(fullUrl, {
        method: req.method || 'GET',
        headers,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`[OpenSky Proxy] API returned ${response.status}: ${text.slice(0, 200)}`);
      return res.status(response.status).json({
        error: `OpenSky API error: ${response.status} ${response.statusText}`,
        detail: text.slice(0, 200)
      });
    }

    // Parse response safely (OpenSky sometimes returns HTML instead of JSON)
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`[OpenSky Proxy] Non-JSON response: ${text.slice(0, 200)}`);
      return res.status(502).json({
        error: 'OpenSky returned non-JSON response',
        detail: text.slice(0, 200)
      });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('[OpenSky Proxy] Request timed out after 8s');
      return res.status(504).json({
        error: 'OpenSky API request timed out',
        message: 'The API took too long to respond. Try again shortly.'
      });
    }
    console.error('[OpenSky Proxy] Error:', error.message);
    return res.status(500).json({
      error: 'Proxy error',
      message: error.message
    });
  }
}
