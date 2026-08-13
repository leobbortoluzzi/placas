/**
 * Public tag URL:
 *   https://tag.luzzi.dev/t/{nfc_uid}
 *
 * The `/t/` prefix stops random bot probes (`/wp-json`, `/wp-admin`, …)
 * from being treated as a serial. The serial itself must look like an
 * NFC UID (hex), not an arbitrary word.
 */

const PREFIX = "t";

/** Typical NFC UIDs: 4 / 7 / 8 / 10 bytes → 8–20 hex chars. */
const DEFAULT_SERIAL_PATTERN = "^[0-9A-Fa-f]{8,20}$";

/**
 * Pull the NFC serial from the path.
 * Only `/t/{serial}` (and extra ignored segments after) is accepted.
 */
export function extractSerial(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  if ((segments[0] ?? "").toLowerCase() !== PREFIX) return null;
  return decodeURIComponent(segments[1] ?? "");
}

/** Known scanner / bot paths — never persist, even if they sneak past. */
const IGNORED = new Set([
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  ".well-known",
  "wp-json",
  "wp-admin",
  "wp-login.php",
  "xmlrpc.php",
  "wordpress",
  ".env",
  "admin",
  "api",
  "graphql",
]);

export function isIgnoredPath(serial: string): boolean {
  return IGNORED.has(serial.toLowerCase());
}

/**
 * Canonical form stored in `serial_number`: uppercase hex, no separators.
 * `FF:0F:16:FD:7E:01:00` → `FF0F16FD7E0100`
 */
export function normalizeSerial(serial: string): string {
  return serial.replace(/[:\-\s]/g, "").toUpperCase();
}

/**
 * Validate NFC serial against env pattern (after normalize).
 * Invalid serials redirect to fallback without writing to DB.
 */
export function isValidSerial(serial: string, patternSource: string): boolean {
  if (!serial || serial.length > 32) return false;
  try {
    const re = new RegExp(patternSource || DEFAULT_SERIAL_PATTERN);
    return re.test(serial);
  } catch {
    return false;
  }
}

export { DEFAULT_SERIAL_PATTERN, PREFIX as TAG_PATH_PREFIX };
