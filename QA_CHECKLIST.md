# MyGrid QA Checklist

Use this checklist to verify core functionality before each release.

## Authentication

- [ ] Register a new account with email, display name, and role
- [ ] Login with existing credentials
- [ ] Logout and confirm redirect to login screen
- [ ] Session persists after closing and reopening the app
- [ ] Invalid credentials show an error message
- [ ] Rate limiting blocks excessive login attempts (20 per 15 minutes)

## Events

- [ ] Event list loads on the Home/Events tab
- [ ] Event search filters results
- [ ] Event detail page shows name, location, venue, dates, and description
- [ ] Join event as Driver
- [ ] Join event as Creator -- maxBookings stepper appears (1-20, default 3)
- [ ] Join event as Both -- maxBookings stepper appears
- [ ] Leave event removes attendance
- [ ] Attendee list updates after joining/leaving

## Portfolio (Creator role)

- [ ] "Add Photo" opens image picker on iOS
- [ ] "Add Photo" opens image picker on Android
- [ ] "Add Photo" opens file picker on web
- [ ] Selected photo shows preview with "Change" button
- [ ] Upload shows progress indicator ("Compressing...", "Uploading...", "Saving...")
- [ ] Upload button is disabled during upload
- [ ] Uploaded photo appears in portfolio grid immediately after success
- [ ] Photo displays correctly on own profile (real image, not placeholder)
- [ ] Photo displays correctly on public profile viewed by others
- [ ] "Add Video Link" accepts YouTube/Vimeo URLs
- [ ] Video link card shows play icon overlay in portfolio
- [ ] Tapping video card opens external URL
- [ ] Delete portfolio item removes it with confirmation
- [ ] Large photos (>5MB) are compressed before upload

### Cloudinary Upload Verification

- [ ] With Cloudinary configured: upload produces a `res.cloudinary.com` URL
- [ ] Uploaded image loads correctly from Cloudinary URL in portfolio
- [ ] Image persists after server restart / redeploy
- [ ] Signature endpoint returns 503 when Cloudinary is not configured

### Upload Fallback Behavior

- [ ] With ALLOW_LOCAL_UPLOAD_FALLBACK=false (or production default): POST /api/uploads returns 503 with "Uploads not configured"
- [ ] With ALLOW_LOCAL_UPLOAD_FALLBACK=true (dev default): POST /api/uploads stores file locally
- [ ] Client shows "Uploads are not configured" error when both Cloudinary and local fallback are disabled
- [ ] /health reports local_upload_fallback_enabled correctly based on env flag

## Packages (Creator role)

- [ ] Create a new package with title, description, and price
- [ ] Package appears in profile package list
- [ ] Delete package removes it with confirmation
- [ ] Packages display on public profile for other users

## Public Profile

- [ ] Viewing another user's profile shows their info, portfolio, and packages
- [ ] Creator with no portfolio/packages shows empty state message
- [ ] Portfolio grid renders correctly with 3 columns
- [ ] Profile data refreshes when navigating back to the screen

## Bookings

- [ ] Create a booking request from a creator's public profile
- [ ] Booking appears in Bookings tab for both driver and creator
- [ ] Creator can accept or decline a booking
- [ ] Accepted booking updates creator availability count
- [ ] Bookings tab refreshes when focused

## Messaging

- [ ] Send a message to another user
- [ ] Message appears in chat immediately
- [ ] Conversation list shows latest message preview
- [ ] Messages tab refreshes when focused
- [ ] Chat polls for new messages every 15 seconds

## Upload Edge Cases

- [ ] Upload with no network shows "Network error" message
- [ ] Canceling image picker returns to previous state without error
- [ ] Denying photo permission shows permission error message
- [ ] Files over 10MB are rejected by the server (local fallback)
- [ ] Non-image files are rejected by the server (local fallback)

## Operations

- [ ] GET /health returns status "ok" with db "connected"
- [ ] GET /health reports cloudinary_configured (true/false)
- [ ] GET /health reports local_upload_fallback_enabled (true/false)
- [ ] Local fallback is disabled in production (default)
- [ ] Request logging shows method, path, status, and duration for /api routes
- [ ] CORS allows requests from Replit domains and localhost

## Sprint 1.1: Event Cards & API Redaction

