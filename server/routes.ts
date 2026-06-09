import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cookieSignature = require("cookie-signature") as { unsign: (val: string, secret: string) => string | false };
import multer from "multer";
import * as fs from "node:fs";
import * as path from "node:path";
import { v2 as cloudinary } from "cloudinary";
import { pool, db } from "./db";
import { storage } from "./storage";
import { registerSchema, loginSchema, users, bookings as bookingsTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import { registerStripeRoutes } from "./stripe-routes";

const uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const name = Date.now().toString() + "_" + Math.random().toString(36).substring(2, 8);
      cb(null, name + ext);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    cb(null, allowed.includes(file.mimetype));
  },
});

function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function isLocalFallbackAllowed(): boolean {
  const flag = process.env.ALLOW_LOCAL_UPLOAD_FALLBACK;
  if (flag !== undefined) {
    return flag === "true" || flag === "1";
  }
  return process.env.NODE_ENV !== "production";
}

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

/**
 * Extracts the authenticated userId from the session cookie on a raw HTTP
 * upgrade (WebSocket) request.  Never trusts a userId sent by the client.
 */
async function getSessionUserId(req: IncomingMessage): Promise<string | null> {
  try {
    const cookieHeader = req.headers?.cookie;
    if (!cookieHeader) return null;

    // Manually parse cookies from the header string
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx === -1) return;
      const key = pair.slice(0, idx).trim();
      const val = decodeURIComponent(pair.slice(idx + 1).trim());
      cookies[key] = val;
    });

    // connect.sid format: s:<sessionId>.<hmacSignature>
    const raw = cookies["connect.sid"];
    if (!raw || !raw.startsWith("s:")) return null;

    const secret = process.env.SESSION_SECRET;
    if (!secret) return null;

    // Unsign: cookie-signature strips the "s:" prefix internally
    const sessionId = cookieSignature.unsign(raw.slice(2), secret);
    if (!sessionId) return null;

    // Query the session table managed by connect-pg-simple
    const result = await pool.query(
      "SELECT sess FROM session WHERE sid = $1 AND expire > NOW()",
      [sessionId],
    );
    if (!result.rows.length) return null;

    return (result.rows[0].sess as Record<string, unknown>)?.userId as string ?? null;
  } catch {
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Strip fields that must never appear in any public API response
  function stripPrivateFields(user: Record<string, unknown>) {
    const {
      stripeAccountId: _a,
      stripeChargesEnabled: _b,
      stripePayoutsEnabled: _c,
      stripeDetailsSubmitted: _d,
      ...rest
    } = user;
    return rest;
  }

  // Public teaser mode: check if user has a valid session
  function isLoggedIn(req: Request): boolean {
    return !!req.session?.userId;
  }

  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  const PgStore = connectPg(session);
  app.use(
    session({
      store: new PgStore({ pool, createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    }),
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: "Too many attempts, try again later" },
  });

  app.post("/api/auth/register", authLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = registerSchema.parse(req.body);
      const existing = await storage.getUserByEmail(parsed.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }
      const passwordHash = await bcrypt.hash(parsed.password, 10);
      const user = await storage.createUser({
        email: parsed.email,
        passwordHash,
        displayName: parsed.displayName,
        primaryRole: parsed.primaryRole,
        isDriverEnabled: parsed.primaryRole === 'driver',
        isCreatorEnabled: parsed.primaryRole === 'creator',
      });
      req.session.userId = user.id;
      const { passwordHash: _, ...safeUser } = user;
      return res.json(safeUser);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/login", authLimiter, async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(parsed.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const valid = await bcrypt.compare(parsed.password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      req.session.userId = user.id;
      const { passwordHash: _, ...safeUser } = user;
      return res.json(safeUser);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const { passwordHash: _, ...safeUser } = user;
    return res.json(safeUser);
  });

  app.put("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const allowedFields = [
        'displayName', 'bio', 'profileImage', 'carInfo', 'mediaTypes',
        'location', 'socialLinks', 'travelAvailable', 'onboardingComplete',
        'isDriverEnabled', 'isCreatorEnabled', 'driverBio', 'creatorBio', 'cars',
      ];
      const filtered: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          filtered[key] = req.body[key];
        }
      }
      const user = await storage.updateUser(req.session.userId!, filtered);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { passwordHash: _, ...safeUser } = user;
      return res.json(safeUser);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/users/:id", async (req: Request, res: Response) => {
    const user = await storage.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { passwordHash: _, ...safeUser } = user;

    // Public teaser mode: redact profile details for logged-out users
    if (!isLoggedIn(req)) {
      return res.json({
        id: safeUser.id,
        displayName: safeUser.displayName,
        profileImage: safeUser.profileImage,
        primaryRole: safeUser.primaryRole,
        isDriverEnabled: safeUser.isDriverEnabled,
        isCreatorEnabled: safeUser.isCreatorEnabled,
      });
    }

    return res.json(stripPrivateFields(safeUser as Record<string, unknown>));
  });

  const DEFAULT_EVENT_IMAGE_URL = "/uploads/event_placeholder.png";

  function withDefaultBanner<T extends { bannerImage?: string | null }>(event: T): T {
    return { ...event, bannerImage: event.bannerImage || DEFAULT_EVENT_IMAGE_URL };
  }

  // Public: get events a user is attending (for creator profile upcoming events)
  app.get("/api/users/:id/events", async (req: Request, res: Response) => {
    try {
      const attendance = await storage.getUserAttendance(req.params.id);
      const now = new Date();
      const upcoming = attendance
        .map((a: any) => withDefaultBanner(a.event))
        .filter((e: any) => new Date(e.dateStart) >= now)
        .sort((a: any, b: any) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime())
        .slice(0, 6);
      return res.json(upcoming);
    } catch {
      return res.json([]);
    }
  });

  // Creator stats: completed bookings count (trust signal)
  app.get("/api/users/:id/stats", async (req: Request, res: Response) => {
    try {
      const count = await storage.getCompletedBookingsCount(req.params.id);
      return res.json({ completedBookings: count });
    } catch {
      return res.json({ completedBookings: 0 });
    }
  });

  app.get("/api/events", async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const eventList = await storage.getEvents(search);

    // Public teaser mode: redact sensitive fields for logged-out users
    if (!isLoggedIn(req)) {
      const redacted = eventList.map((e: any) => withDefaultBanner({
        id: e.id,
        name: e.name,
        host: e.host,
        venue: e.venue,
        location: e.location,
        eventType: e.eventType,
        dateStart: e.dateStart,
        dateEnd: e.dateEnd,
        bannerImage: e.bannerImage,
        description: e.description,
        isFeatured: e.isFeatured,
      }));
      return res.json(redacted);
    }

    return res.json(eventList.map(withDefaultBanner));
  });

  app.get("/api/events/:id", async (req: Request, res: Response) => {
    const event = await storage.getEventById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    // Public teaser mode: redact sensitive fields for logged-out users
    if (!isLoggedIn(req)) {
      const { id, name, host, venue, location, eventType, dateStart, dateEnd, bannerImage, description, isFeatured } = event as any;
      return res.json(withDefaultBanner({ id, name, host, venue, location, eventType, dateStart, dateEnd, bannerImage, description, isFeatured }));
    }

    return res.json(withDefaultBanner(event as any));
  });

  app.post("/api/events", requireAuth, async (req: Request, res: Response) => {
    try {
      // Duplicate check: same name + same start date
      const startDate = new Date(req.body.dateStart);
      const duplicate = await storage.findDuplicateEvent(String(req.body.name || ""), startDate);
      if (duplicate) {
        return res.status(409).json({ message: "An event with this name and start date already exists" });
      }

      const event = await storage.createEvent({
        ...req.body,
        createdBy: req.session.userId!,
        dateStart: startDate,
        dateEnd: new Date(req.body.dateEnd),
      });
      return res.json(withDefaultBanner(event as any));
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  });

  app.get(
    "/api/events/:id/attendees",
    async (req: Request, res: Response) => {
      // Public teaser mode: attendee lists require authentication
      if (!isLoggedIn(req)) {
        return res.status(401).json({ message: "Sign in to view attendees" });
      }
      const attendees = await storage.getEventAttendees(req.params.id);
      const safe = attendees.map((a) => {
        const { passwordHash: _, ...safeUser } = a.user;
        return { ...a, user: safeUser };
      });
      return res.json(safe);
    },
  );

  // Enriched creator attendees for event detail page booking entry-point
  app.get(
    "/api/events/:id/creators",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const creators = await storage.getEventCreators(req.params.id);
        return res.json(creators);
      } catch (err: any) {
        return res.status(500).json({ message: err.message });
      }
    },
  );

  app.post(
    "/api/events/:id/join",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const att = await storage.joinEvent({
          userId: req.session.userId!,
          eventId: req.params.id,
          role: req.body.role || "driver",
          maxBookings: req.body.maxBookings,
        });
        return res.json(att);
      } catch (err: any) {
        return res.status(400).json({ message: err.message });
      }
    },
  );

  app.post(
    "/api/events/:id/leave",
    requireAuth,
    async (req: Request, res: Response) => {
      await storage.leaveEvent(req.session.userId!, req.params.id);
      return res.json({ message: "Left event" });
    },
  );

  app.put(
    "/api/events/:id/availability",
    requireAuth,
    async (req: Request, res: Response) => {
      await storage.updateAvailability(
        req.session.userId!,
        req.params.id,
        req.body.status,
      );
      return res.json({ message: "Updated" });
    },
  );

  app.get(
    "/api/attendance",
    requireAuth,
    async (req: Request, res: Response) => {
      const att = await storage.getUserAttendance(req.session.userId!);
      return res.json(att);
    },
  );

  app.get(
    "/api/portfolio/:userId",
    async (req: Request, res: Response) => {
      const items = await storage.getPortfolio(req.params.userId);
      return res.json(items);
    },
  );

  app.post(
    "/api/portfolio",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const item = await storage.addPortfolioItem(
          req.session.userId!,
          req.body,
        );
        return res.json(item);
      } catch (err: any) {
        return res.status(400).json({ message: err.message });
      }
    },
  );

  app.delete(
    "/api/portfolio/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      await storage.deletePortfolioItem(req.params.id, req.session.userId!);
      return res.json({ message: "Deleted" });
    },
  );

  app.get(
    "/api/packages/:creatorId",
    async (req: Request, res: Response) => {
      const pkgs = await storage.getPackages(req.params.creatorId);
      return res.json(pkgs);
    },
  );

  app.post(
    "/api/packages",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const pkg = await storage.createPackage(req.session.userId!, req.body);
        return res.json(pkg);
      } catch (err: any) {
        return res.status(400).json({ message: err.message });
      }
    },
  );

  app.put(
    "/api/packages/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      const pkg = await storage.updatePackage(
        req.params.id,
        req.session.userId!,
        req.body,
      );
      if (!pkg) return res.status(404).json({ message: "Package not found" });
      return res.json(pkg);
    },
  );

  app.delete(
    "/api/packages/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      await storage.deletePackage(req.params.id, req.session.userId!);
      return res.json({ message: "Deleted" });
    },
  );

  app.post(
    "/api/bookings",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const booking = await storage.createBooking({
          ...req.body,
          driverId: req.session.userId!,
        });
        return res.json(booking);
      } catch (err: any) {
        return res.status(400).json({ message: err.message });
      }
    },
  );

  app.get(
    "/api/bookings",
    requireAuth,
    async (req: Request, res: Response) => {
      const bookingList = await storage.getBookingsForUser(
        req.session.userId!,
      );
      const safe = bookingList.map((b) => {
        const { passwordHash: _d, ...safeDriver } = b.driver;
        const { passwordHash: _c, ...safeCreator } = b.creator;
        return { ...b, driver: safeDriver, creator: safeCreator };
      });
      return res.json(safe);
    },
  );

  app.get(
    "/api/bookings/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const booking = await storage.getBookingById(
          req.params.id,
          req.session.userId!,
        );
        if (!booking)
          return res.status(404).json({ message: "Booking not found or access denied" });
        const event = withDefaultBanner(booking.event);
        return res.json({ ...booking, event });
      } catch (err: any) {
        return res.status(500).json({ message: err.message });
      }
    },
  );

  app.put(
    "/api/bookings/:id/status",
    requireAuth,
    async (req: Request, res: Response) => {
      const newStatus: string = req.body.status;
      const requestingUserId: string = req.session.userId!;

      // ── A) Block creator acceptance until Stripe is ready ──────────────────
      if (newStatus === "accepted") {
        // Fetch the booking to determine who the creator is
        const [rawBooking] = await db
          .select()
          .from(bookingsTable)
          .where(eq(bookingsTable.id, req.params.id));

        if (rawBooking && rawBooking.creatorId === requestingUserId) {
          const [creator] = await db
            .select()
            .from(users)
            .where(eq(users.id, requestingUserId));

          const stripeReady =
            creator?.stripeAccountId &&
            creator?.stripeChargesEnabled &&
            creator?.stripePayoutsEnabled;

          const isProduction = process.env.NODE_ENV === "production";

          if (isProduction && !stripeReady) {
            return res.status(400).json({
              message: "Set up payouts before accepting paid bookings.",
              code: "STRIPE_NOT_READY",
            });
          }

          if (!isProduction && !stripeReady) {
            console.warn(
              `[DEV] Creator ${requestingUserId} accepted booking ${req.params.id} without completing Stripe setup.`,
            );
          }
        }
      }

      const booking = await storage.updateBookingStatus(
        req.params.id,
        requestingUserId,
        newStatus,
      );
      if (!booking)
        return res.status(404).json({ message: "Booking not found or action not permitted" });
      return res.json(booking);
    },
  );

  // ── Deliveries ─────────────────────────────────────────────────────────────

  // Creator adds a delivery item to a booking
  app.post(
    "/api/deliveries",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { bookingId, deliveryType, title, notes, fileUrl, externalLink } = req.body;
        if (!bookingId || !title) {
          return res.status(400).json({ message: "bookingId and title are required" });
        }

        // Verify requester is the creator on this booking
        const booking = await storage.getBookingById(bookingId, req.session.userId!);
        if (!booking) {
          return res.status(404).json({ message: "Booking not found or access denied" });
        }
        if (booking.creatorId !== req.session.userId!) {
          return res.status(403).json({ message: "Only the assigned creator can add deliveries" });
        }

        const delivery = await storage.createDelivery({
          bookingId,
          creatorId: booking.creatorId,
          driverId: booking.driverId,
          deliveryType: deliveryType || "external_link",
          title,
          notes,
          fileUrl,
          externalLink,
        });
        return res.json(delivery);
      } catch (err: any) {
        return res.status(400).json({ message: err.message });
      }
    },
  );

  // Get deliveries for a booking
  app.get(
    "/api/bookings/:id/deliveries",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        // Verify access: must be driver or creator on this booking
        const booking = await storage.getBookingById(req.params.id, req.session.userId!);
        if (!booking) {
          return res.status(404).json({ message: "Booking not found or access denied" });
        }
        const items = await storage.getDeliveriesForBooking(req.params.id);
        return res.json(items);
      } catch (err: any) {
        return res.status(500).json({ message: err.message });
      }
    },
  );

  // Driver approves delivery or requests revision
  app.put(
    "/api/deliveries/:id/status",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { status, revisionNotes } = req.body;
        if (!["approved", "revision_requested"].includes(status)) {
          return res.status(400).json({ message: "Invalid status" });
        }
        const delivery = await storage.updateDeliveryStatus(
          req.params.id,
          req.session.userId!,
          status,
          revisionNotes,
        );
        if (!delivery) {
          return res.status(404).json({ message: "Delivery not found or access denied" });
        }
        // When a driver approves a delivery, auto-complete the booking (bypass normal permission check)
        if (status === "approved") {
          await storage.forceCompleteBooking(delivery.bookingId);
        }
        return res.json(delivery);
      } catch (err: any) {
        return res.status(400).json({ message: err.message });
      }
    },
  );

  // Transaction for a booking (read-only, driver or creator)
  app.get(
    "/api/bookings/:id/transaction",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const booking = await storage.getBookingById(req.params.id, req.session.userId!);
        if (!booking) return res.status(404).json({ message: "Booking not found or access denied" });
        const tx = await storage.getTransactionByBookingId(req.params.id);
        return res.json(tx ?? null);
      } catch (err: any) {
        return res.status(500).json({ message: err.message });
      }
    },
  );

  app.get(
    "/api/conversations",
    requireAuth,
    async (req: Request, res: Response) => {
      const convos = await storage.getConversations(req.session.userId!);
      const safe = convos.map((c) => {
        const { passwordHash: _, ...safeUser } = c.otherUser;
        return { ...c, otherUser: safeUser };
      });
      return res.json(safe);
    },
  );

  app.get(
    "/api/messages/:otherUserId",
    requireAuth,
    async (req: Request, res: Response) => {
      const msgs = await storage.getMessages(
        req.session.userId!,
        req.params.otherUserId,
      );
      return res.json(msgs);
    },
  );

  app.post(
    "/api/messages",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const msg = await storage.sendMessage({
          ...req.body,
          senderId: req.session.userId!,
        });
        return res.json(msg);
      } catch (err: any) {
        return res.status(400).json({ message: err.message });
      }
    },
  );

  app.post("/api/uploads/signature", requireAuth, (req: Request, res: Response) => {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ message: "Cloud storage not configured" });
    }
    try {
      const timestamp = Math.round(Date.now() / 1000);
      const folder = "mygrid/portfolio";
      const signature = cloudinary.utils.api_sign_request(
        { timestamp, folder },
        process.env.CLOUDINARY_API_SECRET!,
      );
      return res.json({
        timestamp,
        signature,
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        folder,
      });
    } catch (err: any) {
      return res.status(500).json({ message: "Failed to generate upload signature" });
    }
  });

  app.post("/api/uploads", requireAuth, (req: Request, res: Response, next) => {
    if (!isLocalFallbackAllowed()) {
      return res.status(503).json({
        message: "Uploads not configured. Please set Cloudinary env vars.",
        code: "UPLOADS_NOT_CONFIGURED",
      });
    }
    next();
  }, upload.single("file"), (req: Request, res: Response) => {
    if (!(req as any).file) {
      return res.status(400).json({ message: "No file uploaded or invalid file type" });
    }
    const relativePath = `/uploads/${(req as any).file.filename}`;
    const apiBase = process.env.EXPO_PUBLIC_API_URL;
    const url = apiBase ? `${apiBase.replace(/\/$/, '')}${relativePath}` : relativePath;
    return res.json({ url });
  });

  app.get("/health", async (_req: Request, res: Response) => {
    try {
      await pool.query("SELECT 1");
      return res.json({
        status: "ok",
        db: "connected",
        cloudinary_configured: isCloudinaryConfigured(),
        local_upload_fallback_enabled: isLocalFallbackAllowed(),
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(503).json({
        status: "error",
        db: "disconnected",
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.post("/api/seed", async (req: Request, res: Response) => {
    // ADMIN_KEY is required in every environment — never expose seed in dev either
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || req.headers["x-admin-key"] !== adminKey) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const force = req.query.force === "true";
      const existingEvents = await storage.getEvents();

      if (existingEvents.length > 0 && !force) {
        return res.json({ message: "Seed data already exists", count: existingEvents.length });
      }

      if (force && existingEvents.length > 0) {
        await pool.query("DELETE FROM bookings");
        await pool.query("DELETE FROM attendance");
        await pool.query("DELETE FROM events");
      }

      const DLC_BANNER = "/uploads/banner_driven_luck_circuit.jpg";
      const FD_BANNER = "/uploads/banner_formula_drift_2026.jpg";
      const GL_BANNER = "/uploads/banner_grid_life_2026.jpg";
      const DA_BANNER = "/uploads/banner_drift_appalachia_2026.jpg";
      const DI_BANNER = "/uploads/banner_drift_indy_2026.jpg";
      const E10_BANNER = "/uploads/banner_east10drift_2026.jpg";

      const seedEvents = [
        // --- Driven Luck Circuit (Bryant, Alabama) ---
        {
          name: "Driven Luck Circuit – Low HP Showcase – Bryant, AL",
          host: "Driven Luck Circuit",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Driven Luck Circuit",
          location: "Bryant, AL",
          dateStart: "2026-01-17",
          dateEnd: "2026-01-18",
          bannerImage: DLC_BANNER,
          description: "A celebration of low-horsepower builds. Prove that momentum and commitment matter more than power.",
        },
        {
          name: "Driven Luck Circuit – NiGatsu Ibento – Bryant, AL",
          host: "Driven Luck Circuit",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Driven Luck Circuit",
          location: "Bryant, AL",
          dateStart: "2026-02-21",
          dateEnd: "2026-02-22",
          bannerImage: DLC_BANNER,
          description: "February's Japanese-inspired drift event at DLC. Expect a strong showing of JDM builds and authentic sideways style.",
        },
        {
          name: "Driven Luck Circuit – Suna No Yama – Bryant, AL",
          host: "Driven Luck Circuit",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Driven Luck Circuit",
          location: "Bryant, AL",
          dateStart: "2026-03-21",
          dateEnd: "2026-03-22",
          bannerImage: DLC_BANNER,
          description: "Desert mountain vibes at DLC. A fan-favorite weekend with relaxed runs and great media opportunities.",
        },
        {
          name: "Driven Luck Circuit – Choku Dori – Bryant, AL",
          host: "Driven Luck Circuit",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Driven Luck Circuit",
          location: "Bryant, AL",
          dateStart: "2026-04-18",
          dateEnd: "2026-04-19",
          bannerImage: DLC_BANNER,
          description: "Spring drift event focused on straight-line angle and commitment. One of DLC's most photographed events of the year.",
        },
        {
          name: "Driven Luck Circuit – Mayhem in May – Bryant, AL",
          host: "Driven Luck Circuit",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Driven Luck Circuit",
          location: "Bryant, AL",
          dateStart: "2026-05-16",
          dateEnd: "2026-05-17",
          bannerImage: DLC_BANNER,
          description: "Things get chaotic in the best way possible. Mayhem in May is DLC's signature high-energy spring event.",
        },
        {
          name: "Driven Luck Circuit – Slidin' into Summer – Bryant, AL",
          host: "Driven Luck Circuit",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Driven Luck Circuit",
          location: "Bryant, AL",
          dateStart: "2026-06-13",
          dateEnd: "2026-06-14",
          bannerImage: DLC_BANNER,
          description: "Kick off summer the right way — sideways. Warm temps, tire smoke, and long evenings at DLC.",
        },
        {
          name: "Driven Luck Circuit – Stars & Smoke Forever – Bryant, AL",
          host: "Driven Luck Circuit",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Driven Luck Circuit",
          location: "Bryant, AL",
          dateStart: "2026-07-03",
          dateEnd: "2026-07-05",
          bannerImage: DLC_BANNER,
          description: "Three-day Independence Day weekend event at DLC. Night runs, fireworks, and non-stop drifting under the stars.",
        },
        {
          name: "Driven Luck Circuit – Sideways Sisters – Bryant, AL",
          host: "Driven Luck Circuit",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Driven Luck Circuit",
          location: "Bryant, AL",
          dateStart: "2026-07-18",
          dateEnd: "2026-07-19",
          bannerImage: DLC_BANNER,
          description: "A women-forward drift weekend celebrating female drivers and creators in motorsports. Open to all.",
        },
        {
          name: "Driven Luck Circuit – Pool Party '26 – Bryant, AL",
          host: "Driven Luck Circuit",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Driven Luck Circuit",
          location: "Bryant, AL",
          dateStart: "2026-08-15",
          dateEnd: "2026-08-16",
          bannerImage: DLC_BANNER,
          description: "Beat the August heat with DLC's annual Pool Party. Drift sessions, cookout, and good vibes all weekend.",
        },
        {
          name: "Driven Luck Circuit – D-Luck Luau – Bryant, AL",
          host: "Driven Luck Circuit",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Driven Luck Circuit",
          location: "Bryant, AL",
          dateStart: "2026-09-19",
          dateEnd: "2026-09-20",
          bannerImage: DLC_BANNER,
          description: "Hawaiian-themed fall drift event. Leis, luau, and lots of tire smoke. A DLC crowd favorite every year.",
        },
        {
          name: "Driven Luck Circuit – Returning to Grassroots Vol. 4 – Bryant, AL",
          host: "Driven Luck Circuit",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Driven Luck Circuit",
          location: "Bryant, AL",
          dateStart: "2026-10-17",
          dateEnd: "2026-10-18",
          bannerImage: DLC_BANNER,
          description: "Volume 4 of DLC's ode to grassroots motorsports. No clout, no egos — just real drivers and real passion.",
        },

        // --- Formula Drift 2026 Championship ---
        {
          name: "Formula Drift – Rd. 1: Streets of Long Beach – Long Beach, CA",
          host: "Formula Drift",
          eventType: "Competition",
          isFeatured: true,
          venue: "Streets of Long Beach",
          location: "Long Beach, CA",
          dateStart: "2026-04-10",
          dateEnd: "2026-04-11",
          bannerImage: FD_BANNER,
          description: "Round 1 of the 2026 Formula Drift Championship. The iconic streets of Long Beach host the opening battle of the season.",
        },
        {
          name: "Formula Drift – Rd. 2: Road Atlanta – Atlanta, GA",
          host: "Formula Drift",
          eventType: "Competition",
          isFeatured: false,
          venue: "Road Atlanta",
          location: "Atlanta, GA",
          dateStart: "2026-05-07",
          dateEnd: "2026-05-09",
          bannerImage: FD_BANNER,
          description: "Round 2 at the legendary Road Atlanta circuit. One of the most technical and photographer-friendly venues on the FD calendar.",
        },
        {
          name: "Formula Drift – Rd. 3: Orlando Speedworld – Orlando, FL",
          host: "Formula Drift",
          eventType: "Competition",
          isFeatured: false,
          venue: "Orlando Speedworld",
          location: "Orlando, FL",
          dateStart: "2026-05-29",
          dateEnd: "2026-05-30",
          bannerImage: FD_BANNER,
          description: "Round 3 heads to Orlando Speedworld. Florida heat and massive crowds make this a standout stop on the tour.",
        },
        {
          name: "Formula Drift – Rd. 4: Stafford Speedway – Stafford, CT",
          host: "Formula Drift",
          eventType: "Competition",
          isFeatured: false,
          venue: "Stafford Speedway",
          location: "Stafford, CT",
          dateStart: "2026-06-18",
          dateEnd: "2026-06-20",
          bannerImage: FD_BANNER,
          description: "New venue alert — Round 4 brings Formula Drift to Stafford Speedway in Connecticut for the first time.",
        },
        {
          name: "Formula Drift – Rd. 5: Indianapolis Raceway Park – Indianapolis, IN",
          host: "Formula Drift",
          eventType: "Competition",
          isFeatured: false,
          venue: "Indianapolis Raceway Park",
          location: "Indianapolis, IN",
          dateStart: "2026-07-30",
          dateEnd: "2026-08-01",
          bannerImage: FD_BANNER,
          description: "New for 2026 — Round 5 at Indianapolis Raceway Park. The heartland of American motorsport welcomes Formula Drift.",
        },
        {
          name: "Formula Drift – Rd. 6: Evergreen Speedway – Monroe, WA",
          host: "Formula Drift",
          eventType: "Competition",
          isFeatured: false,
          venue: "Evergreen Speedway",
          location: "Monroe, WA",
          dateStart: "2026-08-21",
          dateEnd: "2026-08-22",
          bannerImage: FD_BANNER,
          description: "Round 6 in the Pacific Northwest. Evergreen Speedway delivers one of the most scenic backdrops on tour.",
        },
        {
          name: "Formula Drift – Rd. 7: Las Vegas Motor Speedway – Las Vegas, NV",
          host: "Formula Drift",
          eventType: "Competition",
          isFeatured: false,
          venue: "Las Vegas Motor Speedway (Bullring)",
          location: "Las Vegas, NV",
          dateStart: "2026-09-24",
          dateEnd: "2026-09-26",
          bannerImage: FD_BANNER,
          description: "New venue for 2026 — the Bullring at Las Vegas Motor Speedway. Three days of championship drifting under the desert sky.",
        },
        {
          name: "Formula Drift – Rd. 8: City of Long Beach – Long Beach, CA",
          host: "Formula Drift",
          eventType: "Competition",
          isFeatured: false,
          venue: "City of Long Beach",
          location: "Long Beach, CA",
          dateStart: "2026-10-23",
          dateEnd: "2026-10-24",
          bannerImage: FD_BANNER,
          description: "The 2026 Formula Drift season finale returns to Long Beach. Championship points on the line in the shadow of the harbor.",
        },

        // --- Grid Life 2026 ---
        {
          name: "Grid Life – South Carolina – Carolina Motorsports Park",
          host: "Grid Life",
          eventType: "Festival",
          isFeatured: false,
          venue: "Carolina Motorsports Park",
          location: "Kershaw, SC",
          dateStart: "2026-04-17",
          dateEnd: "2026-04-19",
          bannerImage: GL_BANNER,
          description: "Grid Life opens 2026 in the Carolinas. Three days of time attack, drift, and live music at Carolina Motorsports Park.",
        },
        {
          name: "Grid Life – Special Stage – Road Atlanta",
          host: "Grid Life",
          eventType: "Festival",
          isFeatured: false,
          venue: "Michelin Raceway Road Atlanta",
          location: "Braselton, GA",
          dateStart: "2026-05-07",
          dateEnd: "2026-05-09",
          bannerImage: GL_BANNER,
          description: "Grid Life's Special Stage at Road Atlanta. A unique format blending track driving with live entertainment on a legendary circuit.",
        },
        {
          name: "Grid Life – Midwest Festival – Gingerman Raceway",
          host: "Grid Life",
          eventType: "Festival",
          isFeatured: false,
          venue: "Gingerman Raceway",
          location: "South Haven, MI",
          dateStart: "2026-06-12",
          dateEnd: "2026-06-14",
          bannerImage: GL_BANNER,
          description: "The Midwest Festival at Gingerman Raceway. Grid Life's annual celebration of car culture in the heart of Michigan.",
        },
        {
          name: "Grid Life – Summer Apex – Watkins Glen International",
          host: "Grid Life",
          eventType: "Festival",
          isFeatured: true,
          venue: "Watkins Glen International",
          location: "Watkins Glen, NY",
          dateStart: "2026-07-24",
          dateEnd: "2026-07-26",
          bannerImage: GL_BANNER,
          description: "Summer Apex at the iconic Watkins Glen. Fast laps, big crowds, and world-class media content at one of America's greatest tracks.",
        },
        {
          name: "Grid Life – Circuit Legends – Lime Rock Park",
          host: "Grid Life",
          eventType: "Festival",
          isFeatured: false,
          venue: "Lime Rock Park",
          location: "Lakeville, CT",
          dateStart: "2026-08-21",
          dateEnd: "2026-08-23",
          bannerImage: GL_BANNER,
          description: "Circuit Legends at Lime Rock Park — a celebration of grassroots racing heritage at one of the Northeast's oldest circuits.",
        },
        {
          name: "Grid Life – Laguna Festival – WeatherTech Raceway Laguna Seca",
          host: "Grid Life",
          eventType: "Festival",
          isFeatured: false,
          venue: "WeatherTech Raceway Laguna Seca",
          location: "Monterey, CA",
          dateStart: "2026-09-18",
          dateEnd: "2026-09-20",
          bannerImage: GL_BANNER,
          description: "Grid Life closes the season at Laguna Seca. The Corkscrew, Pacific Ocean views, and three days of motorsports festival culture.",
        },

        // --- Drift Appalachia 2026 ---
        {
          name: "Drift Appalachia – Touge Special Stage 8 – Appalachia, TN",
          host: "Drift Appalachia",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "TBA — Appalachian Region",
          location: "Appalachia, TN",
          dateStart: "2026-03-27",
          dateEnd: "2026-03-28",
          bannerImage: DA_BANNER,
          description: "Night Stage Event. Drift Appalachia's Touge Special Stage 8 runs under the lights. Location TBA — check driftappalachia.com for updates.",
        },
        {
          name: "Drift Appalachia – Touge Special Stage 9 – Appalachia, TN",
          host: "Drift Appalachia",
          eventType: "Drift Event",
          isFeatured: true,
          venue: "TBA — Appalachian Region",
          location: "Appalachia, TN",
          dateStart: "2026-06-05",
          dateEnd: "2026-06-06",
          bannerImage: DA_BANNER,
          description: "Limited spectator event. DA Stage 9 brings the summer heat with restricted ticketing for an intimate touge experience.",
        },
        {
          name: "Drift Appalachia – Touge Special Stage 10 – Appalachia, TN",
          host: "Drift Appalachia",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "TBA — Appalachian Region",
          location: "Appalachia, TN",
          dateStart: "2026-10-02",
          dateEnd: "2026-10-03",
          bannerImage: DA_BANNER,
          description: "The final stage of the 2026 DA season. Fall foliage meets tire smoke at the Touge Special Stage 10.",
        },

        // --- Drift Indy 2026 (Darana Raceway, Xenia, Ohio) ---
        {
          name: "Drift Indy – Opening Day 2026 – Darana Raceway",
          host: "Drift Indy",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Darana Raceway",
          location: "Xenia, OH",
          dateStart: "2026-03-20",
          dateEnd: "2026-03-21",
          bannerImage: DI_BANNER,
          description: "The Drift Indy season kicks off at Darana Raceway. First laps of the year for the Ohio drift scene.",
        },
        {
          name: "Drift Indy – Drift Day – Darana Raceway",
          host: "Drift Indy",
          eventType: "Track Day",
          isFeatured: false,
          venue: "Darana Raceway",
          location: "Xenia, OH",
          dateStart: "2026-04-11",
          dateEnd: "2026-04-12",
          bannerImage: DI_BANNER,
          description: "April Drift Day at Darana Raceway. Open lapping sessions for drivers of all skill levels.",
        },
        {
          name: "Drift Indy – DISL/DIGP Round 1 – Darana Raceway",
          host: "Drift Indy",
          eventType: "Competition",
          isFeatured: false,
          venue: "Darana Raceway",
          location: "Xenia, OH",
          dateStart: "2026-05-15",
          dateEnd: "2026-05-16",
          bannerImage: DI_BANNER,
          description: "Round 1 of the Drift Indy Street League and Drift Indy Grand Prix championship series.",
        },
        {
          name: "Drift Indy – Drift Night: Luau – Darana Raceway",
          host: "Drift Indy",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Darana Raceway",
          location: "Xenia, OH",
          dateStart: "2026-07-17",
          dateEnd: "2026-07-18",
          bannerImage: DI_BANNER,
          description: "Luau-themed Drift Night at Darana. Summer nights, tropical vibes, and plenty of tire smoke.",
        },
        {
          name: "Drift Indy – No Star Bash 15th Annual – Darana Raceway",
          host: "Drift Indy",
          eventType: "Drift Event",
          isFeatured: true,
          venue: "Darana Raceway",
          location: "Xenia, OH",
          dateStart: "2026-09-18",
          dateEnd: "2026-09-20",
          bannerImage: DI_BANNER,
          description: "The 15th Annual No Star Bash — Drift Indy's biggest event of the year. Three days of grassroots drifting, no pro pretense.",
        },
        {
          name: "Drift Indy – Halloween Jam – Darana Raceway",
          host: "Drift Indy",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Darana Raceway",
          location: "Xenia, OH",
          dateStart: "2026-10-09",
          dateEnd: "2026-10-10",
          bannerImage: DI_BANNER,
          description: "Come in costume, leave with great content. The Halloween Jam is Drift Indy's spookiest and most creative event.",
        },

        // --- East10Drift / Formula Drift Pro Am ---
        {
          name: "East10Drift – Outside Groove – Knoxville, TN",
          host: "East10Drift",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Outside Groove",
          location: "Knoxville, TN",
          dateStart: "2026-02-21",
          dateEnd: "2026-02-22",
          bannerImage: E10_BANNER,
          description: "East10Drift opens the year at Outside Groove in Knoxville. Early-season shakedown with tight touge-style runs.",
        },
        {
          name: "East10Drift – Newport Speedway Night – Newport, TN",
          host: "East10Drift",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Newport Speedway",
          location: "Newport, TN",
          dateStart: "2026-03-20",
          dateEnd: "2026-03-20",
          bannerImage: E10_BANNER,
          description: "Night Stage event at Newport Speedway. East10Drift brings touge-style drifting to the hollers of Tennessee.",
        },
        {
          name: "East10Drift – BMS Funday – Bristol Motor Speedway",
          host: "East10Drift",
          eventType: "Drift Event",
          isFeatured: false,
          venue: "Bristol Motor Speedway",
          location: "Bristol, TN",
          dateStart: "2026-04-18",
          dateEnd: "2026-04-18",
          bannerImage: E10_BANNER,
          description: "Funday event at the iconic Bristol Motor Speedway. A rare chance to drift one of NASCAR's most famous ovals.",
        },
        {
          name: "East10Drift – FD Pro Am Rd. 1-2 – Bristol Motor Speedway",
          host: "East10Drift",
          eventType: "Competition",
          isFeatured: false,
          venue: "Bristol Motor Speedway",
          location: "Bristol, TN",
          dateStart: "2026-08-15",
          dateEnd: "2026-08-16",
          bannerImage: E10_BANNER,
          description: "Formula Drift Pro Am Rounds 1 and 2 hosted by East10Drift at Bristol Motor Speedway. Championship points on the line.",
        },
        {
          name: "East10Drift – FD Pro Am Rd. 3-4 – Newport Speedway",
          host: "East10Drift",
          eventType: "Competition",
          isFeatured: false,
          venue: "Newport Speedway",
          location: "Newport, TN",
          dateStart: "2026-09-12",
          dateEnd: "2026-09-13",
          bannerImage: E10_BANNER,
          description: "Formula Drift Pro Am Rounds 3 and 4 at Newport Speedway. East10Drift brings the Pro Am season to a dramatic close.",
        },
      ];

      // Duplicate-safe insertion: skip if same name + start date already exists
      let inserted = 0;
      for (const event of seedEvents) {
        const startDate = new Date(event.dateStart);
        const duplicate = await storage.findDuplicateEvent(event.name, startDate);
        if (!duplicate) {
          await storage.createEvent({
            ...event,
            dateStart: startDate,
            dateEnd: new Date(event.dateEnd),
          } as any);
          inserted++;
        }
      }

      return res.json({ message: "Seed data created", inserted, total: seedEvents.length });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Stripe Connect routes ─────────────────────────────────────────────────
  registerStripeRoutes(app);

  const httpServer = createServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Map<string, WebSocket>();

  wss.on("connection", async (ws, req) => {
    // Authenticate from the session cookie — never trust a client-supplied userId
    const userId = await getSessionUserId(req);

    if (!userId) {
      ws.close(1008, "Unauthorized");
      return;
    }

    clients.set(userId, ws);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // userId is verified server-side — ignore any inbound auth messages
        if (msg.type === "message") {
          const receiverWs = clients.get(msg.receiverId);
          if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
            receiverWs.send(
              JSON.stringify({
                type: "new_message",
                message: msg.data,
              }),
            );
          }
        }
      } catch {}
    });

    ws.on("close", () => {
      clients.delete(userId);
    });
  });

  return httpServer;
}
