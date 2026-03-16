# Triply — Architecture Documentation

> Last updated: 2026-03-16

---

## 1. Overview

Triply is a travel memory application that lets groups of friends create shared trip albums. The core value proposition is frictionless: a user creates a trip with a date range, shares an 8-character invite code with friends, and the app automatically scans each member's camera roll for photos taken during those dates and batch-uploads them into the shared album. Members can comment on individual photos in real time.

### Technology Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js (ESM) |
| Backend framework | Fastify 4.x |
| Database | SQLite via `better-sqlite3` |
| Image processing | `sharp` |
| Authentication | JWT via `@fastify/jwt` |
| File uploads | `@fastify/multipart` |
| Static file serving | `@fastify/static` |
| Real-time | Server-Sent Events (SSE) |
| Mobile framework | React Native via Expo SDK |
| Navigation | React Navigation (Native Stack) |
| Auth persistence | `@react-native-async-storage/async-storage` |
| Camera roll access | `expo-media-library` |
| Backend hosting | Render.com |
| Mobile distribution | Expo Application Services (EAS) |

---

## 2. System Architecture

```
                   ┌─────────────────────────────────────────┐
                   │            Mobile App (Expo RN)          │
                   │                                          │
                   │  ┌────────────┐   ┌──────────────────┐  │
                   │  │  App.js    │   │  store/auth.js   │  │
                   │  │ (Navigator)│   │  (AsyncStorage)  │  │
                   │  └─────┬──────┘   └──────────────────┘  │
                   │        │                                  │
                   │  ┌─────▼──────┬────────────┬──────────┐ │
                   │  │RegisterScr.│ TripsScr.  │AlbumScr. │ │
                   │  └────────────┴─────┬──────┴──────────┘ │
                   │                     │  PhotoScreen       │
                   │             ┌───────▼──────────┐        │
                   │             │   api/client.js   │        │
                   │             │  fetch + Bearer   │        │
                   └─────────────┼───────────────────┼────────┘
                                 │ HTTPS REST        │ SSE / polling
                                 ▼                   ▼
                   ┌─────────────────────────────────────────┐
                   │           Fastify API (Render)           │
                   │                                          │
                   │  ┌──────────┐ ┌──────────┐ ┌────────┐  │
                   │  │auth.js   │ │trips.js  │ │photo.js│  │
                   │  └──────────┘ └──────────┘ └────────┘  │
                   │                   ┌────────────────┐    │
                   │                   │    sse.js      │    │
                   │                   │ (in-process    │    │
                   │                   │  rooms Map)    │    │
                   │                   └────────────────┘    │
                   │                                          │
                   │  ┌──────────────────────────────────┐   │
                   │  │         db/index.js               │   │
                   │  │  better-sqlite3 (WAL mode)        │   │
                   │  └───────────────┬──────────────────┘   │
                   │                  │                        │
                   │  ┌───────────────▼──────────────────┐   │
                   │  │  triply.db  (SQLite file)          │   │
                   │  └──────────────────────────────────┘   │
                   │                                          │
                   │  ┌──────────────────────────────────┐   │
                   │  │  /uploads/{tripId}/{photoId}.jpg  │   │
                   │  │  /uploads/{tripId}/{id}_thumb.jpg │   │
                   │  │  served via @fastify/static        │   │
                   │  └──────────────────────────────────┘   │
                   └─────────────────────────────────────────┘
```

### Component Relationships

- The mobile app has no Redux or Context; all server state is fetched on mount or navigation focus.
- `App.js` bootstraps auth by reading `AsyncStorage`. If no user record is found, `RegisterScreen` is rendered outside of the navigator (it replaces the full screen). Once registered, the navigator stack takes over.
- `api/client.js` is a thin `fetch` wrapper. Every call reads the JWT from `AsyncStorage` before each request.
- The backend is a single Fastify process. SQLite runs in-process with WAL journal mode enabled for concurrent reads.
- SSE room state (`clients` Map) lives in the server process memory. It is not persisted; connections are dropped on server restart.

---

## 3. Backend — API Routes

Base URL (production): `https://triply-api.onrender.com`

All routes except `POST /auth/register` and `GET /health` require an `Authorization: Bearer <token>` header. The `app.authenticate` Fastify decorator calls `req.jwtVerify()` and returns `401` on failure.

### 3.1 Auth

#### `POST /auth/register`

