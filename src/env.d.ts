/** Bindings available on the Worker. Keep in sync with wrangler.jsonc + secrets. */
interface Env {
  FALLBACK_URL: string;
  DEFAULT_BUSINESS: string;
  /** JS regex source, e.g. ^\\d{4}$ */
  TAG_ID_PATTERN: string;
  /** Public project URL configured in wrangler.jsonc. */
  SUPABASE_URL: string;
  /** Set via `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` — never expose to clients */
  SUPABASE_SERVICE_ROLE_KEY: string;
}
