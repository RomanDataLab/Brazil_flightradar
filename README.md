# Brazil Flight Tracker

A real-time flight tracking visualization for Brazil using deck.gl, React, and the OpenSky Network API.

## Features

- ✈️ Real-time flight tracking over Brazil
- 🏢 Airport visualization (international airports highlighted)
- 📊 Interactive 3D map with deck.gl
- 🔄 Auto-updates every 5 minutes
- 💾 Smart caching for offline viewing

## Tech Stack

- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **deck.gl** - WebGL-powered visualization framework
- **MapLibre GL** - Map rendering
- **OpenSky Network API** - Flight data source

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

The production build will be in the `dist/` folder.

## Deployment on Vercel

This project is configured for Vercel deployment:

1. Push your code to GitHub
2. Import the repository in Vercel
3. Vercel will automatically detect the Vite configuration
4. The API proxy for OpenSky Network is configured via `vercel.json`

### Environment Variables (Optional)

If you have OpenSky Network credentials, you can add them as environment variables in Vercel:
- `OPENSKY_USERNAME` - OpenSky Network username
- `OPENSKY_PASSWORD` - OpenSky Network password

Or create a `public/credentials.json` file locally (this file is gitignored).

## Project Structure

```
├── src/
│   ├── api/          # API integration (OpenSky Network)
│   ├── utils/        # Utilities (credentials, storage, airports, airlines)
│   └── app.tsx       # Main application component
├── public/           # Static assets (SVG icons, 3D models)
├── index.html        # HTML entry point
└── vercel.json       # Vercel deployment configuration
```

## License

MIT

