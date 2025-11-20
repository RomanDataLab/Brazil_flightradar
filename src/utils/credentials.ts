export interface OpenSkyCredentials {
  username?: string;
  password?: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
}

export async function loadCredentials(): Promise<OpenSkyCredentials> {
  // First, check for environment variables (for Vercel production)
  // Note: Vite exposes env vars with VITE_ prefix for client-side
  const envUsername = import.meta.env.VITE_OPENSKY_USERNAME;
  const envPassword = import.meta.env.VITE_OPENSKY_PASSWORD;
  
  if (envUsername && envPassword) {
    console.log('✅ Using credentials from environment variables');
    return {
      username: envUsername,
      password: envPassword
    };
  }

  // Fallback to credentials.json file (for local development)
  try {
    const response = await fetch('/credentials.json');
    if (!response.ok) {
      // File doesn't exist - that's okay, app will work without credentials
      return {};
    }
    const data = await response.json();
    
    // Support multiple credential formats
    if (data.opensky) {
      return data.opensky;
    }
    if (data.username && data.password) {
      return { username: data.username, password: data.password };
    }
    if (data.token) {
      return { token: data.token };
    }
    if (data.clientId && data.clientSecret) {
      return { clientId: data.clientId, clientSecret: data.clientSecret };
    }
    
    return data;
  } catch (error) {
    console.warn('⚠️ Could not load credentials from file (app will use unauthenticated API)');
    return {};
  }
}

export function getAuthHeader(credentials: OpenSkyCredentials): string | null {
  if (credentials.username && credentials.password) {
    const auth = btoa(`${credentials.username}:${credentials.password}`);
    return `Basic ${auth}`;
  }
  if (credentials.token) {
    return `Bearer ${credentials.token}`;
  }
  return null;
}

