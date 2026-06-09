import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  decimal,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const primaryRoleEnum = pgEnum("primary_role", ["driver", "creator"]);
export const attendanceRoleEnum = pgEnum("attendance_role", [
  "driver",
  "creator",
  "both",
]);
export const availabilityStatusEnum = pgEnum("availability_status", [
  "available",
  "limited",
  "fully_booked",
]);
export const mediaTypeEnum = pgEnum("media_type", [
  "photo",
  "video",
  "external_video",
]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "requested",
  "accepted",
  "declined",
  "completed",
  "cancelled",
  "payment_pending",
  "in_progress",
  "footage_delivered",
  "disputed",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "held",
  "released",
  "refunded",
  "not_started",
  "paid",
  "failed",
  "partially_refunded",
  "disputed",
]);
export const creatorMediaTypeEnum = pgEnum("creator_media_type", [
  "photographer",
  "videographer",
  "drone",
  "social_content",
]);
export const deliveryTypeEnum = pgEnum("delivery_type", [
  "photo_gallery",
  "video_file",
  "external_link",
  "google_drive",
  "dropbox",
  "youtube_unlisted",
  "other",
]);
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "uploaded",
  "delivered",
  "revision_requested",
  "approved",
]);
export const txPaymentStatusEnum = pgEnum("tx_payment_status", [
  "not_started",
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
  "disputed",
  "cancelled",
]);
export const payoutStatusEnum = pgEnum("payout_status", [
  "not_started",
  "pending",
  "paid",
  "failed",
  "held",
]);

