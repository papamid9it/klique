import "server-only";
import { randomBytes } from "node:crypto";
import { unzipSync } from "fflate";
import { r2Config } from "../env";
import { ApiError } from "../http/errors";
import { putObject } from "./r2";

/**
 * A profile effect's file, checked here before it's stored (a site admin uploads it through the server, not
 * straight to R2): a Lottie JSON, minified (whitespace out, numbers to 3 decimals), or a dotLottie (.lottie: a zip
 * holding manifest.json and animations/*.json, plus any images), kept exactly as it is.
 */

export const EFFECT_MAX_BYTES = 8 * 1024 * 1024;
/** what a .lottie may unzip to, all files together (a zip bomb stops here) */
const UNZIPPED_CAP = 20 * 1024 * 1024;
const IMAGE_RX = /^images\/[^/]+\.(png|jpe?g|webp|gif)$/i;
const ALLOWED_RX = /^(manifest\.json|animations\/[^/]+\.json|images\/[^/]+|themes\/[^/]+\.json|states\/[^/]+\.json)$/i;

const bad = (message: string) => new ApiError(422, message, { code: "invalid_file" });

/** The bones of a Lottie: frame rate, in and out points, size and layers. */
function assertLottie(data: unknown, where = "That file") {
  const d = data as { fr?: unknown; ip?: unknown; op?: unknown; w?: unknown; h?: unknown; layers?: unknown };
  const ok = !!d && typeof d === "object" && [d.fr, d.ip, d.op, d.w, d.h].every((n) => typeof n === "number" && Number.isFinite(n)) && Array.isArray(d.layers) && (d.op as number) > (d.ip as number);
  if (!ok) throw bad(`${where} isn't a Lottie animation.`);
}

function parseJson(bytes: Uint8Array, where: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw bad(`${where} isn't valid JSON.`);
  }
}

/** Whitespace out and every fraction to 3 decimals (plenty for positions and colours, much smaller). */
const minify = (data: unknown) => JSON.stringify(data, (_k, v: unknown) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v));

function checkDotLottie(bytes: Uint8Array) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw bad("That .lottie file isn't a dotLottie (it should be a zip).");
  let declared = 0;
  let files: Record<string, Uint8Array>;
  try {
    // each file inflates into a buffer of its declared size, so the declared total bounds the memory used
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith("/")) return false; // folders
        if (!ALLOWED_RX.test(f.name)) throw bad(`That .lottie holds something it shouldn't (${f.name.slice(0, 60)}).`);
        declared += f.originalSize;
        if (declared > UNZIPPED_CAP) throw bad("That .lottie unpacks to more than 20 MB.");
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw bad("That .lottie file is damaged.");
  }
  if (!files["manifest.json"]) throw bad("That .lottie has no manifest.json.");
  parseJson(files["manifest.json"], "Its manifest.json");
  const animations = Object.keys(files).filter((n) => /^animations\/[^/]+\.json$/i.test(n));
  if (!animations.length) throw bad("That .lottie has no animation in it (animations/*.json).");
  for (const n of animations) assertLottie(parseJson(files[n], n), n);
  for (const n of Object.keys(files)) if (n.startsWith("images/") && !IMAGE_RX.test(n)) throw bad(`Images in a .lottie must be PNG, JPEG, WebP or GIF (${n.slice(0, 60)}).`);
}

/** Check an uploaded effect file: what to store (JSON minified, a .lottie as it is) and its extension. */
export function prepareEffectFile(name: string, bytes: Uint8Array): { body: Uint8Array; ext: "json" | "lottie" } {
  if (!bytes.length) throw bad("That file is empty.");
  if (bytes.length > EFFECT_MAX_BYTES) throw new ApiError(413, "Profile effects can be up to 8 MB.", { code: "too_large" });
  let body: Uint8Array;
  let ext: "json" | "lottie";
  if (/\.lottie$/i.test(name)) {
    checkDotLottie(bytes);
    body = bytes;
    ext = "lottie";
  } else if (/\.json$/i.test(name)) {
    const data = parseJson(bytes, "That file");
    assertLottie(data);
    body = new TextEncoder().encode(minify(data));
    ext = "json";
  } else {
    throw bad("Upload a Lottie: a .lottie or .json file.");
  }
  return { body, ext };
}

/** Check (and for JSON, minify) an uploaded effect file, then store it. The sizes show in the admin form. */
export async function storeEffectFile(name: string, bytes: Uint8Array): Promise<{ url: string; before: number; after: number }> {
  if (!r2Config()) throw new ApiError(503, "Uploads aren't set up yet. Paste a link to the file instead.", { code: "uploads_not_configured" });
  const { body, ext } = prepareEffectFile(name, bytes);
  const key = `klique/effects/${new Date().toISOString().slice(0, 7)}/${randomBytes(12).toString("base64url")}.${ext}`;
  const url = await putObject(key, body, ext === "json" ? "application/json" : "application/zip");
  return { url, before: bytes.length, after: body.length };
}
