/**
 * GitHub API integration for saving/loading flight data
 * Repository: https://github.com/RomanDataLab/Brazil_flightradar.git
 */

const GITHUB_REPO = 'RomanDataLab/Brazil_flightradar';
const FLIGHTS_FILE = 'flights_data.json';

/**
 * Save flights data to GitHub repository
 * Note: This requires GitHub token authentication
 * For production, use a backend service or GitHub Actions
 */
export async function saveFlightsToGitHub(flights, githubToken) {
  if (!githubToken) {
    console.warn('GitHub token not provided. Skipping GitHub save.');
    return false;
  }

  try {
    const content = JSON.stringify({
      flights: flights,
      timestamp: new Date().toISOString(),
      count: flights.length
    }, null, 2);

    // Encode to base64
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    // Check if file exists
    const checkUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${FLIGHTS_FILE}`;
    const checkResponse = await fetch(checkUrl, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let sha = null;
    if (checkResponse.ok) {
      const existingFile = await checkResponse.json();
      sha = existingFile.sha;
    }

    // Create or update file
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${FLIGHTS_FILE}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Update flights data - ${flights.length} flights`,
        content: encodedContent,
        sha: sha // Include SHA if updating existing file
      })
    });

    if (response.ok) {
      console.log('Successfully saved flights to GitHub');
      return true;
    } else {
      const error = await response.json();
      console.error('Failed to save to GitHub:', error);
      return false;
    }
  } catch (error) {
    console.error('Error saving to GitHub:', error);
    return false;
  }
}

/**
 * Load flights data from GitHub repository
 */
export async function loadFlightsFromGitHub() {
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${FLIGHTS_FILE}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('No flights file found in GitHub repo');
        return null;
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const fileData = await response.json();
    
    // Decode base64 content
    const decodedContent = decodeURIComponent(escape(atob(fileData.content)));
    const data = JSON.parse(decodedContent);

    console.log(`Loaded ${data.count || 0} flights from GitHub (saved at ${data.timestamp})`);
    return data.flights || [];
  } catch (error) {
    console.error('Error loading from GitHub:', error);
    return null;
  }
}

/**
 * Delete flights file from GitHub repository
 */
export async function deleteFlightsFromGitHub(githubToken) {
  if (!githubToken) {
    console.warn('GitHub token not provided. Skipping GitHub delete.');
    return false;
  }

  try {
    // Get file SHA first
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${FLIGHTS_FILE}`;
    const getResponse = await fetch(url, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!getResponse.ok) {
      if (getResponse.status === 404) {
        console.log('File does not exist, nothing to delete');
        return true;
      }
      throw new Error(`Failed to get file: ${getResponse.status}`);
    }

    const fileData = await getResponse.json();
    const sha = fileData.sha;

    // Delete file
    const deleteResponse = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Remove old flights data',
        sha: sha
      })
    });

    if (deleteResponse.ok) {
      console.log('Successfully deleted old flights file from GitHub');
      return true;
    } else {
      const error = await deleteResponse.json();
      console.error('Failed to delete from GitHub:', error);
      return false;
    }
  } catch (error) {
    console.error('Error deleting from GitHub:', error);
    return false;
  }
}

