export interface OpenSkyCredentials {
  username?: string;
  password?: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
}

export async function loadCredentials(): Promise<OpenSkyCredentials> {
  try {
    const response = await fetch('/credentials.json');
    if (!response.ok) {
      throw new Error(`Failed to load credentials: ${response.status}`);
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
    console.error('Error loading credentials:', error);
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

