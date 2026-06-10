import { eq, and, or, desc, sql, ilike } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  events,
  attendance,
  portfolioMedia,
  packages,
  bookings,
  transactions,
  deliveries,
  messages,
  type User,
  type Event,
  type Attendance,
  type PortfolioMedia,
  type Package,
  type Booking,
  type Transaction,
  type Delivery,
  type Message,
} from "@shared/schema";

// ── Platform fee ────────────────────────────────────────────────────────────
function getPlatformFeePercent(): number {
  const raw = process.env.PLATFORM_FEE_PERCENT;
  const parsed = raw ? parseFloat(raw) : NaN;
  return isNaN(parsed) ? 10 : parsed;
}

export function calcFees(grossAmount: number): {
  driverFeeAmount: number;
  creatorFeeAmount: number;
  platformFeeAmount: number;
  creatorPayoutAmount: number;
} {
  const totalFeePercent = getPlatformFeePercent(); // e.g. 10
  const halfPercent = totalFeePercent / 2;          // 5% each side
  const driverFeeAmount  = parseFloat(((grossAmount * halfPercent) / 100).toFixed(2));
  const creatorFeeAmount = parseFloat(((grossAmount * halfPercent) / 100).toFixed(2));
  const platformFeeAmount = parseFloat((driverFeeAmount + creatorFeeAmount).toFixed(2));
  const creatorPayoutAmount = parseFloat((grossAmount - creatorFeeAmount).toFixed(2));
  return { driverFeeAmount, creatorFeeAmount, platformFeeAmount, creatorPayoutAmount };
}