Creates a new user account and returns a JWT. No password — identity is established by name only (anonymous-style onboarding).

**Request body**
```json
{ "name": "Anna K." }
```

**Response `200`**
```json
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "name": "Anna K.",
    "avatar_url": null
  }
}
```

**Errors**
- `400` — name missing or blank

**Side effects:** Inserts a row into `users`. UUID generated via `crypto.randomUUID()`. Signs a JWT with payload `{ userId, name }`. No expiry is set (relies on `JWT_SECRET` env var; falls back to `"dev_secret"` in development — **this must be overridden in production**).

---

#### `GET /auth/me`

Returns the authenticated user's profile.

**Response `200`**
```json
{
  "id": "uuid",
  "name": "Anna K.",
  "avatar_url": null,
  "created_at": "2025-07-01 12:00:00"
}
```

Returns `null` (not `404`) if the user row has been deleted.

---

### 3.2 Trips

#### `POST /trips`

Creates a new trip. The creator is automatically added as the first member.

**Request body**
```json
{
  "name": "Baikal 2025",
  "start_date": "2025-07-01",
  "end_date": "2025-07-10"
}
```

**Response `201`** — full trip row including `invite_code`

**Notes**
- `invite_code` is the first 8 characters of a new `crypto.randomUUID()`, e.g. `"a3f8bc12"`. Unique constraint enforced at DB level.
- Creator is inserted into `trip_members` in the same request.

---

#### `GET /trips`

Returns all trips where the authenticated user is a member, ordered by `start_date DESC`. Aggregates `photo_count` and `member_count` via a single SQL join.

**Response `200`** — array of trip rows, each with `photo_count: integer` and `member_count: integer`

---

#### `GET /trips/:id`

Returns a single trip with `photo_count`. Returns `404` if the trip does not exist or the user is not a member (membership check is part of the JOIN condition, not a separate query).

---

#### `POST /trips/join/:code`

Joins a trip by its 8-character invite code. Uses `INSERT OR IGNORE` so calling it multiple times is idempotent.

**URL param** — `:code` — the invite code string

**Response `200`** — the full trip row

**Errors**
- `404` — no trip with that invite code

---

#### `GET /trips/:id/members`

Returns all members of a trip with their join timestamps.

**Response `200`**
```json
[
  {
    "id": "uuid",
    "name": "Anna K.",
    "avatar_url": null,
    "joined_at": "2025-07-01 12:00:00"
  }
]
```

**Note:** No membership check — any authenticated user can call this if they know the trip ID.

---

### 3.3 Photos

#### `POST /trips/:tripId/photos`

Uploads one or more photos for a trip. Uses `multipart/form-data`. Membership in the trip is verified before processing any files.

**Multipart fields**

| Field | Type | Description |
|---|---|---|
| `file` | file | Binary image data. Can appear multiple times for batch upload. |
| `lat` | field | GPS latitude as a decimal string (optional) |
| `lng` | field | GPS longitude as a decimal string (optional) |
| `taken_at` | field | ISO 8601 timestamp when the photo was taken (optional) |

**File size limit:** 50 MB per file (configured at the Fastify multipart plugin level).

**Processing pipeline per file:**
1. Stream file to disk at `uploads/{tripId}/{uuid}.{ext}` using `pipeline(part.file, createWriteStream(...))`.
2. Generate a 400px-wide JPEG thumbnail at `uploads/{tripId}/{uuid}_thumb.jpg` using `sharp().resize(400).jpeg({ quality: 75 })`. Non-image files silently skip thumbnail generation.
3. Insert a row into `photos` with URL paths `/files/{tripId}/{uuid}.{ext}` and `/files/{tripId}/{uuid}_thumb.jpg`.
4. Broadcast a `new_photo` SSE event to all connected clients in the trip's SSE room.

**Response `201`** — array of all successfully saved photo rows

**Errors**
- `403` — user is not a member of the trip

---

#### `GET /trips/:tripId/photos`

Returns all photos for a trip ordered by `COALESCE(taken_at, created_at)` ascending. Includes `author_name`, `author_avatar`, and `comment_count` via a single SQL join.

