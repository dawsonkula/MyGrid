/**
 * Stripe Connect Express routes for MyGrid.
 *
 * All amounts are in USD cents for Stripe API calls.
 * Fee math is always server-side — clients never control amounts.
 *
 * TEST MODE: use Stripe test keys and card 4242 4242 4242 4242.
 * Required env vars:
 *   STRIPE_SECRET_KEY          — secret API key (sk_test_... or sk_live_...)
 *   STRIPE_WEBHOOK_SECRET      — from Stripe Dashboard → Webhooks → signing secret
 *   STRIPE_CONNECT_CLIENT_ID   — from Stripe Dashboard → Connect Settings
 *   CLIENT_APP_URL             — your deployed app URL (for redirect URLs)
 *
 * Optional env vars:
 *   ALLOW_STRIPE_UNCONNECTED_TEST_CHECKOUT=true
 *     Allow checkout without a connected creator Stripe account.
 *     Default: false. NEVER set true in production.
 */

import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { storage } from "./storage";
import { db } from "./db";
import { users, transactions, bookings, stripeEvents } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { calcFees } from "./storage";

// ── Stripe instance (lazy, requires STRIPE_SECRET_KEY) ──────────────────────

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!_stripe) {
    _stripe = new Stripe(key, { apiVersion: "2024-06-20" as any });
  }
  return _stripe;
}

function requireStripeOrRespond(res: Response): Stripe | null {
  try {
    return getStripe();
  } catch {
    res.status(503).json({
      message: "Stripe is not configured. Add STRIPE_SECRET_KEY to your environment.",
    });
    return null;
  }
}

function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Returns true if checkout is allowed without a connected creator account.
 * Controlled by ALLOW_STRIPE_UNCONNECTED_TEST_CHECKOUT env var — default FALSE.
 */
function isUnconnectedCheckoutAllowed(): boolean {
  return process.env.ALLOW_STRIPE_UNCONNECTED_TEST_CHECKOUT === "true";
}

// ── Auth helper (inline to avoid circular import) ────────────────────────────

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session?.userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  next();
}

// ── Webhook idempotency ──────────────────────────────────────────────────────

/**
 * Returns true if the event has already been processed (idempotency check).
 * Records the event if it's new so it cannot be processed again.
 */
async function checkAndMarkEventProcessed(
  stripeEventId: string,
  eventType: string,
): Promise<boolean> {
  // Check if already processed
  const [existing] = await db
    .select()
    .from(stripeEvents)
    .where(eq(stripeEvents.stripeEventId, stripeEventId));

  if (existing) {
    console.log(`[Webhook] Skipping duplicate event ${stripeEventId} (${eventType})`);
    return true; // already processed
  }

  // Insert record to claim this event — unique constraint prevents races
  try {
    await db.insert(stripeEvents).values({
      stripeEventId,
      eventType,
    });
  } catch (err: any) {
    // Unique constraint violation = another process beat us to it
    if (err.code === "23505") {
      console.log(`[Webhook] Race: duplicate event ${stripeEventId} — skipping`);
      return true;
    }
    throw err; // unexpected error — propagate
  }

  return false; // fresh event, proceed
}

// ── Routes ───────────────────────────────────────────────────────────────────

