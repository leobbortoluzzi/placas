import { getOrProvisionTag } from "./supabase";
import {
  DEFAULT_SERIAL_PATTERN,
  extractSerial,
  isIgnoredPath,
  isValidSerial,
  normalizeSerial,
} from "./validate";

function redirect(to: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: to,
      "Cache-Control": "no-store",
    },
  });
}

function safeDestination(link: string | null | undefined, fallback: string): string {
  if (!link) return fallback;
  const trimmed = link.trim();
  if (!trimmed) return fallback;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const fallback = env.FALLBACK_URL || "https://luzzi.dev";

    // Missing secrets → still redirect (plate must not "die")
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return redirect(fallback);
    }

    const raw = extractSerial(request.url);
    if (!raw || isIgnoredPath(raw)) {
      return redirect(fallback);
    }

    const serial = normalizeSerial(raw);
    if (!isValidSerial(serial, env.TAG_ID_PATTERN || DEFAULT_SERIAL_PATTERN)) {
      return redirect(fallback);
    }

    try {
      const tag = await getOrProvisionTag(env, serial);
      return redirect(safeDestination(tag.link, fallback));
    } catch (err) {
      console.error("tag-redirect error", {
        serial,
        error: err instanceof Error ? err.message : String(err),
      });
      return redirect(fallback);
    }
  },
} satisfies ExportedHandler<Env>;