**Response `200`**
```json
[
  {
    "id": "uuid",
    "trip_id": "uuid",
    "user_id": "uuid",
    "url": "/files/tripId/photoId.jpg",
    "thumb_url": "/files/tripId/photoId_thumb.jpg",
    "lat": 51.6755,
    "lng": 103.0558,
    "taken_at": "2025-07-03T14:22:00.000Z",
    "created_at": "...",
    "author_name": "Anna K.",
    "author_avatar": null,
    "comment_count": 2
  }
]
```

**Errors**
- `403` — user is not a member of the trip

---

#### `POST /photos/:photoId/comments`

Adds a comment to a photo. After inserting, broadcasts a `new_comment` SSE event keyed to the `photoId` room.

**Request body**
```json
{ "text": "What a view!" }
```

**Response `201`** — comment row including `author_name`

**Errors**
- `400` — text missing or blank

**Note:** No membership check. Any authenticated user who knows a `photoId` can comment.

---

#### `GET /photos/:photoId/comments`

Returns all comments for a photo in chronological order, including `author_name` and `author_avatar`.

---

### 3.4 Real-time

#### `GET /trips/:tripId/events`

Opens a persistent SSE connection for a trip room. See section 7 for full details.

---

### 3.5 Static Files

#### `GET /files/:tripId/:filename`

Serves uploaded photos and thumbnails from the filesystem via `@fastify/static`. No authentication required — URLs are unguessable by construction (UUID-based filenames).

---

### 3.6 Health

#### `GET /health`

Returns `{ "status": "ok" }`. No authentication. Used by Render for liveness checks.

---

## 4. Database Schema

The database is a single SQLite file (`triply.db`). WAL mode and foreign key enforcement are enabled on every connection open via `db.pragma('journal_mode = WAL')` and `db.pragma('foreign_keys = ON')`. The schema is applied idempotently via `CREATE TABLE IF NOT EXISTS` on startup (`db/index.js` reads and executes `schema.sql`).

**Schema file:** `/Users/sokolovdmitry/projects/triply/backend/src/db/schema.sql`

### 4.1 `users`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `name` | TEXT | NOT NULL | Display name entered at registration |
| `avatar_url` | TEXT | nullable | Reserved for future avatar upload |
| `created_at` | TEXT | DEFAULT datetime('now') | UTC timestamp |

### 4.2 `trips`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `name` | TEXT | NOT NULL | Human-readable trip name |
| `start_date` | TEXT | NOT NULL | ISO date string `YYYY-MM-DD` |
| `end_date` | TEXT | NOT NULL | ISO date string `YYYY-MM-DD` |
| `cover_url` | TEXT | nullable | Reserved for future cover photo feature |
| `invite_code` | TEXT | UNIQUE NOT NULL | 8-character hex code used for join links |
| `created_by` | TEXT | REFERENCES users(id) ON DELETE SET NULL | Creator's user ID |
| `created_at` | TEXT | DEFAULT datetime('now') | UTC timestamp |

### 4.3 `trip_members`

Many-to-many join table between trips and users.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `trip_id` | TEXT | FK → trips(id) ON DELETE CASCADE | |
| `user_id` | TEXT | FK → users(id) ON DELETE CASCADE | |
| `joined_at` | TEXT | DEFAULT datetime('now') | |

**Primary key:** `(trip_id, user_id)` — prevents duplicate membership.

**Index:** `idx_members_user` on `(user_id)` — speeds up `GET /trips` which filters by `user_id`.

### 4.4 `photos`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `trip_id` | TEXT | FK → trips(id) ON DELETE CASCADE | |
| `user_id` | TEXT | FK → users(id) ON DELETE SET NULL | Uploader |
| `url` | TEXT | NOT NULL | Relative path: `/files/{tripId}/{id}.{ext}` |
| `thumb_url` | TEXT | nullable | Relative path: `/files/{tripId}/{id}_thumb.jpg` |
| `lat` | REAL | nullable | GPS latitude |
| `lng` | REAL | nullable | GPS longitude |
| `taken_at` | TEXT | nullable | ISO 8601 timestamp from device; used for chronological sort |
| `created_at` | TEXT | DEFAULT datetime('now') | Upload timestamp |

**Index:** `idx_photos_trip` on `(trip_id)`.

### 4.5 `comments`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `photo_id` | TEXT | FK → photos(id) ON DELETE CASCADE | |
| `user_id` | TEXT | FK → users(id) ON DELETE SET NULL | Author |
| `text` | TEXT | NOT NULL | Comment body |
| `created_at` | TEXT | DEFAULT datetime('now') | UTC timestamp |

