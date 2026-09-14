# JIT Command Center 🎛️

Real-time infrastructure monitoring dashboard with cyberpunk HUD aesthetic.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-38B2AC?style=flat&logo=tailwind-css&logoColor=white)

## Features

- 🔴 **Reactive Threat System** - UI auto-tints based on threat level
- 📊 **Real-time Metrics** - Live system monitoring widgets
- 🎨 **Token-driven CSS** - Cyberpunk HUD design system
- ⚡ **Next.js 14** - App router with TypeScript
- 🌙 **Dark Mode** - Optimized for low-light operation

## Architecture

```
┌─────────────────────────────────────────┐
│           JIT COMMAND CENTER            │
├─────────────┬─────────────┬─────────────┤
│   THREAT    │   SYSTEM    │   NETWORK   │
│   MONITOR   │   METRICS   │   STATUS    │
├─────────────┼─────────────┼─────────────┤
│    CPU      │   MEMORY    │   STORAGE   │
│   GRAPHS    │   USAGE     │   I/O       │
└─────────────┴─────────────┴─────────────┘
```

## Quick Start

```bash
# Clone
git clone https://github.com/ivan09069/JIT-Command-Center.git
cd JIT-Command-Center

# Install
npm install

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deployment

### Vercel (Recommended)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ivan09069/JIT-Command-Center)

### Manual
```bash
npm run build
npm start
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 14 |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Fonts | Geist (Vercel) |

## Part of EchoForge Studios

- [EchoForge](https://github.com/ivan09069/EchoForge) - Portfolio Tracker
- [SwarmSentinel-v3](https://github.com/ivan09069/SwarmSentinel-v3) - Trading Bot
- [echoforge-texas-platform](https://github.com/ivan09069/echoforge-texas-platform) - Energy Platform

---

**Built by EchoForge Studios** | *Forged, not finished*


## Authenticated API and telemetry status

Both `/api/control` and `/api/status` require `Authorization: Bearer` with the
server-side `CONTROL_API_TOKEN` (at least 32 random characters). Never prefix this
secret with `NEXT_PUBLIC_` or place it in frontend source. The existing policy gate
still applies after authentication; this change does not bypass its FIDO2 or safety
requirements. The UI remains a labelled preview, not an authenticated control UI.

Provider requests now interpolate configured values correctly. Device disk metrics
are explicitly unknown until a real device adapter exists. Hosting telemetry must
not be presented as the Android device's storage measurement.

Offline tests require Node 24 and use mocked providers: `node --test security.test.mjs`.
