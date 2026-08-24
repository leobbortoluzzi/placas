import { generateCode, generatePassword } from "./random";
import type { TagRow } from "./types";

const SELECT_COLS =
  "serial_number,business,code,write_at,sale_at,link,platform,password";

export interface TagUpdate {
  link: string;
  business: string | null;
  platform: string | null;
  sale_at?: string;
}

function restHeaders(env: Env, prefer?: string): HeadersInit {
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

function baseUrl(env: Env): string {
  return env.SUPABASE_URL.replace(/\/$/, "");
}

/** SELECT by primary key serial_number. */
export async function getTag(
  env: Env,
  serial: string,
): Promise<TagRow | null> {
  const url =
    `${baseUrl(env)}/rest/v1/tag` +
    `?serial_number=eq.${encodeURIComponent(serial)}` +
    `&select=${SELECT_COLS}`;

  const res = await fetch(url, {
    method: "GET",
    headers: restHeaders(env),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase getTag failed: ${res.status} ${body}`);
  }

  const rows = (await res.json()) as TagRow[];
  return rows[0] ?? null;
}

/** SELECT by the unique human-facing code. */
export async function getTagByCode(
  env: Env,
  code: string,
): Promise<TagRow | null> {
  const url =
    `${baseUrl(env)}/rest/v1/tag` +
    `?code=eq.${encodeURIComponent(code)}` +
    `&select=${SELECT_COLS}`;

  const res = await fetch(url, {
    method: "GET",
    headers: restHeaders(env),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase getTagByCode failed: ${res.status} ${body}`);
  }

  const rows = (await res.json()) as TagRow[];
  return rows[0] ?? null;
}

async function insertTag(
  env: Env,
  payload: {
    serial_number: string;
    business: string;
    link: string | null;
    code: string;
    password: string;
  },
): Promise<{ ok: true; row: TagRow | null } | { ok: false; status: number; body: string }> {
  const res = await fetch(`${baseUrl(env)}/rest/v1/tag`, {
    method: "POST",
    headers: restHeaders(
      env,
      "return=representation,resolution=ignore-duplicates",
    ),
    body: JSON.stringify(payload),
  });

  if (res.status === 201 || res.status === 200) {
    const rows = (await res.json()) as TagRow[];
    return { ok: true, row: rows[0] ?? null };
  }

  const body = await res.text();
  return { ok: false, status: res.status, body };
}

async function patchTag(
  env: Env,
  filter: string,
  patch: TagUpdate,
): Promise<TagRow | null> {
  const res = await fetch(`${baseUrl(env)}/rest/v1/tag?${filter}`, {
    method: "PATCH",
    headers: restHeaders(env, "return=representation"),
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase patchTag failed: ${res.status} ${body}`);
  }

  if (res.status === 204) return null;
  const rows = (await res.json()) as TagRow[];
  return rows[0] ?? null;
}

/** Update a tag only if it is still pending with the expected link value. */
export async function activateTag(
  env: Env,
  serial: string,
  expectedLink: string | null,
  patch: TagUpdate,
): Promise<TagRow | null> {
  const linkFilter = expectedLink === null
    ? "link=is.null"
    : `link=eq.${encodeURIComponent(expectedLink)}`;
  const filter =
    `serial_number=eq.${encodeURIComponent(serial)}&${linkFilter}`;
  return patchTag(env, filter, patch);
}

/** Update an authenticated tag without changing its credentials or sale time. */
export async function updateTag(
  env: Env,
  serial: string,
  patch: TagUpdate,
): Promise<TagRow | null> {
  return patchTag(
    env,
    `serial_number=eq.${encodeURIComponent(serial)}`,
    patch,
  );
}

/**
 * Insert-if-not-exists on first scan.
 * Generates unique `code` (4 chars) + random `password` once.
 * Never overwrites an existing row (resolution=ignore-duplicates).
 */
export async function provisionTag(
  env: Env,
  serial: string,
): Promise<TagRow> {
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const payload = {
      serial_number: serial,
      business: env.DEFAULT_BUSINESS,
      link: null,
      code: generateCode(4),
      password: generatePassword(10),
    };

    const result = await insertTag(env, payload);

    if (result.ok) {
      if (result.row) return result.row;
      // Duplicate serial ignored — load existing (do not rotate code/password)
      const existing = await getTag(env, serial);
      if (existing) return existing;
      continue;
    }

    // Unique violation on code → retry with a new code
    if (result.status === 409) {
      const existing = await getTag(env, serial);
      if (existing) return existing;
      continue;
    }

    throw new Error(
      `Supabase provisionTag failed: ${result.status} ${result.body}`,
    );
  }

  throw new Error("Supabase provisionTag: exhausted code generation retries");
}

/**
 * Load tag; if missing, create with Luzzi.Dev defaults + credentials and no link.
 */
export async function getOrProvisionTag(
  env: Env,
  serial: string,
): Promise<TagRow> {
  const existing = await getTag(env, serial);
  if (existing) return existing;
  return provisionTag(env, serial);
}