**Index:** `idx_comments_photo` on `(photo_id)`.

### Entity-Relationship Summary

```
users ──< trip_members >── trips
users ──< photos >──────── trips
users ──< comments >─────── photos
```

---

## 5. Mobile App

### 5.1 Entry Point and Navigation

**File:** `/Users/sokolovdmitry/projects/triply/mobile/App.js`

On mount, reads the cached user from `AsyncStorage`. While reading, a full-screen spinner is shown. If no user is found, `RegisterScreen` is rendered directly — outside the Navigator. This acts as an auth gate; no navigator screen is reachable without a valid user in storage.

**Navigator structure** (`createNativeStackNavigator`):

```
RegisterScreen  (rendered outside navigator — auth gate)
    │
    └─ onRegistered(user) → Navigator mounts
           │
           ├── Trips       (TripsScreen)      title: "My Trips"
           │       │
           │       └── navigate('Album', { trip })
           │                   │
           │                   └── navigate('Photo', { photo, trip })
           └──────────────────────────────────────────────────────────
```

### 5.2 Screen Reference

#### RegisterScreen

**File:** `/Users/sokolovdmitry/projects/triply/mobile/src/screens/RegisterScreen.js`

Single `TextInput` for display name. On submit, calls `POST /auth/register`, saves `{ token, user }` to `AsyncStorage` via `saveAuth()`, and calls `onRegistered(user)` to trigger navigator mount in `App.js`. No password, no email.

---

#### TripsScreen

**File:** `/Users/sokolovdmitry/projects/triply/mobile/src/screens/TripsScreen.js`

- Loads trips from `GET /trips` on mount and on every `navigation.focus` event (pull-to-refresh also supported).
- Two floating action buttons: **"+ New trip"** and **"Join"**.
- **Create trip modal:** Name input + two date pickers (`@react-native-community/datetimepicker`). Dates are parsed as local midnight to avoid UTC offset shifting. Calls `POST /trips` and navigates to `AlbumScreen`.
- **Join trip modal:** Single text input for the 8-character code. Calls `POST /trips/join/:code` and navigates to `AlbumScreen`.
- Each trip card displays: name, date range, photo count, member count, and invite code.

---

#### AlbumScreen

**File:** `/Users/sokolovdmitry/projects/triply/mobile/src/screens/AlbumScreen.js`

- On mount: loads photos via `GET /trips/:tripId/photos`, sets the header title to the trip name, and starts polling.
- Renders photos in a 3-column grid. Each thumbnail is `(screenWidth - 4) / 3` pixels square with 1px margins.
- Tapping a thumbnail navigates to `PhotoScreen`.
- Footer bar: **"Scan photos"** button and **"Invite"** button (shows invite code in an Alert). During upload, footer shows a progress bar.

##### Camera Roll Auto-Scan

Triggered by tapping "Scan photos":

1. `MediaLibrary.requestPermissionsAsync()` — requests `MEDIA_LIBRARY` permission. Aborts with an alert if denied.
2. Trip's `start_date` and `end_date` strings are parsed as **local midnight / end-of-day** (e.g. `new Date(2025, 6, 1, 0, 0, 0)`) to correctly bracket the date range without UTC offset issues.
3. `MediaLibrary.getAssetsAsync({ mediaType: 'photo', createdAfter, createdBefore, first: 500, sortBy: creationTime })` — fetches up to 500 photo assets from the system camera roll within the date range.
4. If no assets found, shows an alert and returns.
5. If assets found, shows count + offers "Review first", "Upload all", or "Cancel". Both confirm options currently call the same `uploadPhotos()` function (a review-before-upload screen is a planned future feature).

##### Upload Pipeline (per asset, sequential)

1. `MediaLibrary.getAssetInfoAsync(asset)` — fetches full info including `localUri` and `location`.
2. Builds a `FormData` object with `file: { uri, name, type }`, and optionally `lat`, `lng`, `taken_at`.
3. Calls `api.upload('/trips/:tripId/photos', form)` — `POST` with raw `FormData` (Content-Type boundary set by React Native automatically).
4. Failed individual uploads are silently skipped with no retry.
5. After all uploads complete, shows a summary alert and calls `loadPhotos()` to refresh the grid.

---

#### PhotoScreen

**File:** `/Users/sokolovdmitry/projects/triply/mobile/src/screens/PhotoScreen.js`

