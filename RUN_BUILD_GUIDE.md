# OIS Meet Desktop/Web — Run & Build (Quick Guide)

## Prerequisites

- Node.js `v20.20.0` (or compatible Node 20)

## Install

```bash
npm install
```

## Run (Web)

```bash
ng serve
```

Open: `http://localhost:4200`

## Run (Desktop / Electron)

```bash
npm run start
```

This starts Angular dev server and launches Electron.

## Build (Web)

```bash
ng build --configuration production
```

Output: `dist/ois-meet-desktop/browser/`

## Build (Desktop / Windows .exe)

```bash
npm run build
```

Output installer: `release/OIS Meet Desktop Setup <version>.exe`

## API Base URL

- Dev: `src/environments/environment.ts`
- Prod: `src/environments/environment.prod.ts`

## Desktop Icon (Windows)

- Place your icon at `electron/assets/icon.ico`
- Then run `npm run build`

## UI Libraries

- Design: Bootstrap 5
- Dialogs: Angular Material (intended for dialogs only)
