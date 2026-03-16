# Triply — Architecture

## Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Mobile | Expo (React Native) | Camera roll access, GPS, push notifications |
| API | Node.js + Fastify | Fast, lightweight, ESM native |
| DB | PostgreSQL | Relational, reliable, great for media metadata |
| Storage | Local FS → Cloudflare R2 | Free egress, S3-compatible |
| Real-time | Server-Sent Events (SSE) | Simple, works everywhere, no WS overhead for MVP |
| Auth | JWT (device-based) | No passwords for MVP — name only |

## Project Structure

```
triply/
├── docker-compose.yml          # Local dev: PostgreSQL + API
├── ARCHITECTURE.md             # This file
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── index.js            # Fastify app entrypoint
│   │   ├── db/
│   │   │   ├── index.js        # pg Pool
│   │   │   └── schema.sql      # DB schema (auto-applied on first run)
│   │   └── routes/
│   │       ├── auth.js         # POST /auth/register, GET /auth/me
│   │       ├── trips.js        # CRUD trips + join by invite code
│   │       ├── photos.js       # Upload, list, comments
│   │       └── sse.js          # Server-Sent Events for real-time
│   └── test/
│       └── api.test.js         # Integration tests (node:test)
└── mobile/                     # Expo app (next step)
```

## Data Model

```
users
  id, name, avatar_url, created_at

trips
  id, name, start_date, end_date, cover_url, invite_code, created_by

trip_members
  trip_id, user_id, joined_at

photos
  id, trip_id, user_id, url, thumb_url, lat, lng, taken_at

comments
  id, photo_id, user_id, text, created_at
```

## API Endpoints

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/register | — | Register with name, get JWT |
| GET | /auth/me | JWT | Current user info |

### Trips
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /trips | JWT | Create trip |
| GET | /trips | JWT | My trips |
| GET | /trips/:id | JWT | Trip detail (members only) |
| POST | /trips/join/:code | JWT | Join via invite code |
| GET | /trips/:id/members | JWT | List members |
| GET | /trips/:id/events | JWT | SSE stream for real-time updates |

### Photos
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /trips/:id/photos | JWT | Upload photo(s) (multipart) |
| GET | /trips/:id/photos | JWT | List photos with metadata |
| POST | /photos/:id/comments | JWT | Add comment |
| GET | /photos/:id/comments | JWT | List comments |

### Files
| Method | Path | Description |
|--------|------|-------------|
| GET | /files/:tripId/:filename | Static file serving |

## Auto-upload Flow (mobile)

```
User creates trip (name + date range)
    ↓
expo-media-library scans camera roll
  filter: creationTime between start_date and end_date
  filter: GPS coords near trip location (optional)
    ↓
Show preview grid to user
  "Found 189 photos — upload all?"
    ↓
Background upload (chunked, resumable)
  POST /trips/:id/photos (multipart)
  sends: file + lat + lng + taken_at
    ↓
SSE broadcasts new_photo event to all trip members
```

## Real-time (SSE)

Events broadcasted per trip:
- `new_photo` — someone uploaded a photo
- `new_comment` — comment added to a photo

Client connects to `GET /trips/:id/events` and listens.

## Local Development

```bash
docker-compose up          # starts PostgreSQL + API on :3000
npm test                   # run integration tests (API must be running)
```

## Next Steps

- [ ] Mobile app (Expo) — trip creation, invite flow, auto-upload
- [ ] Thumbnails served via CDN (Cloudflare R2 + Images)
- [ ] Map view — photos plotted by GPS coordinates
- [ ] Push notifications (Expo Push)
- [ ] AI best-photo selection (filter blurry/duplicate)
- [ ] Cloudflare R2 for production storage
