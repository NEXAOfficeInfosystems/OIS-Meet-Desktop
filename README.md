# OIS Meet Desktop

Angular 17 + Electron (Electron v29 compatible) desktop application.

## Prerequisites

- Node.js v20.20.0+

## Configuration

- API base URL is configured in `src/environments/environment.ts`
- Production build uses `src/environments/environment.prod.ts` via Angular file replacements

## Run (Angular + Electron together)

```bash
npm install
npm run start
```

This starts Angular dev server and then launches Electron loading `http://localhost:4200`.

## Build Windows .exe

```bash
npm run build
```

This:

1. Builds Angular (`--configuration production`)
2. Packages the app with `electron-builder` (NSIS)

Output is written under `release/`.

## Pages

- `/login` (dummy authentication)
- `/dashboard` (guarded)