### Event Card Thumbnails
- [ ] Every event card shows a consistent thumbnail zone (140px height)
- [ ] Event cards with bannerImage show the actual banner image
- [ ] Event cards without bannerImage show a gradient placeholder with flag icon
- [ ] No layout jumps when switching between events with/without banners

### Landing Page Featured Events
- [ ] Featured Events section shows banner image when event has one
- [ ] Featured Events section shows gradient placeholder when no banner
- [ ] Landing page loads event data without authentication

### API Redaction (Logged-out Users)
- [ ] GET /api/events (logged out) returns only: id, name, venue, location, dateStart, dateEnd, bannerImage, description
- [ ] GET /api/events (logged out) does NOT return createdBy or other sensitive fields
- [ ] GET /api/events/:id (logged out) returns redacted event data
- [ ] GET /api/events/:id/attendees (logged out) returns 401 "Sign in to view attendees"
- [ ] GET /api/users/:id (logged out) returns only: id, displayName, profileImage, primaryRole, isDriverEnabled, isCreatorEnabled
- [ ] GET /api/users/:id (logged out) does NOT return social links, email, or full profile data
- [ ] All above endpoints return full data when logged in (no regressions)

## Sprint 2: Event Card Hierarchy & Creator Profile Upgrade

### Event Card Hierarchy
- [ ] Event name is the largest, boldest element on every card (dominant visual)
- [ ] Event name is capped at 2 lines max
- [ ] "Hosted by {host}" appears below the name in small muted italic
- [ ] Date line (calendar icon + formatted range) appears below host
- [ ] Location line (pin icon + venue/location) appears below date
- [ ] Event type pill is shown at the bottom of the card
- [ ] Featured events show an amber "Featured" pill next to the type pill
- [ ] Past events show a subtle "Past" badge overlaid on the banner image
- [ ] All cards look consistent whether a real banner is set or the placeholder is shown
- [ ] Clicking a card still navigates to the correct event detail screen

### Creator Profile — Public View
- [ ] "Message" and "Book Creator" action buttons are visible to non-owners
- [ ] Stats row shows portfolio / upcoming / packages counts (only if data > 0)
- [ ] Upcoming Events section lists events creator is attending, sorted by soonest
- [ ] Tapping an upcoming event card navigates to event detail
- [ ] Packages section shows every package with title, description, and price
- [ ] "Request Booking" button is present on each package card
- [ ] Tapping "Request Booking" opens the booking form with creator + package pre-selected
- [ ] Portfolio grid is clean with consistent spacing and rounded corners
- [ ] External video items show a play icon overlay
- [ ] Social links (Instagram / YouTube / TikTok) are tappable and open correct URLs

### Creator Profile — Owner View
- [ ] "Book Creator" button is NOT shown on own profile
- [ ] "Message" button is NOT shown on own profile
- [ ] "Edit Profile" button is visible and navigates to profile settings
- [ ] "Request Booking" button is NOT shown on package cards for own profile
- [ ] Package empty state shows owner hint text
- [ ] Portfolio empty state shows owner hint text

### Empty States
- [ ] No packages: icon + "No packages added yet." (+ owner hint on own profile)
- [ ] No portfolio: icon + "No portfolio added yet." (+ owner hint on own profile)
- [ ] No upcoming events: icon + "No upcoming events listed yet."

### Dual-Role Profile
- [ ] Dual-role profile shows Driver / Creator tab bar
- [ ] Driver tab shows driver bio and car info + upcoming events
- [ ] Creator tab shows specialties, upcoming events, packages, and portfolio
- [ ] Stats row shows correctly under creator tab
- [ ] Switching tabs works without data loss

### Booking Flow Integration
- [ ] Booking form accepts packageId URL param and pre-selects the correct package
- [ ] "Book Creator" from profile header and "Request Booking" from package both work

## Sprint 3: Booking Conversion, Transactions & Delivery

### Event → Creator → Booking Flow
- [ ] Event detail page shows "Media Creators Attending" section with enriched cards
- [ ] Creator cards show profile image (or letter fallback), name, availability badge, and starting price
- [ ] Creator card has "View Profile" and "Book" buttons (separate)
- [ ] "Book" from event detail pre-fills creatorId and eventId in booking form
- [ ] Creators attending as "both" role are shown in the creators section
- [ ] Self (logged-in user attending as creator) is excluded from the bookable list
- [ ] "You are attending as a creator" note appears if the current user is a creator at this event

