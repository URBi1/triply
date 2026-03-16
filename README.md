# Triply

![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-blue?style=flat-square)
![Expo](https://img.shields.io/badge/Expo-55-black?style=flat-square&logo=expo)
![Node.js](https://img.shields.io/badge/Node.js-ESM-green?style=flat-square&logo=node.js)
![Fastify](https://img.shields.io/badge/Fastify-4-white?style=flat-square&logo=fastify)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?style=flat-square&logo=postgresql)
![License](https://img.shields.io/badge/license-MIT-lightgrey?style=flat-square)

**Triply** is a collaborative travel memory app that automatically imports your trip photos from your camera roll and organizes them into shared albums. Create a trip, set the date range, invite friends with a single code — everyone's photos land in one place, sorted and ready to revisit.

---

## Features

- 📅 **Trip management** — create trips with a name and date range; browse all your past and upcoming journeys in one feed
- 📷 **Smart camera roll scan** — automatically finds photos taken during the trip period and uploads them in bulk (up to 500 photos per scan)
- 🗺️ **GPS metadata** — latitude, longitude and `taken_at` timestamp are preserved on every photo
- 👥 **Collaborative albums** — invite friends via an 8-character code; their uploads appear in your album in near-real-time
- 🔔 **Live updates** — Server-Sent Events broadcast `new_photo` and `new_comment` events to all trip members
- 💬 **Photo comments** — leave notes and reactions on individual photos
- 🔐 **Passwordless auth** — register with a name only, receive a JWT; no email/password friction for travelers
- 🖼️ **Thumbnails** — server-side image processing with `sharp` generates lightweight thumbnails for fast grid loading

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Mobile** | React Native 0.83 + Expo 55 | Cross-platform iOS & Android |
| **Navigation** | React Navigation v7 (native stack) | TripsScreen → AlbumScreen → PhotoScreen |
| **Media access** | expo-media-library, expo-image-picker | Camera roll scan + manual pick |
| **Location** | expo-location | GPS on photo upload |
| **Local storage** | AsyncStorage | JWT token persistence |
| **API** | Node.js (ESM) + Fastify 4 | REST, multipart upload, SSE |
| **Auth** | @fastify/jwt | Device-scoped JWT, name-only registration |
| **Database** | PostgreSQL (prod) / SQLite via better-sqlite3 (dev) | Relational schema for trips, photos, comments |
| **Image processing** | sharp | Thumbnail generation on upload |
| **Real-time** | Server-Sent Events | `new_photo`, `new_comment` per trip |
| **File storage** | Local FS → Cloudflare R2 (prod) | S3-compatible, free egress |
| **Infra** | Docker Compose (local), Render.com (prod) | `docker-compose up` for one-command local dev |

---

## Project Structure

```
triply/
├── docker-compose.yml          # Local dev: PostgreSQL + API
├── ARCHITECTURE.md             # Detailed architecture notes
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js            # Fastify app entrypoint (port 3001)
│       ├── db/
│       │   ├── index.js        # pg Pool / SQLite connection
│       │   └── schema.sql      # Schema, auto-applied on first run
│       ├── middleware/         # Auth hooks, request validation
│       └── routes/
│           ├── auth.js         # POST /auth/register, GET /auth/me
│           ├── trips.js        # CRUD trips + join by invite code
│           ├── photos.js       # Upload, list, comments
│           └── sse.js          # Server-Sent Events stream
└── mobile/
    ├── index.js
    ├── package.json
    └── src/
        ├── api/
        │   └── client.js       # Fetch wrapper, base URL config
        ├── screens/
        │   ├── RegisterScreen.js
        │   ├── TripsScreen.js
        │   ├── AlbumScreen.js
        │   └── PhotoScreen.js
        ├── components/         # Shared UI components
        ├── hooks/              # Custom React hooks
        └── store/              # App state
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **npm** >= 10
- **PostgreSQL** 14+ (or use Docker Compose for local dev)
- **Expo Go** app on your phone (for running the mobile app during development)
- **EAS CLI** for production builds: `npm install -g eas-cli`

---

### Backend Setup

```bash
# 1. Navigate to the backend
cd triply/backend

# 2. Install dependencies
npm install

# 3. Set environment variables (see section below)
cp .env.example .env   # or create .env manually

# 4. Start the API server (runs on port 3001)
node src/index.js

# Development mode with auto-reload
npm run dev
```

The server applies the database schema automatically on first run.

Alternatively, start everything with Docker Compose (recommended for local dev):

```bash
docker-compose up
# PostgreSQL on :5432, API on :3001
```

---

### Mobile Setup

```bash
# 1. Navigate to the mobile app
cd triply/mobile

# 2. Install dependencies
npm install

# 3. Start the Expo dev server
expo start

# Or target a specific platform
expo start --android
expo start --ios
```

Scan the QR code with **Expo Go** on your device, or press `a` / `i` to open in an emulator.

---

### Environment Variables

**Backend** — create `triply/backend/.env`:

```env
# Required
JWT_SECRET=your_super_secret_key_here
DATABASE_URL=postgresql://user:password@localhost:5432/triply

# Optional
UPLOAD_DIR=./uploads          # Local path for photo storage (default: ./uploads)
PORT=3001                     # API port (default: 3001)
```

**Mobile** — set `API_URL` in `src/api/client.js` (or via Expo env config):

```env
API_URL=http://localhost:3001  # Local dev
# API_URL=https://triply-api.onrender.com  # Production
```

---

## API Overview

Full documentation is in [`ARCHITECTURE.md`](./ARCHITECTURE.md). Quick reference:

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/register` | — | Register with `name`, receive JWT |
| `GET` | `/auth/me` | JWT | Current user info |

### Trips

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/trips` | JWT | Create a trip |
| `GET` | `/trips` | JWT | List my trips |
| `GET` | `/trips/:id` | JWT | Trip details (members only) |
| `POST` | `/trips/join/:code` | JWT | Join via 8-char invite code |
| `GET` | `/trips/:id/members` | JWT | List trip members |
| `GET` | `/trips/:id/events` | JWT | SSE stream (real-time updates) |

### Photos

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/trips/:id/photos` | JWT | Upload photo(s) — multipart, with GPS + timestamp |
| `GET` | `/trips/:id/photos` | JWT | List photos with metadata |
| `POST` | `/photos/:id/comments` | JWT | Add a comment |
| `GET` | `/photos/:id/comments` | JWT | List comments |

### Files

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/files/:tripId/:filename` | Serve static photo / thumbnail |

---

## Deployment

### Backend — Render.com

1. Push the repo to GitHub.
2. Go to [render.com](https://render.com) → **New Web Service** → connect your repository.
3. Set the **Root Directory** to `backend`.
4. Build command: `npm install`
5. Start command: `node src/index.js`
6. Add environment variables in the Render dashboard:
   - `JWT_SECRET`
   - `DATABASE_URL` (use Render's managed PostgreSQL or an external DB)
   - `UPLOAD_DIR` (set to `/tmp/uploads` or configure Cloudflare R2)
7. Deploy. Your API will be live at `https://your-service.onrender.com`.

### Mobile — EAS Build

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in to Expo
eas login

# Configure the project (first time only)
eas build:configure

# Build a preview APK for Android
eas build --platform android --profile preview

# Build for iOS (requires Apple Developer account)
eas build --platform ios --profile preview

# Production build for both platforms
eas build --platform all --profile production
```

EAS delivers a download link for your `.apk` / `.ipa` that you can share directly or submit to the app stores.

---

## Roadmap

| Initiative | Description | Priority |
|------------|-------------|----------|
| 💰 **Freemium model** | Free tier: 3 trips / 200 photos. Paid tier: unlimited trips, higher-res exports | High |
| 📖 **Photo books** | Order a printed photobook from a trip album directly in the app | High |
| 🤖 **AI highlights** | Automatically pick the best photo per day/location using blur detection and duplicate filtering | Medium |
| 🗺️ **Trip map view** | Interactive map with photos plotted by GPS coordinates | Medium |
| 🔔 **Push notifications** | Notify trip members when new photos or comments are added (Expo Push) | Medium |
| ☁️ **Cloudflare R2** | Replace local FS storage with R2 for scalable, CDN-backed photo delivery | High |
| 🎞️ **Auto video reel** | Generate a short video highlight reel from trip photos | Low |

---

## Data Model

```
users          id, name, avatar_url, created_at
trips          id, name, start_date, end_date, cover_url, invite_code, created_by
trip_members   trip_id, user_id, joined_at
photos         id, trip_id, user_id, url, thumb_url, lat, lng, taken_at
comments       id, photo_id, user_id, text, created_at
```

---

## Contributing

1. Fork the repo and create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes and add tests where applicable
3. Run backend tests: `cd backend && npm test`
4. Open a pull request with a clear description of what changed and why

---

*Built with React Native, Expo, Fastify, and PostgreSQL.*
