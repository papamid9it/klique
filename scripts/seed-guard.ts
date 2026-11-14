/**
 * Refuses to let a seed script write to what looks like a production database.
 *
 * Allowed when ANY of these is true:
 *   - the host is localhost / 127.0.0.1 / ::1
 *   - the database name written in the URI path contains "dev", "test" or "local", and isn't one of the
 *     production names below (only an explicit name counts: a URI with no path falls back to Mongo's default
 *     "test" database, which is exactly where a production app without a path writes)
 *   - ALLOW_SEED=1 is set
 * `--reset` (wipes collections) is additionally refused whenever NODE_ENV=production,
 * even with ALLOW_SEED=1.
 */
/**
 * The live site's database names: "test" (the original one) and "data" (after the move, Nov 2026). Both count as
 * production everywhere (seed guard, wipe and test-content scripts) so the guards hold during and after the move.
 */
export const PRODUCTION_DB_NAMES = ["test", "data"] as const;
export const isProductionDb = (name: string | undefined | null) => !!name && (PRODUCTION_DB_NAMES as readonly string[]).includes(name.trim().toLowerCase());

export function assertSafeSeedTarget(uri: string, opts: { reset?: boolean } = {}) {
  if (opts.reset && process.env.NODE_ENV === "production") {
    fail("NODE_ENV is production, so a reset (which deletes every klique collection) is never allowed.");
  }

  let hosts: string[] = [];
  let dbName = "";
  try {
    // Swap the scheme so URL can parse it; multi-host URIs keep only the first host in .hostname,
    // so read the raw authority instead.
    const rest = uri.replace(/^mongodb(\+srv)?:\/\//, "");
    const authority = rest.split("/")[0].split("?")[0];
    const hostPart = authority.includes("@") ? authority.slice(authority.lastIndexOf("@") + 1) : authority;
    hosts = hostPart.split(",").map((h) => h.replace(/^\[|\](:\d+)?$/g, "").replace(/:\d+$/, "").toLowerCase());
    const path = rest.includes("/") ? rest.slice(rest.indexOf("/") + 1) : "";
    dbName = decodeURIComponent(path.split("?")[0]).trim();
  } catch {
    fail("Couldn't read MONGODB_URI.");
  }

  const local = hosts.length > 0 && hosts.every((h) => h === "localhost" || h === "127.0.0.1" || h === "::1");
  const devName = /dev|test|local/i.test(dbName) && !isProductionDb(dbName);
  const override = process.env.ALLOW_SEED === "1";

  if (local || devName || override) return;

  fail(
    `MONGODB_URI points at ${hosts.join(",") || "an unknown host"} / database "${dbName || "(none given, Mongo default)"}", which looks like production.`,
  );
}

function fail(reason: string): never {
  console.error(`\nRefusing to seed: ${reason}

The seed creates demo accounts with a shared, publicly known password, and seed:reset deletes data.
Point it at a development database instead, e.g. in .env.local:

  MONGODB_URI=mongodb://127.0.0.1:27017/klique-dev                      # local mongod
  MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/klique-dev?...       # a separate Atlas dev database

(Keep the production URI in Vercel; it doesn't need to be in .env.local for local dev.)
If you're certain this database is safe to fill with demo data, run with ALLOW_SEED=1.
`);
  process.exit(1);
}