### Package Presentation
- [ ] Package cards show title, description, price, and delivery time (if set)
- [ ] `isPopular = true` package shows amber "Most Popular" badge at top of card
- [ ] Package without isPopular/deliveryTime renders without those elements

### Booking Creation — Fee Breakdown
- [ ] Selecting a package shows a "Booking Summary" box with package price, MyGrid fee (10%), and creator receives amount
- [ ] Deselecting the package hides the fee summary
- [ ] Fee calculation is correct: fee = price * 10%, creator = price - fee

### Booking Detail Page (Command Center)
- [ ] Tapping a booking card in the Bookings tab navigates to /booking/[id]
- [ ] Booking detail shows: status banner, event name, date, creator/driver, package, notes
- [ ] Payment summary section shows package price, MyGrid fee, creator receives (when package selected)
- [ ] Deliveries section shows "No deliveries yet" when empty
- [ ] "Message Creator/Driver" button navigates to chat
- [ ] Creator sees Accept + Decline buttons when booking is "requested"
- [ ] Creator sees "Mark In Progress" when booking is "accepted"
- [ ] Creator sees "Mark Footage Delivered" when booking is "in_progress"
- [ ] Creator sees "Mark Completed" when booking is "footage_delivered"
- [ ] Driver sees "Cancel Request" button only when booking is "requested"
- [ ] Cancel shows a confirmation alert before proceeding

### Delivery System
- [ ] Creator sees "Add" button in Deliveries section for accepted/in_progress/footage_delivered bookings
- [ ] Add Delivery modal shows: type chips, title, link, notes fields
- [ ] Delivery type chips include: Link, Google Drive, Dropbox, YouTube, Photo Gallery, Other
- [ ] Creator can submit a delivery with just a title
- [ ] Submitted delivery appears in the list with "Delivered" status badge
- [ ] "Open Link" button on delivery opens the external link
- [ ] Driver sees a highlighted delivery card with "Your footage is ready" banner when status is 'delivered'
- [ ] Driver sees "Approve & Complete Booking" (orange primary button) on delivered items
- [ ] Driver sees "Request Revision" button on delivered items
- [ ] Driver tapping "Approve & Complete Booking" shows a confirmation alert
- [ ] Confirming approval changes delivery status to "approved" AND booking status to "completed"
- [ ] After approval, a success alert "Booking completed successfully" is shown
- [ ] Driver tapping "Request Revision" opens a revision notes modal
- [ ] Submitting revision notes changes delivery status to "revision_requested" with the note shown
- [ ] Creator cannot see Approve/Request Revision buttons (those are driver-only)

### Booking Review Step (Required Before Submission)
- [ ] Booking form shows "Review Booking" button (not "Send Booking Request" directly)
- [ ] Tapping "Review Booking" WITHOUT selecting an event shows an error (does not proceed to review)
- [ ] With an event selected, tapping "Review Booking" transitions to the review screen
- [ ] Review screen header shows "Review Request"
- [ ] Review screen shows Booking Summary card with creator name, event name, date, package
- [ ] If a package with price is selected, "Pricing Breakdown" section shows package price, MyGrid fee, and total
- [ ] Review screen shows green banner: "You will not be charged until the creator accepts your request."
- [ ] Review screen shows orange-themed confirmation: "You are requesting this creator for this event."
- [ ] Review screen "Request Booking" button submits the booking
- [ ] Review screen "Back" button returns to the form without losing selections
- [ ] Booking is only submitted from the review step (review step is required)

### Payment Clarity Messaging
- [ ] Booking detail shows green "not charged" banner when booking status is 'requested' (driver view only)
- [ ] Booking detail payment summary shows amber note "Payment is required after the booking is accepted." when status is requested/accepted/payment_pending
- [ ] Payment clarity banners do NOT appear once booking is completed

### Booking Status Transitions
- [ ] requested → accepted (creator only)
- [ ] requested → declined (creator only)
- [ ] accepted → in_progress (creator only)
- [ ] in_progress → footage_delivered (creator only)
- [ ] footage_delivered → completed (creator only)
- [ ] requested → cancelled (driver only)
- [ ] Driver cannot accept/decline (action buttons not shown)
- [ ] Creator cannot cancel (button not shown)

### Filter Chips (Bookings Tab)
- [ ] Filter chips include: All, Pending, Accepted, Active, Delivered, Done, Declined
- [ ] "Active" filter shows bookings with in_progress status
- [ ] "Delivered" filter shows bookings with footage_delivered status
- [ ] Status badge labels are human-readable (e.g. "In Progress", not "in_progress")