- Displays full-resolution image at `{API_URL}{photo.url}` at full screen width.
- Shows author name and formatted `taken_at` date.
- Lists comments loaded from `GET /photos/:photoId/comments` on mount.
- Comment input at the bottom; calls `POST /photos/:photoId/comments` on send and reloads comments.
- `KeyboardAvoidingView` handles iOS keyboard overlap.
- No real-time refresh — requires navigating away and back to see new comments.

---

### 5.3 API Client

**File:** `/Users/sokolovdmitry/projects/triply/mobile/src/api/client.js`

```
API_URL = 'https://triply-api.onrender.com'

api.get(path)          → GET  with Bearer token
api.post(path, body)   → POST with JSON body + Bearer token
api.upload(path, form) → POST with FormData + Bearer token
```

Reads the JWT from `AsyncStorage` on every call. On non-OK responses, parses the JSON error body and throws a plain `Error`. No retry logic.

---

### 5.4 Auth Store

**File:** `/Users/sokolovdmitry/projects/triply/mobile/src/store/auth.js`

Thin wrapper over `AsyncStorage`:

| Function | Storage keys | Description |
|---|---|---|
| `saveAuth(token, user)` | `@triply_token`, `@triply_user` | Persists JWT and user object |
| `getToken()` | `@triply_token` | Returns raw JWT string or `null` |
| `getUser()` | `@triply_user` | Returns parsed user object or `null` |
| `clearAuth()` | both | Removes both keys (logout — not wired to any UI yet) |

---

## 6. Auth Flow

Triply uses name-only registration. There is no password, no email, and no login screen after initial registration.

```
First launch
    │
    ▼
App.js reads AsyncStorage
    │
    ├── user found ──────────────────────────────► Navigator (already authed)
    │
    └── no user
            │
            ▼
        RegisterScreen: user enters name
            │
            ▼
        POST /auth/register { name }
            │
            ▼
        Server:
            crypto.randomUUID() → userId
            INSERT INTO users (id, name)
            app.jwt.sign({ userId, name })   ← no expiry configured
            │
            ▼
        { token, user } returned
            │
            ▼
        saveAuth(token, user) → AsyncStorage
            │
            ▼
        App.js setUser(user) → Navigator mounts
            │
            ▼
        All subsequent API calls:
            getToken() → AsyncStorage
            Authorization: Bearer <token>
            │
            ▼
        Fastify app.authenticate decorator:
            req.jwtVerify() — verifies HS256 signature
            req.user = { userId, name }
```

**Token characteristics:**
- Algorithm: HS256 (Fastify JWT default)
- No expiry (`expiresIn` not set — token is valid indefinitely)
- Secret: `JWT_SECRET` environment variable; falls back to `"dev_secret"` — this fallback must not be used in production
- Payload: `{ userId: string, name: string }`

No refresh token mechanism exists. Token remains valid until the secret is rotated.

---

## 7. Real-time Updates

### SSE Server Implementation

**File:** `/Users/sokolovdmitry/projects/triply/backend/src/routes/sse.js`

The server maintains an in-process `Map<roomId, Set<reply>>` called `clients`. Two room types are used:

- **Trip room** (`roomId = tripId`): receives `new_photo` events when a photo is uploaded.
- **Photo room** (`roomId = photoId`): receives `new_comment` events when a comment is posted.

### SSE Connection Lifecycle

```
Client → GET /trips/:tripId/events  (with Bearer token)
    │
    ▼
Server sets headers:
    Content-Type:  text/event-stream
    Cache-Control: no-cache
    Connection:    keep-alive
    │
    ▼
Writes initial comment :\n\n  (opens connection)
    │
    ▼
clients.get(tripId).add(reply)
    │
    ├── Every 20s: writes ": ping\n\n" heartbeat
    │
    └── On req.raw 'close' event:
            clearInterval(heartbeat)
            clients.get(tripId).delete(reply)
            await new Promise(() => {})  keeps handler open until disconnect
```

### SSE Event Payloads

**`new_photo`** — emitted after photo is written to DB:
```
data: {"type":"new_photo","photo":{...full photo row}}
```

**`new_comment`** — emitted after comment is written to DB. The room key is `photoId`, not `tripId`:
```
data: {"type":"new_comment","comment":{...comment row with author_name}}
```

### Client-Side Reality — Polling Fallback

