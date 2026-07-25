const { execSync } = require("node:child_process");

/**
 * Production (Vercel VERCEL_ENV=production, i.e. the `main` branch) always
 * migrates before building, so Railway's database never drifts from the
 * schema being deployed. Preview deployments (feature branches) have no
 * database of their own in this project, so migrating there would either
 * fail outright (no DATABASE_URL) or, worse, run real migrations against
 * production if someone ever points a Preview env at the same database —
 * skip migration there and just build. A local/CI build with DATABASE_URL
 * set (and no VERCEL_ENV) still migrates, preserving `npm run build`'s
 * original behavior outside Vercel.
 */
const isVercel = Boolean(process.env.VERCEL_ENV);
const shouldMigrate = isVercel ? process.env.VERCEL_ENV === "production" : Boolean(process.env.DATABASE_URL);

if (shouldMigrate) {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log(`Skipping "prisma migrate deploy" (${isVercel ? `VERCEL_ENV=${process.env.VERCEL_ENV}` : "no DATABASE_URL"}) — building without migrating.`);
}

execSync("npx next build", { stdio: "inherit" });