### Security / Permissions
- [ ] Accessing /booking/[id] for another user's booking returns 404
- [ ] Creator cannot add delivery to a booking they are not assigned to
- [ ] Driver cannot approve delivery on another driver's booking
- [ ] Booking status changes from unauthorized users are rejected (404)

## General UX

- [ ] Dark theme is applied consistently across all screens
- [ ] Safe area insets are correct (no content behind notch/status bar)
- [ ] Web top inset (67px) is applied on web platform
- [ ] Scroll views work smoothly without jank
- [ ] Error states show user-friendly messages with retry options

## Sprint 4: Stripe Connect Express (Real Payments)

### Schema Changes
- [ ] `users` table has: stripeAccountId, stripeChargesEnabled, stripePayoutsEnabled, stripeDetailsSubmitted
- [ ] `transactions` table has: stripeCheckoutSessionId, stripeChargeId, stripeApplicationFeeId
- [ ] Both migrated via `npm run db:push` without errors

### Creator Payout Setup (Profile Tab)
- [ ] Creator sees "Payout Setup" card in their profile (below portfolio, above packages)
- [ ] Non-creator users do NOT see the payout card
- [ ] "Set Up Payouts" button opens Stripe Express onboarding link in browser
- [ ] After completing onboarding, status updates to "in_review" or "ready"
- [ ] If Stripe is not configured (no STRIPE_SECRET_KEY), the card is hidden gracefully

### Booking Payment Flow (Driver)
- [ ] Driver sees "Pay Now" button when booking status is `accepted` or `payment_pending`
- [ ] "Pay Now" calls POST /api/bookings/:id/create-checkout-session → opens Stripe Checkout URL
- [ ] Creator sees "Waiting for driver payment" notice when booking is accepted/payment_pending
- [ ] After Stripe Checkout completes, webhook moves booking to `in_progress`
- [ ] Creator button "Mark In Progress" no longer shown for `accepted` status (payment is the trigger)

### Backend Stripe Endpoints
- [ ] POST /api/stripe/connect/onboard — creates Stripe Express account + onboarding link (auth required)
- [ ] GET /api/stripe/connect/status — returns chargesEnabled, payoutsEnabled, detailsSubmitted (auth required)
- [ ] POST /api/bookings/:id/create-checkout-session — creates Checkout session, sets stripeCheckoutSessionId (driver auth, booking ownership check)
- [ ] POST /api/stripe/webhook — verifies Stripe-Signature header, handles events
- [ ] POST /api/bookings/:id/cancel-unpaid — cancels requested/accepted/payment_pending bookings (driver only)
- [ ] POST /api/bookings/:id/refund — returns 403 (admin-only, placeholder)

### Webhook Events
- [ ] checkout.session.completed → booking → in_progress, transaction → paid
- [ ] payment_intent.succeeded → booking → in_progress, transaction → paid
- [ ] payment_intent.payment_failed → transaction → failed, booking stays payment_pending
- [ ] charge.refunded → transaction → refunded, booking → cancelled
- [ ] charge.dispute.created → transaction → disputed, booking → disputed
- [ ] account.updated → syncs creator Stripe flags to DB

### Fee Calculation Security
- [ ] Platform fee is always server-calculated via calcFees() — client cannot override
- [ ] stripeCheckoutSessionId saved immediately when session is created
- [ ] platformFeeAmount in Stripe application_fee_amount matches DB calculation