export const storage = {
  // ── Users ────────────────────────────────────────────────────────────────

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  },

  async createUser(data: {
    email: string;
    passwordHash: string;
    displayName: string;
    primaryRole: "driver" | "creator";
    isDriverEnabled?: boolean;
    isCreatorEnabled?: boolean;
  }): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  },

  async updateUser(
    id: string,
    data: Partial<Omit<User, "id" | "createdAt">>,
  ): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return user;
  },

  // ── Events ───────────────────────────────────────────────────────────────

  async getEvents(search?: string): Promise<Event[]> {
    if (search) {
      return db
        .select()
        .from(events)
        .where(
          or(
            ilike(events.name, `%${search}%`),
            ilike(events.location, `%${search}%`),
          ),
        )
        .orderBy(events.dateStart);
    }
    return db.select().from(events).orderBy(events.dateStart);
  },

  async getEventById(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  },

  /**
   * Checks whether an event with the same (case-insensitive) name and the same
   * calendar date already exists.  Used for duplicate prevention — runs a
   * targeted SQL query instead of loading the entire events table.
   */
  async findDuplicateEvent(name: string, startDate: Date): Promise<Event | undefined> {
    const dateStr = startDate.toISOString().split("T")[0]; // "YYYY-MM-DD"
    const [event] = await db
      .select()
      .from(events)
      .where(
        and(
          sql`LOWER(TRIM(${events.name})) = LOWER(TRIM(${name}))`,
          sql`${events.dateStart}::date = ${dateStr}::date`,
        ),
      );
    return event;
  },

  async createEvent(
    data: Omit<Event, "id" | "createdAt">,
  ): Promise<Event> {
    const [event] = await db.insert(events).values(data).returning();
    return event;
  },

  // ── Attendance ───────────────────────────────────────────────────────────

  async getEventAttendees(
    eventId: string,
  ): Promise<(Attendance & { user: User })[]> {
    const result = await db
      .select()
      .from(attendance)
      .innerJoin(users, eq(attendance.userId, users.id))
      .where(eq(attendance.eventId, eventId));
    return result.map((r) => ({ ...r.attendance, user: r.users }));
  },

  /**
   * Returns creator attendees for an event, enriched with their cheapest package price
   * and current availability. Used for the "Media Creators Attending" section.
   */
  async getEventCreators(
    eventId: string,
  ): Promise<
    (Attendance & {
      user: Omit<User, "passwordHash">;
      startingPrice: string | null;
      packageCount: number;
    })[]
  > {
    const result = await db
      .select()
      .from(attendance)
      .innerJoin(users, eq(attendance.userId, users.id))
      .where(
        and(
          eq(attendance.eventId, eventId),
          or(
            eq(attendance.role, "creator"),
            eq(attendance.role, "both"),
          ),
        ),
      );

    const enriched = [];
    for (const r of result) {
      const { passwordHash: _, ...safeUser } = r.users;
      const pkgs = await db
        .select()
        .from(packages)
        .where(eq(packages.creatorId, r.users.id));

      const prices = pkgs
        .map((p) => parseFloat(p.price))
        .filter((n) => !isNaN(n));
      const startingPrice =
        prices.length > 0
          ? Math.min(...prices).toFixed(2)
          : null;

      enriched.push({
        ...r.attendance,
        user: safeUser,
        startingPrice,
        packageCount: pkgs.length,
      });
    }
    return enriched;
  },

  async joinEvent(data: {
    userId: string;
    eventId: string;
    role: "driver" | "creator" | "both";
    maxBookings?: number;
  }): Promise<Attendance> {
    const [existing] = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.userId, data.userId),
          eq(attendance.eventId, data.eventId),
        ),
      );
    if (existing) {
      const [updated] = await db
        .update(attendance)
        .set({ role: data.role, maxBookings: data.maxBookings ?? existing.maxBookings })
        .where(eq(attendance.id, existing.id))
        .returning();
      return updated;
    }
    const [att] = await db
      .insert(attendance)
      .values({
        userId: data.userId,
        eventId: data.eventId,
        role: data.role,
        maxBookings: data.maxBookings ?? 10,
      })
      .returning();
    return att;
  },

  async leaveEvent(userId: string, eventId: string): Promise<void> {
    await db
      .delete(attendance)
      .where(
        and(eq(attendance.userId, userId), eq(attendance.eventId, eventId)),
      );
  },

  async updateAvailability(
    userId: string,
    eventId: string,
    status: "available" | "limited" | "fully_booked",
  ): Promise<void> {
    await db
      .update(attendance)
      .set({ availabilityStatus: status })
      .where(
        and(eq(attendance.userId, userId), eq(attendance.eventId, eventId)),
      );
  },

  async getUserAttendance(userId: string): Promise<(Attendance & { event: Event })[]> {
    const result = await db
      .select()
      .from(attendance)
      .innerJoin(events, eq(attendance.eventId, events.id))
      .where(eq(attendance.userId, userId));
    return result.map((r) => ({ ...r.attendance, event: r.events }));
  },

  async getUserUpcomingEvents(userId: string): Promise<Event[]> {
    const now = new Date();
    const result = await db
      .select()
      .from(attendance)
      .innerJoin(events, eq(attendance.eventId, events.id))
      .where(and(eq(attendance.userId, userId)))
      .orderBy(events.dateStart);
    const upcoming = result
      .filter((r) => new Date(r.events.dateEnd) >= now)
      .slice(0, 6);
    return upcoming.map((r) => r.events);
  },

  // ── Portfolio ────────────────────────────────────────────────────────────

  async getPortfolio(userId: string): Promise<PortfolioMedia[]> {
    return db
      .select()
      .from(portfolioMedia)
      .where(eq(portfolioMedia.userId, userId))
      .orderBy(desc(portfolioMedia.createdAt));
  },

  async addPortfolioItem(
    userId: string,
    data: Partial<PortfolioMedia>,
  ): Promise<PortfolioMedia> {
    const [item] = await db
      .insert(portfolioMedia)
      .values({ ...data, userId } as any)
      .returning();
    return item;
  },

  async deletePortfolioItem(id: string, userId: string): Promise<void> {
    await db
      .delete(portfolioMedia)
      .where(and(eq(portfolioMedia.id, id), eq(portfolioMedia.userId, userId)));
  },

  // ── Packages ─────────────────────────────────────────────────────────────

  async getPackages(creatorId: string): Promise<Package[]> {
    return db
      .select()
      .from(packages)
      .where(eq(packages.creatorId, creatorId))
      .orderBy(packages.createdAt);
  },

  async getPackageById(id: string): Promise<Package | undefined> {
    const [pkg] = await db.select().from(packages).where(eq(packages.id, id));
    return pkg;
  },

  async createPackage(
    creatorId: string,
    data: Partial<Package>,
  ): Promise<Package> {
    const [pkg] = await db
      .insert(packages)
      .values({ ...data, creatorId } as any)
      .returning();
    return pkg;
  },

  async updatePackage(
    id: string,
    creatorId: string,
    data: Partial<{
      title: string;
      description: string;
      price: string;
      deliveryTime: string;
      isPopular: boolean;
    }>,
  ): Promise<Package | undefined> {
    const [pkg] = await db
      .update(packages)
      .set(data)
      .where(and(eq(packages.id, id), eq(packages.creatorId, creatorId)))
      .returning();
    return pkg;
  },

  async deletePackage(id: string, creatorId: string): Promise<void> {
    await db
      .delete(packages)
      .where(and(eq(packages.id, id), eq(packages.creatorId, creatorId)));
  },

  // ── Bookings ─────────────────────────────────────────────────────────────

  /**
   * Creates a booking and snapshots package price + calculates platform fees server-side.
   * Fee values sent from the client are ALWAYS ignored.
   */
  async createBooking(data: {
    driverId: string;
    creatorId: string;
    eventId: string;
    packageId?: string;
    notes?: string;
  }): Promise<Booking> {
    let packagePrice: string | undefined;
    let platformFeeAmount: string | undefined;
    let creatorPayoutAmount: string | undefined;

    if (data.packageId) {
      const pkg = await this.getPackageById(data.packageId);
      if (pkg) {
        const gross = parseFloat(pkg.price);
        if (!isNaN(gross)) {
          const fees = calcFees(gross);
          packagePrice = gross.toFixed(2);
          platformFeeAmount = fees.platformFeeAmount.toFixed(2);
          creatorPayoutAmount = fees.creatorPayoutAmount.toFixed(2);
        }
      }
    }

    const [booking] = await db
      .insert(bookings)
      .values({
        ...data,
        packagePrice,
        platformFeeAmount,
        creatorPayoutAmount,
      } as any)
      .returning();
    return booking;
  },

  async getBookingById(
    bookingId: string,
    requestingUserId: string,
  ): Promise<
    | (Booking & {
        driver: Omit<User, "passwordHash">;
        creator: Omit<User, "passwordHash">;
        event: Event;
        pkg: Package | null;
      })
    | null
  > {
    const [row] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));

    if (!row) return null;

    // Only the driver or creator can view the booking
    if (row.driverId !== requestingUserId && row.creatorId !== requestingUserId) {
      return null;
    }

    const [driverUser] = await db.select().from(users).where(eq(users.id, row.driverId));
    const [creatorUser] = await db.select().from(users).where(eq(users.id, row.creatorId));
    const [eventRow] = await db.select().from(events).where(eq(events.id, row.eventId));

    let pkg: Package | null = null;
    if (row.packageId) {
      const [p] = await db.select().from(packages).where(eq(packages.id, row.packageId));
      pkg = p || null;
    }

    const { passwordHash: _d, ...safeDriver } = driverUser;
    const { passwordHash: _c, ...safeCreator } = creatorUser;

    return {
      ...row,
      driver: safeDriver,
      creator: safeCreator,
      event: eventRow,
      pkg,
    };
  },

  async getBookingsForUser(userId: string): Promise<
    (Booking & { driver: User; creator: User; event: Event; pkg: Package | null })[]
  > {
    const result = await db
      .select()
      .from(bookings)
      .innerJoin(users, eq(bookings.driverId, users.id))
      .innerJoin(events, eq(bookings.eventId, events.id))
      .where(or(eq(bookings.driverId, userId), eq(bookings.creatorId, userId)))
      .orderBy(desc(bookings.createdAt));

    const enriched = [];
    for (const r of result) {
      const [creator] = await db
        .select()
        .from(users)
        .where(eq(users.id, r.bookings.creatorId));
      let pkg: Package | null = null;
      if (r.bookings.packageId) {
        const [p] = await db
          .select()
          .from(packages)
          .where(eq(packages.id, r.bookings.packageId));
        pkg = p || null;
      }
      enriched.push({
        ...r.bookings,
        driver: r.users,
        creator,
        event: r.events,
        pkg,
      });
    }
    return enriched;
  },

  /**
   * Updates booking status with role-based permission enforcement.
   * Creator can: accept, decline, in_progress, footage_delivered, completed
   * Driver can: cancel (if still requested), disputed
   * Both can transition to disputed
   */
  async updateBookingStatus(
    bookingId: string,
    requestingUserId: string,
    newStatus: string,
  ): Promise<Booking | undefined> {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId));

    if (!booking) return undefined;

    const isCreator = booking.creatorId === requestingUserId;
    const isDriver = booking.driverId === requestingUserId;

    if (!isCreator && !isDriver) return undefined;

    // Permission rules
    const creatorAllowed = ["accepted", "declined", "in_progress", "footage_delivered", "completed", "disputed"];
    const driverAllowed = ["cancelled", "disputed"];

    if (isCreator && !creatorAllowed.includes(newStatus)) return undefined;
    if (isDriver && !driverAllowed.includes(newStatus)) return undefined;
    // Driver can only cancel if booking is still requested
    if (isDriver && newStatus === "cancelled" && booking.status !== "requested") return undefined;

    const [updated] = await db
      .update(bookings)
      .set({ status: newStatus as any, updatedAt: new Date() })
      .where(eq(bookings.id, bookingId))
      .returning();

    if (!updated) return undefined;

    // Update creator availability when accepted
    if (updated.status === "accepted") {
      const acceptedCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.creatorId, updated.creatorId),
            eq(bookings.eventId, updated.eventId),
            eq(bookings.status, "accepted"),
          ),
        );
      const count = Number(acceptedCount[0]?.count || 0);
      const [att] = await db
        .select()
        .from(attendance)
        .where(
          and(
            eq(attendance.userId, updated.creatorId),
            eq(attendance.eventId, updated.eventId),
          ),
        );
      if (att) {
        const max = att.maxBookings || 10;
        if (count >= max) {
          await db
            .update(attendance)
            .set({ availabilityStatus: "fully_booked" })
            .where(eq(attendance.id, att.id));
        } else if (count >= Math.ceil(max * 0.7)) {
          await db
            .update(attendance)
            .set({ availabilityStatus: "limited" })
            .where(eq(attendance.id, att.id));
        }
      }

      // Create transaction record on acceptance (scaffold)
      if (updated.packagePrice) {
        const gross = parseFloat(updated.packagePrice);
        if (!isNaN(gross)) {
          const fees = calcFees(gross);
          await db.insert(transactions).values({
            bookingId: updated.id,
            driverId: updated.driverId,
            creatorId: updated.creatorId,
            eventId: updated.eventId,
            packageId: updated.packageId ?? undefined,
            grossAmount: gross.toFixed(2),
            platformFeeAmount: fees.platformFeeAmount.toFixed(2),
            creatorPayoutAmount: fees.creatorPayoutAmount.toFixed(2),
            currency: "usd",
          } as any);
        }
      }
    }

    return updated;
  },

  // ── Transactions ─────────────────────────────────────────────────────────

  async getTransactionByBookingId(bookingId: string): Promise<Transaction | undefined> {
    const [tx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.bookingId, bookingId));
    return tx;
  },

  /** Force-completes a booking regardless of who is calling. Used server-side after delivery approval. */
  async forceCompleteBooking(bookingId: string): Promise<void> {
    await db
      .update(bookings)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(bookings.id, bookingId));
  },

  async getCompletedBookingsCount(creatorId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(and(eq(bookings.creatorId, creatorId), eq(bookings.status, "completed")));
    return Number(result[0]?.count || 0);
  },

  // ── Deliveries ───────────────────────────────────────────────────────────

  async getDeliveriesForBooking(bookingId: string): Promise<Delivery[]> {
    return db
      .select()
      .from(deliveries)
      .where(eq(deliveries.bookingId, bookingId))
      .orderBy(desc(deliveries.createdAt));
  },

  async createDelivery(data: {
    bookingId: string;
    creatorId: string;
    driverId: string;
    deliveryType: string;
    title: string;
    notes?: string;
    fileUrl?: string;
    externalLink?: string;
  }): Promise<Delivery> {
    const [delivery] = await db
      .insert(deliveries)
      .values({
        ...data,
        status: "delivered",
      } as any)
      .returning();
    return delivery;
  },

  async updateDeliveryStatus(
    deliveryId: string,
    requestingUserId: string,
    newStatus: "approved" | "revision_requested",
    revisionNotes?: string,
  ): Promise<Delivery | undefined> {
    const [delivery] = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, deliveryId));

    if (!delivery) return undefined;
    // Only the assigned driver can approve or request revision
    if (delivery.driverId !== requestingUserId) return undefined;

    const [updated] = await db
      .update(deliveries)
      .set({
        status: newStatus,
        revisionNotes: newStatus === "revision_requested" ? (revisionNotes || "") : delivery.revisionNotes,
        updatedAt: new Date(),
      })
      .where(eq(deliveries.id, deliveryId))
      .returning();
    return updated;
  },

  // ── Messages ─────────────────────────────────────────────────────────────

  async getConversations(userId: string): Promise<
    { otherUser: User; lastMessage: Message; unreadCount: number }[]
  > {
    const allMessages = await db
      .select()
      .from(messages)
      .where(or(eq(messages.senderId, userId), eq(messages.receiverId, userId)))
      .orderBy(desc(messages.createdAt));

    const conversationMap = new Map<
      string,
      { lastMessage: Message; otherUserId: string }
    >();

    for (const msg of allMessages) {
      const otherUserId =
        msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!conversationMap.has(otherUserId)) {
        conversationMap.set(otherUserId, {
          lastMessage: msg,
          otherUserId,
        });
      }
    }

    const conversations = [];
    for (const [, conv] of conversationMap) {
      const [otherUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, conv.otherUserId));
      if (!otherUser) continue;

      const unreadResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(
          and(
            eq(messages.senderId, conv.otherUserId),
            eq(messages.receiverId, userId),
            eq(messages.read, false),
          ),
        );

      conversations.push({
        otherUser,
        lastMessage: conv.lastMessage,
        unreadCount: Number(unreadResult[0]?.count || 0),
      });
    }

    return conversations;
  },

  async getMessages(
    userId: string,
    otherUserId: string,
  ): Promise<Message[]> {
    await db
      .update(messages)
      .set({ read: true })
      .where(
        and(
          eq(messages.senderId, otherUserId),
          eq(messages.receiverId, userId),
          eq(messages.read, false),
        ),
      );

    return db
      .select()
      .from(messages)
      .where(
        or(
          and(
            eq(messages.senderId, userId),
            eq(messages.receiverId, otherUserId),
          ),
          and(
            eq(messages.senderId, otherUserId),
            eq(messages.receiverId, userId),
          ),
        ),
      )
      .orderBy(messages.createdAt);
  },

  async sendMessage(data: {
    senderId: string;
    receiverId: string;
    bookingId?: string;
    messageText: string;
  }): Promise<Message> {
    const [msg] = await db.insert(messages).values(data).returning();
    return msg;
  },
};