`AlbumScreen.connectSSE()` in the mobile app contains an explicit note:

> "Native EventSource not available — use polling fallback for MVP"

The current implementation uses `setInterval(loadPhotos, 10000)` — a 10-second polling loop. A fake `{ close: () => clearInterval(interval) }` object is stored in `esRef` so the `useEffect` cleanup call works correctly.

The SSE endpoint is fully built on the server side. The mobile client cannot use it without a polyfill (e.g. `react-native-event-source`) because React Native does not include a native `EventSource` implementation.

`PhotoScreen` does not refresh comments automatically at all — the user must navigate away and back.

---

## 8. File Storage

### Directory Layout

```
uploads/
└── {tripId}/
    ├── {photoId}.{ext}        ← original file, streamed to disk
    ├── {photoId}_thumb.jpg    ← 400px wide, JPEG quality 75
    ├── {photoId2}.{ext}
    ├── {photoId2}_thumb.jpg
    └── ...
```

The root `UPLOAD_DIR` is resolved from the `UPLOAD_DIR` environment variable, defaulting to `../../uploads` relative to `src/index.js`. The directory is created with `mkdirSync({ recursive: true })` on server startup.

### Serving Files

Files are served by `@fastify/static` mounted at the `/files/` prefix. The full public URL pattern is:

```
https://triply-api.onrender.com/files/{tripId}/{photoId}.jpg
https://triply-api.onrender.com/files/{tripId}/{photoId}_thumb.jpg
```

These relative paths are stored as-is in `photos.url` and `photos.thumb_url`. The mobile client prepends `API_URL` when constructing `Image` source URIs.

### Upload Flow Detail

1. `@fastify/multipart` parses the `multipart/form-data` request as an async iterator via `req.parts()`.
2. Non-file fields (`lat`, `lng`, `taken_at`) are consumed first.
3. For each `file` part: extension is extracted from the original filename; file is streamed to disk with `pipeline(part.file, createWriteStream(origPath))` — no buffering in memory.
4. `sharp` reads the saved file to generate the thumbnail. If `sharp` throws (non-image file), the error is silently caught — `thumb_url` will reference a file that does not exist on disk.
5. A single DB row is inserted after both files are written.

### Current Limitations

- **No deduplication.** The same photo can be uploaded multiple times; each gets a new UUID.
- **No deletion endpoint.** No API exists to delete photos or their files.
- **Ephemeral filesystem on Render.** Files are lost on every deployment or dyno restart. See section 10 for the S3 migration plan.
- **50 MB per-file hard limit** enforced by the multipart plugin.

---

## 9. Deployment

### Backend — Render.com

The API is deployed as a Render web service at `https://triply-api.onrender.com`.

**Required environment variables:**

| Variable | Description | Default (insecure) |
|---|---|---|
| `PORT` | HTTP port | `3001` |
| `JWT_SECRET` | HMAC secret for JWT signing | `"dev_secret"` |
| `UPLOAD_DIR` | Absolute path for file storage | `../../uploads` |
| `DB_PATH` | Absolute path for SQLite file | `../../../triply.db` |

**Start command:** `node src/index.js` (ESM, no build step)

**Dockerfile:** Present at `/Users/sokolovdmitry/projects/triply/backend/Dockerfile`. A `docker-compose.yml` exists at the repo root for local development.

**Cold-start concern:** Render's free tier spins down the service after inactivity. The first request after spin-down incurs cold-start latency (~30s). The `/health` endpoint can be pinged by an uptime monitor to keep the service warm.

**Persistence concern (critical):** Both `triply.db` and the `uploads/` directory live on Render's ephemeral filesystem. All data is lost on every new deployment. For production readiness, `DB_PATH` should point to a Render Persistent Disk mount and file uploads must be migrated to S3-compatible storage.

---

### Mobile — Expo Application Services (EAS)

**App config:** `/Users/sokolovdmitry/projects/triply/mobile/app.json`

| Field | Value |
|---|---|
| App name | Triply |
| Slug | triply |
| Version | 1.0.0 |
| Android package | `com.triply.app` |
| EAS Project ID | `ae4dcbf6-9dfc-475f-9100-2c8db3531979` |
| EAS owner | `urbivarenye1` |
| Orientation | portrait only |
| iOS tablet support | `true` (declared, no iOS build profile configured yet) |

