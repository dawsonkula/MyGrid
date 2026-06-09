# MyGrid - Motorsports Media Platform

MyGrid connects drivers with media creators at motorsports events. Users attend events in flexible roles (Driver, Media Creator, or Both), browse creator portfolios, book sessions through packages, and communicate via real-time messaging.

## Tech Stack

- **Frontend**: React Native Expo (file-based routing via expo-router)
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Image Storage**: Cloudinary (persistent, survives redeploys)
- **State Management**: React Query (server state), React Context (auth)
- **Messaging**: Polling-based with refresh-on-focus (15s chat, 30s conversations)

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-provided on Replit) |
| `SESSION_SECRET` | Yes | Secret for session encryption. Use a strong random string. |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary cloud name from your dashboard |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API secret |
| `ALLOW_LOCAL_UPLOAD_FALLBACK` | Optional | Set to `true` to allow local disk uploads when Cloudinary is not configured. Defaults to `true` in development, `false` in production. |
| `ADMIN_KEY` | Production | Required to run the seed endpoint in production. |
| `EXPO_PUBLIC_API_URL` | Yes (mobile) | Full base URL of the API (e.g. `https://myapp.replit.app`). Required for mobile builds to resolve API and upload URLs. |

## Cloudinary Setup

1. Create a free account at [cloudinary.com](https://cloudinary.com).
2. From the Cloudinary Dashboard, copy your **Cloud Name**, **API Key**, and **API Secret**.
3. Add them as secrets in Replit (Secrets tab) or as environment variables locally.
4. The app uses signed uploads: the server generates a signature, and the client uploads directly to Cloudinary. This keeps the API secret server-side.

## Public Teaser Mode

Logged-out visitors can see a teaser view of events on the landing page. The API automatically redacts sensitive data for unauthenticated requests:
- **Events**: Only basic info (name, location, dates, banner) is returned; organizer data is hidden.
- **Event Attendees**: Require authentication to view.
- **User Profiles**: Only display name, profile image, and role flags are visible; social links, packages, and portfolio are hidden.

This allows the landing page to showcase events while keeping detailed information private until users sign in.

## Running on Replit

1. The PostgreSQL database is provisioned automatically.
2. Set `SESSION_SECRET` and the three `CLOUDINARY_*` variables in the Secrets tab.
3. Click **Run** -- both the backend (port 5000) and Expo dev server (port 8081) start automatically.
4. Scan the QR code with Expo Go on your phone, or open the web preview.

## Running Locally

```bash
# Install dependencies
npm install

# Set environment variables
export DATABASE_URL="postgresql://user:pass@localhost:5432/mygrid"
export SESSION_SECRET="your-secret-here"
export CLOUDINARY_CLOUD_NAME="your-cloud-name"
export CLOUDINARY_API_KEY="your-api-key"
export CLOUDINARY_API_SECRET="your-api-secret"

# Push database schema
npm run db:push

# Start backend (port 5000)
npm run server:dev

# In a separate terminal, start Expo
npx expo start
```

## How Uploads Work

1. The user selects a photo via `expo-image-picker`.
2. The image is compressed client-side using `expo-image-manipulator` (max 1600px wide, 75% JPEG quality).
3. The client requests a signed upload token from `POST /api/uploads/signature`.
4. The client uploads the image directly to Cloudinary using the signed credentials.
5. Cloudinary returns a `secure_url` (persistent HTTPS URL).
6. The client saves a portfolio entry with the Cloudinary URL via `POST /api/portfolio`.
7. If Cloudinary is not configured, the client attempts `POST /api/uploads` (local disk via multer, 10MB limit). This fallback is controlled by the `ALLOW_LOCAL_UPLOAD_FALLBACK` flag.

## Upload Fallback Behavior

The `ALLOW_LOCAL_UPLOAD_FALLBACK` environment variable controls what happens when Cloudinary is not configured:

| Environment | Default | Behavior |
|---|---|---|
| Development | `true` | Local disk uploads allowed via `POST /api/uploads` |
| Production | `false` | Upload returns `503` with "Uploads not configured. Please set Cloudinary env vars." |

Set `ALLOW_LOCAL_UPLOAD_FALLBACK=false` explicitly to disable local uploads in any environment. In beta/production, Cloudinary should always be configured -- the app will not silently fall back to local storage.

## Messaging

Messages use polling-based updates, not persistent WebSocket connections:
- Chat messages poll every 15 seconds.
- Conversation list polls every 30 seconds.
- Screens refresh data automatically when navigated to (refresh-on-focus via `useFocusEffect`).
- A WebSocket server exists for real-time notification delivery but the client does not currently maintain a persistent connection.

## Health Check

`GET /health` returns the server status including:
- `db`: database connectivity
- `cloudinary_configured`: whether Cloudinary env vars are set
- `local_upload_fallback_enabled`: whether local disk uploads are allowed

## Seeding Data

```bash
# Development (no key required)
curl -X POST http://localhost:5000/api/seed

# Production (requires ADMIN_KEY)
curl -X POST https://your-app.replit.app/api/seed \
  -H "x-admin-key: YOUR_ADMIN_KEY"
```

The seed endpoint creates sample motorsports events. It is idempotent -- it will not create duplicates if events already exist.

## Project Structure

```
app/                    # Expo Router pages
  (auth)/               # Login & Register screens
  (tabs)/               # Main tab screens (Home, Events, Messages, Bookings, Profile)
  booking/create.tsx    # Booking creation modal
  chat/[userId].tsx     # Direct messaging
  event/[id].tsx        # Event detail
  profile/[id].tsx      # Public profile view
  onboarding.tsx        # Post-registration onboarding

server/                 # Express backend
  routes.ts             # API routes + WebSocket + Cloudinary signature + file upload
  storage.ts            # Database operations (Drizzle ORM)
  db.ts                 # Database connection
  index.ts              # Express app setup, CORS, logging, error handling

shared/
  schema.ts             # Drizzle schema + Zod validators

uploads/                # Local upload fallback (dev only, not persistent, gitignored)
```

## Export / Deployment Notes

ZIP exports and deployments should not include these directories:
`.expo/`, `.config/`, `.git/`, `node_modules/`, `uploads/`, or `.env`.
All of these are listed in `.gitignore`. To produce a clean export manually:

```bash
zip -r mygrid-release.zip . -x 'node_modules/*' '.git/*' '.expo/*' '.config/*' 'uploads/*' '.env'
```
