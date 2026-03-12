export interface OpenSkyCredentials {
  username?: string;
  password?: string;
}

// Credentials are now ONLY handled server-side via the proxy.
// The client can optionally provide credentials for the proxy to forward,
// but they are sent to OUR proxy (not directly to OpenSky).
// For production, set OPENSKY_USERNAME/OPENSKY_PASSWORD env vars on Vercel.

let storedCredentials: OpenSkyCredentials = {};

export function setCredentials(creds: OpenSkyCredentials): void {
  storedCredentials = creds;
}

export function getCredentials(): OpenSkyCredentials {
  return storedCredentials;
}

export function hasCredentials(): boolean {
  return !!(storedCredentials.username && storedCredentials.password);
}

export function getAuthHeader(): string | null {
  if (storedCredentials.username && storedCredentials.password) {
    const auth = btoa(`${storedCredentials.username}:${storedCredentials.password}`);
    return `Basic ${auth}`;
  }
  return null;
}

export function clearCredentials(): void {
  storedCredentials = {};
}