**EAS build config:** `/Users/sokolovdmitry/projects/triply/mobile/eas.json`

| Profile | Platform | Output |
|---|---|---|
| `preview` | Android | APK |
| `production` | Android | APK |

iOS builds are not configured in `eas.json`. `app.json` declares `ios.supportsTablet: true`, suggesting iOS support is planned.

**Registered Expo plugin:** `@react-native-community/datetimepicker` — required for native date picker on both platforms.

**Build commands:**
```bash
eas build --profile preview --platform android     # APK for testing
eas build --profile production --platform android  # Production APK
```

---

## 10. Future Considerations

The following items are referenced in code comments, implied by placeholder schema columns, or are natural next steps given the current architecture.

### S3 / Object Storage Migration (critical for production)

The most pressing infrastructure gap. Migration path:

1. Add an S3-compatible client (e.g. `@aws-sdk/client-s3`).
2. Replace `pipeline(part.file, createWriteStream(...))` in `photos.js` with a stream-to-S3 upload.
3. Run `sharp` on a temporary local buffer or pipe through `sharp` before the S3 upload.
4. Store the full S3/CDN URL in `photos.url` and `photos.thumb_url`.
5. Remove `@fastify/static` or retain it only for local development.
6. Set `UPLOAD_DIR` to a Render Persistent Disk mount as an interim measure if S3 migration is delayed.

Cloudflare R2 is referenced in the existing planning notes as the target (S3-compatible, zero egress fees).

### Native SSE Client

Replace the 10-second polling loop in `AlbumScreen.connectSSE()` with a real SSE connection using `react-native-event-source` or `expo-sse`. The server-side SSE implementation is already complete and requires no changes.

### Push Notifications

When a trip member uploads photos or comments, other members only see updates on the next poll cycle. Implementation requires:

- New column or table to store Expo push tokens per user.
- Call the Expo Push API from the backend after `app.sse.broadcast()` in `photos.js`.

### Photo Review Before Upload

The scan result alert in `AlbumScreen` offers "Review first" but it currently calls the same upload function as "Upload all". A dedicated review screen — a selectable grid of found assets — is the intended next step to complete this feature.

### User Avatars

`users.avatar_url` and `author_avatar` are present in the schema and join queries but no upload endpoint exists. A `POST /auth/avatar` multipart endpoint would follow the same pattern as photo upload.

### Trip Cover Photos

`trips.cover_url` is in the schema but no endpoint sets it. The intent is to allow designating a photo as the trip cover for the `TripsScreen` card.

### Map View

`lat` and `lng` are stored per photo. A map screen plotting photos by GPS coordinates (e.g. using `react-native-maps`) would be straightforward to add given the existing data.

### Pagination

`GET /trips/:tripId/photos` returns all photos with no limit. Cursor-based pagination should be added before albums with hundreds of photos reach production.

### Security Hardening

- **JWT expiry:** Tokens never expire. Adding `expiresIn: '30d'` and a refresh token flow would limit exposure from a leaked token.
- **Member check on `POST /photos/:photoId/comments`:** Any authenticated user who knows a `photoId` can comment. A join to `trip_members` via `photos.trip_id` would close this.
- **Member check on `GET /trips/:id/members`:** Any authenticated user can list members of any trip by ID.
- **Rate limiting:** No rate limiting on any endpoint. `@fastify/rate-limit` is a straightforward addition.
- **Input length limits:** Comment text and trip name have no maximum length.

### Database — PostgreSQL Migration

`db/index.js` includes a `query()` function with a comment noting pg-compatible interface intent, indicating a move to PostgreSQL was anticipated. The schema uses only standard SQL features compatible with both engines. The migration would be:

1. Provision a PostgreSQL instance (Render managed DB or equivalent).
2. Replace `better-sqlite3` with `pg` pool.
3. Update `DB_PATH` env var to `DATABASE_URL`.
4. Replace `db.prepare().run()` / `.get()` / `.all()` call sites with `pool.query()`.
5. Dates stored as TEXT in SQLite should become native `TIMESTAMP` columns in Postgres.

### Monetization

No monetization logic exists. Possible approaches aligned with the product:

- **Storage tier:** Free users capped at N photos per trip; paid tier unlimited.
- **Premium features:** HD export, map view, AI best-photo selection (deduplication of blurry/duplicate shots from camera roll batch).
- **Team/family plan:** Increased member limits per trip.
