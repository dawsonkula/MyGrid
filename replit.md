# MyGrid - Motorsports Media Platform

## Overview
MyGrid is a mobile-first motorsports platform built with React Native Expo. Its primary purpose is to connect drivers with media creators for event-based bookings. Users can participate in events as a Driver, Media Creator, or both, browse creator portfolios, book sessions through packages, and communicate via real-time messaging. The platform aims to streamline the booking and content delivery process within the motorsports community.

## User Preferences
- Mobile-first design approach
- Dark theme mandatory
- Icon buttons preferred over text buttons
- No emojis in UI

## System Architecture
The platform features a React Native Expo frontend utilizing `expo-router` for file-based routing, an Express.js backend with TypeScript, and a PostgreSQL database managed by Drizzle ORM. State management is handled by React Query for server state and React Context for authentication. Real-time features, such as message notifications, are powered by WebSockets.

**Key Design Decisions:**
- **Theming:** A dark motorsports theme with an electric orange (`#FF4D00`) primary accent.
- **Role System:** Supports multi-role event attendance (driver/creator/both) with `maxBookings` for creators.
- **Portfolio & Uploads:** Cloudinary for persistent image and video uploads (signed uploads), with a local disk fallback for images up to 10MB. External video links (YouTube/Vimeo) are also supported.
- **Authentication:** Session-based authentication using `express-session` and `connect-pg-simple`, with rate limiting on auth endpoints (20 requests/15 minutes). Secure cookies are enforced in production.
- **Payments:** Integrated with Stripe Connect Express for creator payouts, with all fee calculations handled server-side.
- **Event System:** Events are structured with specific fields including `name`, `host`, `location`, `eventType` (Drift Event, Competition, Track Day, Festival), dates, and banner images. A branded placeholder image is used when no banner is provided. Duplicate event creation (same name + start date) is prevented.
- **Booking & Delivery:** Comprehensive booking lifecycle including package selection, payment processing (via Stripe Checkout), and a delivery system allowing creators to upload content and drivers to approve or request revisions. Fee breakdown and payment clarity are emphasized in the UI.
- **Profile Management:** Users can manage dual roles (Driver/Creator), update bios, car information, and social links. Creator profiles feature portfolio grids, packages, and a list of upcoming events they are attending.
- **Security:** Requires `SESSION_SECRET`, implements rate limiting, and uses secure cookies. A seed endpoint is protected by an `ADMIN_KEY` in production.

**Technical Implementations:**
- **Frontend:** `expo-router` for routing, React Query for data fetching, custom AuthProvider for session management.
- **Backend:** Express.js routes, Drizzle ORM for database interactions, `multer` for local file uploads, `stripe` npm package for payment processing, `ws` for WebSockets.
- **Shared:** Drizzle schema and Zod validators are shared between frontend and backend.
- **Performance:** React Query utilizes a 5-minute `staleTime`, `refetchOnWindowFocus`, and a `retry: 1` policy. Chat polling is set at 15s, conversations at 30s.
- **Dual-Role System:** `isDriverEnabled`, `isCreatorEnabled`, `driverBio`, `creatorBio`, `cars` fields manage user roles and associated data.
- **API Redaction:** For logged-out users, API endpoints return a redacted subset of data to provide public teasers while protecting sensitive information.
- **Image Processing:** `expo-image-manipulator` is used for client-side image compression (max 1600px width, 75% JPEG quality) before Cloudinary upload.

## External Dependencies
- **Cloudinary:** For persistent image and video storage, including signed upload functionality.
- **PostgreSQL:** Primary database.
- **Stripe Connect Express:** For payment processing, creator payouts, and webhook handling.
- **YouTube/Vimeo:** For embedding external video links in creator portfolios.
- **npm packages:** `express`, `react-native-expo`, `drizzle-orm`, `multer`, `stripe`, `ws`, `express-session`, `connect-pg-simple`, `react-query`.

## Stripe Integration Notes

**Required env vars:**
- `STRIPE_SECRET_KEY` — test: `sk_test_...`, prod: `sk_live_...`
- `STRIPE_PUBLISHABLE_KEY` — safe to expose to client (`pk_test_...`)
- `STRIPE_WEBHOOK_SECRET` — signing secret from Stripe Dashboard → Webhooks
- `STRIPE_CONNECT_CLIENT_ID` — from Stripe Dashboard → Connect Settings
- `CLIENT_APP_URL` — deployed app URL for Stripe redirect URLs

**Optional env vars:**
- `ALLOW_STRIPE_UNCONNECTED_TEST_CHECKOUT=true` — allows Checkout without connected creator account. **Default: false. Never set true in production.**

**Stripe tables:**
- `stripe_events` — idempotency table; one row per processed Stripe event ID (unique constraint prevents double-processing on retries)

**Safety rules:**
- Creator acceptance (`accepted` status) is blocked in production unless `stripeChargesEnabled=true` and `stripePayoutsEnabled=true` on the creator
- All fee math is server-side only (`calcFees()` in storage.ts)
- Webhook signature verified via rawBody before any processing
- Refunds are admin-managed; users get 403 on `/api/bookings/:id/refund`

**Payment ID lifecycle:**
- Checkout session created → `stripeCheckoutSessionId` saved, booking → `payment_pending`
- `checkout.session.completed` webhook → PaymentIntent retrieved → `stripePaymentIntentId` + `stripeChargeId` + `stripeApplicationFeeId` + `stripeTransferId` all saved → booking → `in_progress`
- Dispute: `charge.dispute.created` webhook → lookup by chargeId, fallback to paymentIntentId → booking → `disputed`
- Cancel unpaid: driver cancels → booking → `cancelled`, transaction (if not paid) → `cancelled`