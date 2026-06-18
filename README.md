# MorTide

A Netlify-ready Vite + React + TypeScript tide dashboard for South San Diego Bay.

## Data source

MorTide uses the free NOAA CO-OPS Data API:

- Station: `9410135`, South San Diego Bay, CA
- Product: `predictions`
- Datum: `MLLW`
- Units: English feet
- Time zone: local station time

NOAA CO-OPS is the best free fit for this app because it is official U.S. tide data, needs no API key, supports JSON, and allows direct browser requests with CORS enabled.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Netlify reads `netlify.toml`, runs the build command, and publishes `dist`.
# MorTide
