# Vercel Environment Variables Setup

This guide explains how to set up OpenSky API credentials in Vercel using environment variables.

## Why Use Environment Variables?

- **Security**: Credentials are not exposed in your code or public files
- **Flexibility**: Different credentials for different environments
- **Best Practice**: Industry standard for handling sensitive data

## Setup Instructions

### Step 1: Get Your OpenSky Credentials

You need:
- **Username**: Your OpenSky Network username (e.g., `casadel-api-client`)
- **Password**: Your OpenSky Network password

### Step 2: Add Environment Variables in Vercel

1. **Go to your Vercel Dashboard**
   - Navigate to: https://vercel.com/dashboard
   - Select your project: `Brazil_flightradar`

2. **Open Project Settings**
   - Click on your project
   - Go to **Settings** → **Environment Variables**

3. **Add the following variables:**

   | Variable Name | Value | Environment |
   |--------------|-------|-------------|
   | `OPENSKY_USERNAME` | Your OpenSky username | Production, Preview, Development |
   | `OPENSKY_PASSWORD` | Your OpenSky password | Production, Preview, Development |
   | `VITE_OPENSKY_USERNAME` | Your OpenSky username | Production, Preview, Development |
   | `VITE_OPENSKY_PASSWORD` | Your OpenSky password | Production, Preview, Development |

   **Important Notes:**
   - `OPENSKY_*` variables are for serverless functions (API proxy)
   - `VITE_OPENSKY_*` variables are for client-side code (React app)
   - Add them to **all environments** (Production, Preview, Development)

4. **Save and Redeploy**
   - Click **Save** after adding each variable
   - Vercel will automatically redeploy your project
   - Or manually trigger a redeploy from the **Deployments** tab

## How It Works

### Server-Side (API Proxy)
The `/api/opensky/[...path].ts` serverless function uses:
- `process.env.OPENSKY_USERNAME`
- `process.env.OPENSKY_PASSWORD`

These are automatically available in Vercel serverless functions.

### Client-Side (React App)
The React app uses:
- `import.meta.env.VITE_OPENSKY_USERNAME`
- `import.meta.env.VITE_OPENSKY_PASSWORD`

Vite exposes environment variables prefixed with `VITE_` to the client bundle.

## Local Development

For local development, you can either:

### Option 1: Use `.env` file (Recommended)
Create a `.env` file in your project root:

```env
VITE_OPENSKY_USERNAME=your_username
VITE_OPENSKY_PASSWORD=your_password
```

**Note:** `.env` files are gitignored, so your credentials stay private.

### Option 2: Use `public/credentials.json`
Keep using the existing `public/credentials.json` file for local development.

## Verification

After setting up environment variables:

1. **Check Vercel Logs**
   - Go to your project → **Deployments** → Click on latest deployment → **Functions** tab
   - Look for successful API calls with authentication

2. **Test the API**
   - Open your deployed app
   - Check browser console for: `✅ Using credentials from environment variables`
   - Verify flights are loading (authenticated requests have higher rate limits)

## Troubleshooting

### Credentials Not Working?
- Verify variable names are exactly: `OPENSKY_USERNAME`, `OPENSKY_PASSWORD`, `VITE_OPENSKY_USERNAME`, `VITE_OPENSKY_PASSWORD`
- Make sure variables are added to the correct environment (Production/Preview/Development)
- Redeploy after adding variables
- Check Vercel function logs for errors

### Still Using credentials.json?
- Environment variables take priority over `credentials.json`
- If env vars are set, the file won't be used
- Remove env vars to fall back to file-based credentials

### Rate Limits?
- Authenticated requests have higher rate limits
- Check OpenSky Network documentation for current limits
- Monitor your usage in Vercel function logs

## Security Best Practices

✅ **DO:**
- Use environment variables for production
- Keep `.env` files gitignored
- Use different credentials for dev/staging/production if needed
- Rotate credentials periodically

❌ **DON'T:**
- Commit credentials to Git
- Share credentials publicly
- Use the same credentials everywhere
- Store credentials in client-side code without `VITE_` prefix

