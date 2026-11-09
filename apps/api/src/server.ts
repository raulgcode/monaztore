import { createDatabase } from "@monaztore/db";
import { createMailer } from "@monaztore/email";
import { deriveSecret, getServerEnv } from "@monaztore/env";
import { buildApp } from "./app";
import { scheduleEinvoiceDelivery } from "./jobs/einvoices";
import { scheduleRateLimitCleanup } from "./jobs/rate-limits";

const env = getServerEnv();
const port = Number(process.env.PORT ?? 3001);
const connection = createDatabase(env.DATABASE_URL);

const mailer = createMailer(env);
const app = await buildApp({
  db: connection.db,
  appUrl: env.APP_URL,
  apiUrl: env.API_URL,
  mailer,
  clientIpHeader: env.CLIENT_IP_HEADER,
  logger: env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : true,
});

// Scheduled jobs live in this process (one machine on Fly, see fly.api.toml). Each returns its stop.
const stops = [
  scheduleRateLimitCleanup({ db: connection.db, log: app.log }),
  // Costa Rica's electronic invoices: sign, send to Hacienda, read its answer, email the buyer.
  scheduleEinvoiceDelivery({
    db: connection.db,
    log: app.log,
    mailer,
    sealKey: deriveSecret(env.BETTER_AUTH_SECRET, "einvoicing"),
    providerId: env.HACIENDA_PROVIDER_ID,
  }),
];

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    for (const stop of stops) stop();
    await app.close();
    await connection.close();
    process.exit(0);
  });
}

await app.listen({ port, host: "0.0.0.0" });