export const users = pgTable("users", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  primaryRole: primaryRoleEnum("primary_role").notNull().default("driver"),
  displayName: text("display_name").notNull().default(""),
  bio: text("bio").default(""),
  profileImage: text("profile_image").default(""),
  carInfo: text("car_info").default(""),
  mediaTypes: text("media_types").default(""),
  location: text("location").default(""),
  socialLinks: text("social_links").default("{}"),
  travelAvailable: boolean("travel_available").default(false),
  onboardingComplete: boolean("onboarding_complete").default(false),
  isDriverEnabled: boolean("is_driver_enabled").default(true),
  isCreatorEnabled: boolean("is_creator_enabled").default(false),
  driverBio: text("driver_bio").default(""),
  creatorBio: text("creator_bio").default(""),
  cars: text("cars").default(""),
  // Stripe Connect Express fields (creator payouts)
  stripeAccountId: text("stripe_account_id"),
  stripeChargesEnabled: boolean("stripe_charges_enabled").default(false),
  stripePayoutsEnabled: boolean("stripe_payouts_enabled").default(false),
  stripeDetailsSubmitted: boolean("stripe_details_submitted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const events = pgTable("events", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  host: text("host").default(""),
  location: text("location").notNull(),
  venue: text("venue").default(""),
  eventType: text("event_type").default("Drift Event"),
  dateStart: timestamp("date_start").notNull(),
  dateEnd: timestamp("date_end").notNull(),
  bannerImage: text("banner_image").default(""),
  description: text("description").default(""),
  isFeatured: boolean("is_featured").default(false),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const attendance = pgTable("attendance", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  eventId: varchar("event_id", { length: 36 })
    .notNull()
    .references(() => events.id),
  role: attendanceRoleEnum("role").notNull().default("driver"),
  availabilityStatus: availabilityStatusEnum("availability_status").default(
    "available",
  ),
  maxBookings: integer("max_bookings").default(10),
  createdAt: timestamp("created_at").defaultNow(),
});

export const portfolioMedia = pgTable("portfolio_media", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  mediaUrl: text("media_url").default(""),
  mediaType: mediaTypeEnum("media_type").notNull().default("photo"),
  externalUrl: text("external_url").default(""),
  thumbnailUrl: text("thumbnail_url").default(""),
  caption: text("caption").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

export const packages = pgTable("packages", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  description: text("description").default(""),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  deliveryTime: text("delivery_time").default(""),
  isPopular: boolean("is_popular").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  driverId: varchar("driver_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  creatorId: varchar("creator_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  eventId: varchar("event_id", { length: 36 })
    .notNull()
    .references(() => events.id),
  packageId: varchar("package_id", { length: 36 }).references(
    () => packages.id,
  ),
  notes: text("notes").default(""),
  status: bookingStatusEnum("status").notNull().default("requested"),
  paymentStatus: paymentStatusEnum("payment_status").default("pending"),
  paymentIntentId: text("payment_intent_id").default(""),
  // Price snapshot at time of booking (immutable)
  packagePrice: decimal("package_price", { precision: 10, scale: 2 }),
  platformFeeAmount: decimal("platform_fee_amount", { precision: 10, scale: 2 }),
  creatorPayoutAmount: decimal("creator_payout_amount", { precision: 10, scale: 2 }),
  escrowAmount: decimal("escrow_amount", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id", { length: 36 })
    .notNull()
    .references(() => bookings.id),
  driverId: varchar("driver_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  creatorId: varchar("creator_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  eventId: varchar("event_id", { length: 36 }).references(() => events.id),
  packageId: varchar("package_id", { length: 36 }).references(() => packages.id),
  grossAmount: decimal("gross_amount", { precision: 10, scale: 2 }).notNull(),
  platformFeeAmount: decimal("platform_fee_amount", { precision: 10, scale: 2 }).notNull(),
  creatorPayoutAmount: decimal("creator_payout_amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("usd"),
  paymentStatus: txPaymentStatusEnum("payment_status").default("not_started"),
  payoutStatus: payoutStatusEnum("payout_status").default("not_started"),
  // Stripe identifiers
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  stripeTransferId: text("stripe_transfer_id"),
  stripeApplicationFeeId: text("stripe_application_fee_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const deliveries = pgTable("deliveries", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id", { length: 36 })
    .notNull()
    .references(() => bookings.id),
  creatorId: varchar("creator_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  driverId: varchar("driver_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  deliveryType: deliveryTypeEnum("delivery_type").notNull().default("external_link"),
  title: text("title").notNull(),
  notes: text("notes").default(""),
  fileUrl: text("file_url"),
  externalLink: text("external_link"),
  status: deliveryStatusEnum("status").notNull().default("pending"),
  revisionNotes: text("revision_notes").default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  receiverId: varchar("receiver_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  bookingId: varchar("booking_id", { length: 36 }).references(
    () => bookings.id,
  ),
  messageText: text("message_text").notNull(),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Stripe processed events (idempotency) ───────────────────────────────────
// One row per Stripe event ID — prevents double-processing on retries.

export const stripeEvents = pgTable("stripe_events", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type StripeEvent = typeof stripeEvents.$inferSelect;

// ── Insert schemas ──────────────────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  passwordHash: true,
  primaryRole: true,
  displayName: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1),
  primaryRole: z.enum(["driver", "creator"]),
});

export const insertEventSchema = createInsertSchema(events).pick({
  name: true,
  host: true,
  location: true,
  venue: true,
  eventType: true,
  dateStart: true,
  dateEnd: true,
  bannerImage: true,
  description: true,
  isFeatured: true,
});

export const insertAttendanceSchema = createInsertSchema(attendance).pick({
  eventId: true,
  role: true,
  maxBookings: true,
});

export const insertPortfolioSchema = createInsertSchema(portfolioMedia).pick({
  mediaUrl: true,
  mediaType: true,
  externalUrl: true,
  thumbnailUrl: true,
  caption: true,
});

export const insertPackageSchema = createInsertSchema(packages).pick({
  title: true,
  description: true,
  price: true,
  deliveryTime: true,
  isPopular: true,
});

export const insertBookingSchema = createInsertSchema(bookings).pick({
  creatorId: true,
  eventId: true,
  packageId: true,
  notes: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  receiverId: true,
  bookingId: true,
  messageText: true,
});

export const insertDeliverySchema = createInsertSchema(deliveries).pick({
  bookingId: true,
  deliveryType: true,
  title: true,
  notes: true,
  fileUrl: true,
  externalLink: true,
});

// ── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Event = typeof events.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type PortfolioMedia = typeof portfolioMedia.$inferSelect;
export type Package = typeof packages.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
export type Message = typeof messages.$inferSelect;
