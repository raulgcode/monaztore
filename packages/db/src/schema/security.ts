import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Platform protection, not workspace data: no organization_id here.

/**
 * How many times a key (an IP, an email, an API key) asked for something in the current
 * window. Shared by every server, so the limit holds however many machines are running.
 */
export const rateLimit = pgTable(
  "rate_limit",
  {
    key: text().primaryKey(),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    count: integer().notNull(),
  },
  (table) => [index("rate_limit_window_idx").on(table.windowStart)],
);