### Security / Auth
- [ ] Unauthenticated requests to /api/stripe/* return 401
- [ ] /api/bookings/:id/create-checkout-session returns 403 if caller is not the driver
- [ ] /api/bookings/:id/cancel-unpaid returns 403 if caller is not the driver
- [ ] Webhook endpoint verifies Stripe-Signature (raw body) — invalid signatures return 400
- [ ] STRIPE_SECRET_KEY never sent to client
- [ ] STRIPE_PUBLISHABLE_KEY is safe to expose (not a secret)

### Dev Mode
- [ ] In development (NODE_ENV != production), checkout proceeds even if creator hasn't completed Stripe setup (with warning log)
- [ ] In production, checkout fails with helpful message if creator hasn't set up payouts

## Sprint 4 Hardening: Stripe Safety & Live-Readiness

### A) Creator acceptance blocked until Stripe ready
- [ ] In production (NODE_ENV=production), creator cannot accept a booking without stripeAccountId + stripeChargesEnabled + stripePayoutsEnabled = true
- [ ] Server returns HTTP 400 with message "Set up payouts before accepting paid bookings." and code "STRIPE_NOT_READY"
- [ ] In development, acceptance is allowed with a console.warn logged
- [ ] Frontend should surface the STRIPE_NOT_READY error to the creator (Alert or toast)

### B) Webhook idempotency
- [ ] `stripe_events` table exists in DB with unique index on `stripe_event_id`
- [ ] Sending the same webhook event ID twice returns `{ received: true, duplicate: true }` the second time (no double-processing)
- [ ] Unique constraint (pg error 23505) is handled gracefully — treated as "already processed"
- [ ] If webhook handler throws, the idempotency record is deleted so Stripe can retry

### C) Stripe ID persistence
- [ ] On checkout.session.completed: stripePaymentIntentId, stripeChargeId, stripeApplicationFeeId, stripeTransferId are all saved to transactions row where available
- [ ] On payment_intent.succeeded: stripeChargeId is extracted from latest_charge and saved
- [ ] Both events transition booking to in_progress (payment_intent.succeeded only if still payment_pending)
- [ ] Query: `SELECT stripe_payment_intent_id, stripe_charge_id, stripe_application_fee_id, stripe_transfer_id FROM transactions WHERE booking_id = '<id>';` — all populated after successful checkout

### D) Dispute lookup correctness
- [ ] charge.dispute.created first looks up transaction by stripeChargeId
- [ ] If not found, retrieves the charge from Stripe API to get payment_intent, then looks up by stripePaymentIntentId
- [ ] Updates transaction paymentStatus=disputed and booking status=disputed
- [ ] Missing charge logs a clear warning (does not crash)

### E) Unconnected checkout guard
- [ ] Without ALLOW_STRIPE_UNCONNECTED_TEST_CHECKOUT=true, checkout returns 400 with code "CREATOR_STRIPE_NOT_READY" if creator hasn't set up Stripe
- [ ] With ALLOW_STRIPE_UNCONNECTED_TEST_CHECKOUT=true, checkout proceeds but logs a prominent WARN
- [ ] In production: ALLOW_STRIPE_UNCONNECTED_TEST_CHECKOUT must NOT be set (or set to false)
- [ ] No destination charge is added to the Stripe session when creator has no connected account

### F) Cancel unpaid is clean
- [ ] POST /api/bookings/:id/cancel-unpaid sets booking status=cancelled only (no forceCompleteBooking call)
- [ ] If transaction exists with paymentStatus in (not_started, pending, failed), it is also set to cancelled
- [ ] Booking must be in requested, accepted, or payment_pending — other states return 400

### Stripe Test Mode Setup
1. Create a Stripe account at https://stripe.com
2. Go to Developers → API Keys → copy test keys (sk_test_..., pk_test_...)
3. Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY to Replit Secrets
4. Install Stripe CLI: https://stripe.com/docs/stripe-cli
5. Run: `stripe listen --forward-to localhost:5000/api/stripe/webhook`
6. Copy the webhook signing secret to STRIPE_WEBHOOK_SECRET
7. For Connect: go to Connect → Settings → copy the Connect Client ID to STRIPE_CONNECT_CLIENT_ID
8. Set ALLOW_STRIPE_UNCONNECTED_TEST_CHECKOUT=true to test checkout without a connected creator account

### Test card for Stripe Checkout
- Card number: 4242 4242 4242 4242
- Expiry: any future date (e.g. 12/34)
- CVC: any 3 digits (e.g. 123)
- Name/Address: anything

### Production safety settings
```
NODE_ENV=production
ALLOW_STRIPE_UNCONNECTED_TEST_CHECKOUT=false   (or omit — default is false)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLIENT_APP_URL=https://your-app.repl.co
```

### Dispute/refund behavior notes
- Disputes: trigger charge.dispute.created → booking → disputed. Admin must respond via Stripe Dashboard.
- Refunds: POST /api/bookings/:id/refund returns 403. Admin initiates refund via Stripe Dashboard.
  Stripe fires charge.refunded → webhook automatically sets booking=cancelled + transaction=refunded.
- Partial refunds: charge.refunded with refunded=false → transaction=partially_refunded, booking unchanged.
