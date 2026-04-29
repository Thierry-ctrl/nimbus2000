import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  uuid,
  pgEnum,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

export const genderEnum = pgEnum("gender", [
  "female",
  "male",
  "other",
  "prefer_not_to_say",
]);

export const roleEnum = pgEnum("role", ["rider", "driver", "both"]);

export const accountStatusEnum = pgEnum("account_status", [
  "pending",
  "verified",
  "suspended",
]);

export const tripStatusEnum = pgEnum("trip_status", [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

export const requestStatusEnum = pgEnum("request_status", [
  "pending",
  "approved",
  "declined",
  "cancelled",
  "completed",
]);

export const fuelTypeEnum = pgEnum("fuel_type", ["petrol", "diesel"]);

export const reportStatusEnum = pgEnum("report_status", [
  "open",
  "reviewing",
  "resolved",
  "dismissed",
]);

export const languageEnum = pgEnum("language", ["en", "fr", "rw"]);

export const neighborhoods = pgTable("neighborhoods", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sector: text("sector"),
});

export const corridors = pgTable(
  "corridors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    originId: uuid("origin_id")
      .notNull()
      .references(() => neighborhoods.id),
    destinationId: uuid("destination_id")
      .notNull()
      .references(() => neighborhoods.id),
    distanceKm: numeric("distance_km", { precision: 6, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex("corridors_pair_idx").on(t.originId, t.destinationId)],
);

export const inviteCodes = pgTable("invite_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  maxUses: integer("max_uses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  fullName: text("full_name").notNull(),
  gender: genderEnum("gender").notNull(),
  role: roleEnum("role").notNull(),
  neighborhoodId: uuid("neighborhood_id")
    .notNull()
    .references(() => neighborhoods.id),
  homePickupPoint: text("home_pickup_point"),
  employer: text("employer"),
  phone: text("phone"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  status: accountStatusEnum("status").notNull().default("pending"),
  avatarUrl: text("avatar_url"),
  inviteCodeId: uuid("invite_code_id").references(() => inviteCodes.id),
  idVerified: boolean("id_verified").notNull().default(false),
  preferredLanguage: languageEnum("preferred_language").notNull().default("en"),
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  blockedReason: text("blocked_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => profiles.userId, { onDelete: "cascade" }),
  make: text("make").notNull(),
  model: text("model").notNull(),
  color: text("color").notNull(),
  plate: text("plate").notNull(),
  seats: integer("seats").notNull(),
  photoUrl: text("photo_url"),
  nationalId: text("national_id"),
  fuelType: fuelTypeEnum("fuel_type").notNull().default("petrol"),
  consumptionLPer100Km: numeric("consumption_l_per_100km", {
    precision: 4,
    scale: 1,
  }),
});

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: text("driver_id")
      .notNull()
      .references(() => profiles.userId),
    originId: uuid("origin_id")
      .notNull()
      .references(() => neighborhoods.id),
    destinationId: uuid("destination_id")
      .notNull()
      .references(() => neighborhoods.id),
    departureDate: date("departure_date").notNull(),
    departureTime: text("departure_time").notNull(),
    windowEndTime: text("window_end_time"),
    pickupPoint: text("pickup_point"),
    flexMinutes: integer("flex_minutes").notNull().default(10),
    seatsTotal: integer("seats_total").notNull(),
    seatsRemaining: integer("seats_remaining").notNull(),
    sameGenderOnly: boolean("same_gender_only").notNull().default(false),
    notes: text("notes"),
    status: tripStatusEnum("status").notNull().default("scheduled"),
    cancelReason: text("cancel_reason"),
    recurringId: uuid("recurring_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("trips_match_idx").on(t.departureDate, t.originId, t.destinationId),
    index("trips_driver_idx").on(t.driverId),
  ],
);

export const recurringTrips = pgTable("recurring_trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: text("driver_id")
    .notNull()
    .references(() => profiles.userId),
  originId: uuid("origin_id")
    .notNull()
    .references(() => neighborhoods.id),
  destinationId: uuid("destination_id")
    .notNull()
    .references(() => neighborhoods.id),
  daysOfWeek: integer("days_of_week").array().notNull(),
  departureTime: text("departure_time").notNull(),
  flexMinutes: integer("flex_minutes").notNull().default(10),
  seats: integer("seats").notNull(),
  sameGenderOnly: boolean("same_gender_only").notNull().default(false),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rideRequests = pgTable(
  "ride_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    riderId: text("rider_id")
      .notNull()
      .references(() => profiles.userId),
    pickupPoint: text("pickup_point"),
    notes: text("notes"),
    status: requestStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ride_requests_unique_idx").on(t.tripId, t.riderId),
    index("ride_requests_rider_idx").on(t.riderId),
  ],
);

export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => profiles.userId),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => profiles.userId),
    stars: integer("stars").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ratings_unique_idx").on(t.tripId, t.fromUserId, t.toUserId),
    index("ratings_to_user_idx").on(t.toUserId),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.userId),
  ],
);

export const userReports = pgTable(
  "user_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => profiles.userId),
    reportedUserId: text("reported_user_id")
      .notNull()
      .references(() => profiles.userId),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    details: text("details"),
    status: reportStatusEnum("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: text("resolved_by_user_id"),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("user_reports_status_idx").on(t.status),
    index("user_reports_reported_idx").on(t.reportedUserId),
  ],
);

export const ratingDismissals = pgTable(
  "rating_dismissals",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tripId] })],
);

export const config = pgTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type RideRequest = typeof rideRequests.$inferSelect;
export type Rating = typeof ratings.$inferSelect;
export type Neighborhood = typeof neighborhoods.$inferSelect;
export type Corridor = typeof corridors.$inferSelect;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type RecurringTrip = typeof recurringTrips.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type UserReport = typeof userReports.$inferSelect;
export type RatingDismissal = typeof ratingDismissals.$inferSelect;
