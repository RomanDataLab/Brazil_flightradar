/**
 * Utility functions for loading credentials from credentials.json
 */

/**
 * Load credentials from public/credentials.json
 * @returns {Promise<Object|null>} Credentials object or null if not found
 */
export async function loadCredentials() {
  try {
    console.log('📂 Attempting to load credentials.json from public folder...');
    const response = await fetch('/credentials.json');
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn('❌ credentials.json not found in public folder');
        console.warn('📝 Please create public/credentials.json with your OpenSky API credentials');
        return null;
      }
      console.warn(`⚠️ Could not load credentials.json: ${response.status} ${response.statusText}`);
      return null;
    }

    const creds = await response.json();
    
    // Validate structure
    if (!creds || typeof creds !== 'object') {
      console.warn('❌ Invalid credentials.json format - must be a JSON object');
      return null;
    }

    console.log('✅ Successfully loaded credentials.json');
    return creds;
  } catch (error) {
    console.warn('❌ Error loading credentials.json:', error.message);
    console.warn('📝 Make sure public/credentials.json exists and is valid JSON');
    return null;
  }
}

/**
 * Get OpenSky API credentials from loaded credentials
 * @param {Object} creds - Full credentials object
 * @returns {Object|null} OpenSky credentials {username, password} or null
 */
export function getOpenskyCredentials(creds) {
  if (!creds) {
    return null;
  }

  // Support two formats:
  // 1. { "opensky": { "username": "...", "password": "..." } }
  // 2. { "clientId": "...", "clientSecret": "..." }
  
  let username, password;
  
  if (creds.opensky) {
    // Format 1: nested opensky object
    username = creds.opensky.username;
    password = creds.opensky.password;
  } else if (creds.clientId && creds.clientSecret) {
    // Format 2: flat structure with clientId/clientSecret
    username = creds.clientId;
    password = creds.clientSecret;
    console.log('📝 Using credentials in clientId/clientSecret format');
  } else {
    console.warn('❌ OpenSky credentials not found in expected format');
    console.warn('📝 Expected format 1: { "opensky": { "username": "...", "password": "..." } }');
    console.warn('📝 Expected format 2: { "clientId": "...", "clientSecret": "..." }');
    return null;
  }
  
  if (!username) {
    console.warn('❌ OpenSky credentials incomplete: missing username/clientId');
    return null;
  }
  
  if (!password) {
    console.warn('❌ OpenSky credentials incomplete: missing password/clientSecret');
    console.warn('📝 Make sure password/clientSecret is set in credentials.json');
    return null;
  }
  
  if (password === 'YOUR_PASSWORD_HERE' || password === 'YOUR_ACTUAL_PASSWORD_HERE') {
    console.warn('❌ OpenSky credentials incomplete: password is still a placeholder');
    console.warn('📝 Replace placeholder with your actual OpenSky API password');
    return null;
  }

  console.log(`✅ Found OpenSky credentials: username=${username}`);
  return { username, password };
}

/**
 * Get GitHub token from loaded credentials
 * @param {Object} creds - Full credentials object
 * @returns {string|null} GitHub token or null
 */
export function getGitHubToken(creds) {
  if (!creds || !creds.github || !creds.github.token) {
    return null;
  }
  return creds.github.token;
}

/**
 * Validate and log credential status
 * @param {Object} creds - Full credentials object
 */
export function logCredentialStatus(creds) {
  if (!creds) {
    console.warn('⚠️ No credentials loaded from credentials.json');
    console.warn('📝 Create public/credentials.json file with your OpenSky API credentials');
    return;
  }

  const openskyCreds = getOpenskyCredentials(creds);
  const githubToken = getGitHubToken(creds);

  console.log('🔑 Credential Status:', {
    opensky: openskyCreds ? `✅ ${openskyCreds.username} (authenticated)` : '❌ Not configured',
    github: githubToken ? '✅ Configured' : '❌ Not configured'
  });

  if (!openskyCreds) {
    console.warn('⚠️ OpenSky API credentials not found or incomplete');
    console.warn('📝 Create public/credentials.json with:');
    console.warn(JSON.stringify({
      opensky: {
        username: 'casadel-api-client',
        password: 'YOUR_PASSWORD_HERE'
      },
      github: {
        token: 'YOUR_GITHUB_TOKEN_HERE'
      }
    }, null, 2));
    console.warn('⚠️ Using unauthenticated API (strict rate limits apply)');
  } else {
    console.log(`✅ Will use authenticated API with username: ${openskyCreds.username}`);
  }
}

