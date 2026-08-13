/**
 * Extract the NFC serial from the URL path.
 * https://tag.luzzi.dev/04A1B2C3D4E5F6 → "04A1B2C3D4E5F6"
 * Extra path segments after the serial are ignored.
 */
export function extractSerial(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  return decodeURIComponent(segments[0] ?? "");
}

/** Paths that must never hit the database. */
const IGNORED = new Set([
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  ".well-known",
]);

export function isIgnoredPath(serial: string): boolean {
  return IGNORED.has(serial.toLowerCase());
}

/**
 * Validate NFC serial against env pattern.
 * Default accepts hex/alphanumeric UIDs (4–64 chars).
 * Invalid serials redirect to fallback without writing to DB.
 */
export function isValidSerial(serial: string, patternSource: string): boolean {
  if (!serial || serial.length > 128) return false;
  try {
    const re = new RegExp(patternSource);
    return re.test(serial);
  } catch {
    return false;
  }
}
