# Vercel Environment Variables Setup

> Full documentation has moved to [README.md](./README.md#step-3-set-environment-variables).

## Quick Reference

In Vercel Dashboard > Your Project > **Settings** > **Environment Variables**, add:

| Variable | Value | Environments |
|----------|-------|-------------|
| `OPENSKY_USERNAME` | Your OpenSky username | Production, Preview, Development |
| `OPENSKY_PASSWORD` | Your OpenSky password | Production, Preview, Development |

**Important**: Only set server-side variables (`OPENSKY_*`). Do NOT set `VITE_OPENSKY_*` variables — those would leak credentials into the client-side JS bundle.

After adding variables, Vercel will automatically redeploy.