export function registerStripeRoutes(app: Express) {

  // ──────────────────────────────────────────────────────────────────────────
  // Creator onboarding: create/resume Stripe Express account + link
  // ──────────────────────────────────────────────────────────────────────────

  app.post("/api/stripe/connect/onboard", requireAuth, async (req: Request, res: Response) => {
    const stripe = requireStripeOrRespond(res);
    if (!stripe) return;

    try {
      const userId = req.session.userId!;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "User not found" });

      if (!user.isCreatorEnabled) {
        return res.status(403).json({
          message: "Creator profile must be enabled to set up payouts",
        });
      }

      // Create Stripe Express account if not already set up
      let accountId = user.stripeAccountId;
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "express",
          email: user.email,
          metadata: { userId },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        accountId = account.id;
        await db
          .update(users)
          .set({ stripeAccountId: accountId })
          .where(eq(users.id, userId));
      }

      const clientAppUrl =
        process.env.CLIENT_APP_URL ||
        (process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : "http://localhost:8081");

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: clientAppUrl,
        return_url: clientAppUrl,
        type: "account_onboarding",
      });

      return res.json({ url: accountLink.url });
    } catch (err: any) {
      console.error("Stripe onboarding error:", err);
      return res.status(500).json({ message: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Get creator Stripe status + refresh from Stripe (source of truth)
  // ──────────────────────────────────────────────────────────────────────────

  app.get("/api/stripe/connect/status", requireAuth, async (req: Request, res: Response) => {
    const stripe = requireStripeOrRespond(res);
    if (!stripe) return;

    try {
      const userId = req.session.userId!;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "User not found" });

      if (!user.stripeAccountId) {
        return res.json({
          hasAccount: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          status: "not_started",
        });
      }

      const account = await stripe.accounts.retrieve(user.stripeAccountId);

      const chargesEnabled = account.charges_enabled ?? false;
      const payoutsEnabled = account.payouts_enabled ?? false;
      const detailsSubmitted = account.details_submitted ?? false;

      // Sync to DB
      await db
        .update(users)
        .set({ stripeChargesEnabled: chargesEnabled, stripePayoutsEnabled: payoutsEnabled, stripeDetailsSubmitted: detailsSubmitted })
        .where(eq(users.id, userId));

      return res.json({
        hasAccount: true,
        accountId: user.stripeAccountId,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted,
        status:
          chargesEnabled && payoutsEnabled
            ? "ready"
            : detailsSubmitted
              ? "in_review"
              : "not_started",
      });
    } catch (err: any) {
      console.error("Stripe status error:", err);
      return res.status(500).json({ message: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Driver creates Stripe Checkout session for an accepted booking
  // ──────────────────────────────────────────────────────────────────────────

  app.post(
    "/api/bookings/:bookingId/create-checkout-session",
    requireAuth,
    async (req: Request, res: Response) => {
      const stripe = requireStripeOrRespond(res);
      if (!stripe) return;

      try {
        const { bookingId } = req.params;
        const driverId = req.session.userId!;

        // Auth: only the assigned driver can initiate payment
        const booking = await storage.getBookingById(bookingId, driverId);
        if (!booking)
          return res.status(404).json({ message: "Booking not found or access denied" });
        if (booking.driverId !== driverId)
          return res.status(403).json({ message: "Only the driver can pay for this booking" });
        if (!["accepted", "payment_pending"].includes(booking.status))
          return res.status(400).json({ message: "Booking must be accepted before payment" });

        // Load creator's Stripe account status
        const [creator] = await db.select().from(users).where(eq(users.id, booking.creatorId));
        if (!creator)
          return res.status(404).json({ message: "Creator not found" });

        const creatorStripeReady =
          !!creator.stripeAccountId &&
          !!creator.stripeChargesEnabled;

        // E) ALLOW_STRIPE_UNCONNECTED_TEST_CHECKOUT controls whether checkout
        //    can proceed without a connected creator. Default: false.
        if (!creatorStripeReady) {
          if (!isUnconnectedCheckoutAllowed()) {
            return res.status(400).json({
              message:
                "Creator has not completed Stripe payout setup. They must set up their payout account before payment.",
              code: "CREATOR_STRIPE_NOT_READY",
            });
          }
          // ALLOW_STRIPE_UNCONNECTED_TEST_CHECKOUT=true — log a loud warning
          console.warn(
            `[WARN] ALLOW_STRIPE_UNCONNECTED_TEST_CHECKOUT is active — ` +
            `checkout for booking ${bookingId} proceeding WITHOUT connected creator account. ` +
            `Creator ${creator.id} has not completed Stripe setup.`,
          );
        }

        // Determine gross amount from booking snapshot
        if (!booking.packagePrice || parseFloat(booking.packagePrice) <= 0) {
          return res.status(400).json({
            message: "Booking has no package price — cannot create checkout session",
          });
        }
        const grossAmount = parseFloat(booking.packagePrice);
        const { platformFeeAmount } = calcFees(grossAmount);

        // Require transaction record (created when creator accepted)
        const tx = await storage.getTransactionByBookingId(bookingId);
        if (!tx)
          return res.status(400).json({ message: "Transaction record not found for this booking" });

        const clientAppUrl =
          process.env.CLIENT_APP_URL ||
          (process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : "http://localhost:8081");

        const sessionParams: Stripe.Checkout.SessionCreateParams = {
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: booking.pkg?.title || "Media Creator Booking",
                  description: `Event: ${booking.event?.name || bookingId}`,
                },
                unit_amount: dollarsToCents(grossAmount),
              },
              quantity: 1,
            },
          ],
          metadata: {
            bookingId,
            transactionId: tx.id,
            driverId,
            creatorId: booking.creatorId,
            eventId: booking.eventId,
          },
          success_url: clientAppUrl,
          cancel_url: clientAppUrl,
        };

        // Add destination charge only when creator account is ready
        if (creatorStripeReady) {
          sessionParams.payment_intent_data = {
            application_fee_amount: dollarsToCents(platformFeeAmount),
            transfer_data: { destination: creator.stripeAccountId! },
            metadata: { bookingId, transactionId: tx.id },
          };
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        // Save checkout session ID and mark as pending
        await db
          .update(transactions)
          .set({
            stripeCheckoutSessionId: session.id,
            paymentStatus: "pending",
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, tx.id));

        // Transition booking to payment_pending
        if (booking.status === "accepted") {
          await db
            .update(bookings)
            .set({ status: "payment_pending", updatedAt: new Date() })
            .where(eq(bookings.id, bookingId));
        }

        return res.json({ url: session.url, sessionId: session.id });
      } catch (err: any) {
        console.error("Checkout session error:", err);
        return res.status(500).json({ message: err.message });
      }
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Stripe webhook — source of truth for payment status
  // Raw body is captured by express.json() verify callback in server/index.ts
  // ──────────────────────────────────────────────────────────────────────────

  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    const stripe = requireStripeOrRespond(res);
    if (!stripe) return;

    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn("STRIPE_WEBHOOK_SECRET not set — webhook rejected");
      return res.status(400).json({ message: "Webhook secret not configured" });
    }

    let event: Stripe.Event;
    try {
      const rawBody = (req as any).rawBody;
      if (!rawBody) return res.status(400).json({ message: "Raw body not available" });
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error("Stripe webhook signature error:", err.message);
      return res.status(400).json({ message: `Webhook signature invalid: ${err.message}` });
    }

    // B) Idempotency check — skip if already processed
    const alreadyProcessed = await checkAndMarkEventProcessed(event.id, event.type);
    if (alreadyProcessed) {
      return res.json({ received: true, duplicate: true });
    }

    try {
      await handleWebhookEvent(stripe, event);
      return res.json({ received: true });
    } catch (err: any) {
      console.error(`Webhook handler error for ${event.type}:`, err);
      // Remove the processed record so Stripe can retry
      await db
        .delete(stripeEvents)
        .where(eq(stripeEvents.stripeEventId, event.id))
        .catch(() => {});
      return res.status(500).json({ message: "Webhook handler failed" });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // F) Cancel unpaid booking (driver only, no payment has been taken)
  // ──────────────────────────────────────────────────────────────────────────

  app.post(
    "/api/bookings/:bookingId/cancel-unpaid",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const { bookingId } = req.params;
        const userId = req.session.userId!;

        const booking = await storage.getBookingById(bookingId, userId);
        if (!booking)
          return res.status(404).json({ message: "Booking not found or access denied" });
        if (booking.driverId !== userId)
          return res.status(403).json({ message: "Only the driver can cancel" });
        if (!["requested", "accepted", "payment_pending"].includes(booking.status)) {
          return res.status(400).json({
            message: "Booking cannot be cancelled at this stage",
          });
        }

        // Cancel the booking only — do NOT call forceCompleteBooking
        await db
          .update(bookings)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(bookings.id, bookingId));

        // If a transaction exists and is not yet paid, mark it cancelled too
        const tx = await storage.getTransactionByBookingId(bookingId);
        if (tx && ["not_started", "pending", "failed"].includes(tx.paymentStatus)) {
          await db
            .update(transactions)
            .set({ paymentStatus: "cancelled", updatedAt: new Date() })
            .where(eq(transactions.id, tx.id));
        }

        return res.json({ message: "Booking cancelled" });
      } catch (err: any) {
        return res.status(500).json({ message: err.message });
      }
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Refund paid booking — admin-managed only in alpha/beta
  // ──────────────────────────────────────────────────────────────────────────

  app.post(
    "/api/bookings/:bookingId/refund",
    requireAuth,
    async (_req: Request, res: Response) => {
      return res.status(403).json({
        message:
          "Refunds are handled by the MyGrid admin team during alpha/beta. Contact support.",
      });
    },
  );
}

// ── Webhook event handler ────────────────────────────────────────────────────

async function handleWebhookEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  const data = event.data.object as any;

  switch (event.type) {

    // ── C) checkout.session.completed: save all IDs, move booking to in_progress ─

    case "checkout.session.completed": {
      const session = data as Stripe.Checkout.Session;
      const { bookingId, transactionId } = session.metadata || {};
      if (!bookingId || !transactionId) {
        console.warn(`[Webhook] checkout.session.completed missing metadata`);
        break;
      }

      const piId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;

      let stripeChargeId: string | undefined;
      let stripeApplicationFeeId: string | undefined;
      let stripeTransferId: string | undefined;

      // Retrieve the PaymentIntent to get charge + fee + transfer IDs
      if (piId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(piId, {
            expand: ["latest_charge", "latest_charge.transfer"],
          });

          const charge = pi.latest_charge as Stripe.Charge | null | undefined;
          if (charge && typeof charge === "object") {
            stripeChargeId = charge.id;

            // Application fee ID
            if (charge.application_fee && typeof charge.application_fee === "string") {
              stripeApplicationFeeId = charge.application_fee;
            } else if (charge.application_fee && typeof (charge.application_fee as any) === "object") {
              stripeApplicationFeeId = (charge.application_fee as any).id;
            }

            // Transfer ID
            if (charge.transfer && typeof charge.transfer === "string") {
              stripeTransferId = charge.transfer;
            } else if (charge.transfer && typeof (charge.transfer as any) === "object") {
              stripeTransferId = (charge.transfer as any).id;
            }
          }
        } catch (err: any) {
          console.warn(`[Webhook] Could not retrieve PaymentIntent ${piId}: ${err.message}`);
        }
      }

      await db
        .update(transactions)
        .set({
          stripePaymentIntentId: piId || undefined,
          stripeChargeId: stripeChargeId || undefined,
          stripeApplicationFeeId: stripeApplicationFeeId || undefined,
          stripeTransferId: stripeTransferId || undefined,
          paymentStatus: "paid",
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, transactionId));

      await db
        .update(bookings)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(bookings.id, bookingId));

      console.log(
        `[Webhook] Booking ${bookingId} paid → in_progress | ` +
        `PI: ${piId} | charge: ${stripeChargeId} | fee: ${stripeApplicationFeeId} | transfer: ${stripeTransferId}`,
      );
      break;
    }

    // ── C) payment_intent.succeeded: save chargeId as backup ─────────────────

    case "payment_intent.succeeded": {
      const pi = data as Stripe.PaymentIntent;
      const { bookingId, transactionId } = pi.metadata || {};
      if (!bookingId || !transactionId) break;

      // Extract charge ID from latest_charge (may be expanded or an ID string)
      let stripeChargeId: string | undefined;
      if (pi.latest_charge) {
        stripeChargeId =
          typeof pi.latest_charge === "string"
            ? pi.latest_charge
            : (pi.latest_charge as Stripe.Charge).id;
      }

      await db
        .update(transactions)
        .set({
          stripePaymentIntentId: pi.id,
          ...(stripeChargeId ? { stripeChargeId } : {}),
          paymentStatus: "paid",
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, transactionId));

      // Only update booking if it's not already in_progress (idempotent)
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (booking && booking.status === "payment_pending") {
        await db
          .update(bookings)
          .set({ status: "in_progress", updatedAt: new Date() })
          .where(eq(bookings.id, bookingId));
      }

      console.log(`[Webhook] PaymentIntent ${pi.id} succeeded | booking: ${bookingId} | charge: ${stripeChargeId}`);
      break;
    }

    // ── Payment failed — driver can retry ────────────────────────────────────

    case "payment_intent.payment_failed": {
      const pi = data as Stripe.PaymentIntent;
      const { bookingId, transactionId } = pi.metadata || {};
      if (!bookingId || !transactionId) break;

      await db
        .update(transactions)
        .set({ paymentStatus: "failed", updatedAt: new Date() })
        .where(eq(transactions.id, transactionId));

      console.log(`[Webhook] Payment failed for booking ${bookingId}`);
      break;
    }

    // ── Charge refunded ───────────────────────────────────────────────────────

    case "charge.refunded": {
      const charge = data as Stripe.Charge;

      // Find transaction by chargeId first, fallback to paymentIntent
      let tx: typeof transactions.$inferSelect | undefined;

      if (charge.id) {
        const [found] = await db
          .select()
          .from(transactions)
          .where(eq(transactions.stripeChargeId, charge.id));
        tx = found;
      }

      if (!tx && charge.payment_intent) {
        const piId = typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : (charge.payment_intent as Stripe.PaymentIntent).id;
        const [found] = await db
          .select()
          .from(transactions)
          .where(eq(transactions.stripePaymentIntentId, piId));
        tx = found;
      }

      if (tx) {
        const newStatus = charge.refunded ? "refunded" : "partially_refunded";
        await db
          .update(transactions)
          .set({
            stripeChargeId: charge.id,
            paymentStatus: newStatus as any,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, tx.id));

        if (charge.refunded) {
          await db
            .update(bookings)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(eq(bookings.id, tx.bookingId));
        }
        console.log(`[Webhook] Charge ${charge.id} refunded → booking ${tx.bookingId}`);
      } else {
        console.warn(`[Webhook] charge.refunded: no transaction found for charge ${charge.id}`);
      }
      break;
    }

    // ── D) Dispute created — lookup by chargeId with fallback to paymentIntent ─

    case "charge.dispute.created": {
      const dispute = data as Stripe.Dispute;
      const chargeId = typeof dispute.charge === "string"
        ? dispute.charge
        : (dispute.charge as Stripe.Charge)?.id;

      let tx: typeof transactions.$inferSelect | undefined;

      // Primary: look up by charge ID
      if (chargeId) {
        const [found] = await db
          .select()
          .from(transactions)
          .where(eq(transactions.stripeChargeId, chargeId));
        tx = found;
      }

      // Fallback: retrieve the charge to get the payment intent, then look up
      if (!tx && chargeId) {
        try {
          const charge = await stripe.charges.retrieve(chargeId);
          const piId = typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : (charge.payment_intent as Stripe.PaymentIntent)?.id;
          if (piId) {
            const [found] = await db
              .select()
              .from(transactions)
              .where(eq(transactions.stripePaymentIntentId, piId));
            tx = found;
          }
        } catch (err: any) {
          console.warn(`[Webhook] Could not retrieve charge ${chargeId} for dispute: ${err.message}`);
        }
      }

      if (tx) {
        await db
          .update(transactions)
          .set({ paymentStatus: "disputed", updatedAt: new Date() })
          .where(eq(transactions.id, tx.id));

        await db
          .update(bookings)
          .set({ status: "disputed", updatedAt: new Date() })
          .where(eq(bookings.id, tx.bookingId));

        console.log(`[Webhook] Dispute on charge ${chargeId} → booking ${tx.bookingId} → disputed`);
      } else {
        console.warn(`[Webhook] charge.dispute.created: no transaction found for charge ${chargeId}`);
      }
      break;
    }

    // ── Connected account updated — sync creator Stripe flags ─────────────────

    case "account.updated": {
      const account = data as Stripe.Account;
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.stripeAccountId, account.id));

      if (user) {
        await db
          .update(users)
          .set({
            stripeChargesEnabled: account.charges_enabled ?? false,
            stripePayoutsEnabled: account.payouts_enabled ?? false,
            stripeDetailsSubmitted: account.details_submitted ?? false,
          })
          .where(eq(users.id, user.id));
        console.log(`[Webhook] account.updated ${account.id} → user ${user.id}`);
      }
      break;
    }

    default:
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
  }
}
