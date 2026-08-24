import {
  activateTag,
  getOrProvisionTag,
  getTag,
  getTagByCode,
  updateTag,
  type TagUpdate,
} from "./supabase";
import {
  renderErrorPage,
  renderManagePage,
  renderPendingPage,
  renderSuccessPage,
  type FormValues,
} from "./html";
import {
  DEFAULT_SERIAL_PATTERN,
  extractSerial,
  isIgnoredPath,
  isValidSerial,
  normalizeSerial,
} from "./validate";
import type { TagRow } from "./types";

const MAX_FORM_BYTES = 8_192;
const MAX_LINK_LENGTH = 2_048;
const MAX_BUSINESS_LENGTH = 120;
const MAX_PLATFORM_LENGTH = 40;

class FormError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status = 400,
  ) {
    super(message);
    this.status = status;
  }
}

function redirect(to: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: to,
      "Cache-Control": "no-store",
    },
  });
}

function methodNotAllowed(allow: string): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: allow },
  });
}

function hasSupabaseConfig(env: Env): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

function isPending(tag: TagRow): boolean {
  return !tag.link || !tag.link.trim();
}

function parseDestination(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LINK_LENGTH) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeDestination(link: string | null | undefined, fallback: string): string {
  return parseDestination(link ?? "") ?? fallback;
}

function normalizeCode(code: string): string {
  return code.trim().toLowerCase();
}

function normalizePassword(password: string): string {
  return password.trim();
}

/** Constant-time comparison for short credential strings in the Worker runtime. */
function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index++) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

function credentialsMatch(
  tag: TagRow,
  code: string,
  password: string,
): boolean {
  if (!tag.code || !tag.password) return false;
  return (
    timingSafeEqual(tag.code, normalizeCode(code)) &&
    timingSafeEqual(tag.password, normalizePassword(password))
  );
}

function formValue(values: FormValues, key: keyof FormValues): string {
  return values[key] ?? "";
}

async function readForm(request: Request): Promise<FormValues> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "application/x-www-form-urlencoded") {
    throw new FormError("Envie o formulário no formato esperado.", 415);
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_FORM_BYTES) {
    throw new FormError("O formulário enviado é muito grande.", 413);
  }

  const params = new URLSearchParams(body);
  return {
    code: params.get("code") ?? "",
    password: params.get("password") ?? "",
    link: params.get("link") ?? "",
    business: params.get("business") ?? "",
    platform: params.get("platform") ?? "",
  };
}

function metadataPatch(
  values: FormValues,
  tag: TagRow,
  defaultBusiness: string,
): Pick<TagUpdate, "business" | "platform"> {
  const business = formValue(values, "business").trim();
  const platform = formValue(values, "platform").trim();

  if (business.length > MAX_BUSINESS_LENGTH) {
    throw new FormError("O nome do negócio deve ter no máximo 120 caracteres.");
  }
  if (platform.length > MAX_PLATFORM_LENGTH) {
    throw new FormError("A plataforma deve ter no máximo 40 caracteres.");
  }

  return {
    business: business || tag.business || defaultBusiness,
    platform: platform || null,
  };
}

function buildPatch(
  values: FormValues,
  tag: TagRow,
  defaultBusiness: string,
  includeSaleAt: boolean,
): TagUpdate {
  const link = parseDestination(formValue(values, "link"));
  if (!link) {
    throw new FormError("Informe um link válido começando com http:// ou https://.");
  }

  const patch: TagUpdate = {
    link,
    ...metadataPatch(values, tag, defaultBusiness),
  };
  if (includeSaleAt) patch.sale_at = new Date().toISOString();
  return patch;
}

function logError(context: string, error: unknown, serial?: string): void {
  console.error(context, {
    ...(serial ? { serial } : {}),
    error: error instanceof Error ? error.message : String(error),
  });
}

async function handleManage(
  request: Request,
  env: Env,
  fallback: string,
  headOnly: boolean,
): Promise<Response> {
  if (request.method === "GET" || request.method === "HEAD") {
    return renderManagePage(undefined, {}, headOnly);
  }
  if (request.method !== "POST") {
    return methodNotAllowed("GET, HEAD, POST");
  }
  if (!hasSupabaseConfig(env)) {
    return renderErrorPage(
      "Serviço indisponível",
      "A configuração da tag está temporariamente indisponível. Tente novamente mais tarde.",
      503,
    );
  }

  let values: FormValues;
  try {
    values = await readForm(request);
  } catch (error) {
    if (error instanceof FormError) {
      return renderManagePage(error.message, {}, false);
    }
    throw error;
  }

  const code = normalizeCode(formValue(values, "code"));
  const password = normalizePassword(formValue(values, "password"));
  if (!code || !password) {
    return renderManagePage("Informe o código e a senha da tag.", values);
  }

  try {
    const tag = await getTagByCode(env, code);
    if (!tag || !credentialsMatch(tag, code, password)) {
      return renderManagePage("Código ou senha inválidos.", values);
    }

    const patch = buildPatch(values, tag, env.DEFAULT_BUSINESS, false);
    const updated = await updateTag(env, tag.serial_number, patch);
    if (!updated) {
      return renderManagePage("Não foi possível atualizar esta tag.", values);
    }

    return renderSuccessPage(
      safeDestination(updated.link, fallback),
      "O destino da tag foi atualizado.",
    );
  } catch (error) {
    if (error instanceof FormError) {
      return renderManagePage(error.message, values);
    }
    logError("tag-redirect manage error", error);
    return renderErrorPage(
      "Não foi possível salvar",
      "Tente novamente em alguns instantes.",
      503,
    );
  }
}

async function handleTag(
  request: Request,
  env: Env,
  serial: string,
  fallback: string,
  headOnly: boolean,
): Promise<Response> {
  let tag: TagRow | null;
  try {
    tag = request.method === "POST"
      ? await getTag(env, serial)
      : await getOrProvisionTag(env, serial);
  } catch (error) {
    logError("tag-redirect error", error, serial);
    if (request.method === "POST") {
      return renderErrorPage(
        "Não foi possível carregar a tag",
        "Tente novamente em alguns instantes.",
        503,
      );
    }
    return redirect(fallback);
  }

  if (!tag) {
    return renderErrorPage(
      "Tag não encontrada",
      "Abra a tag uma vez antes de enviar o formulário de ativação.",
      404,
      headOnly,
    );
  }

  if (request.method === "GET" || request.method === "HEAD") {
    if (isPending(tag)) return renderPendingPage(tag, serial, undefined, {}, headOnly);
    return redirect(safeDestination(tag.link, fallback));
  }

  if (request.method !== "POST") {
    return methodNotAllowed("GET, HEAD, POST");
  }

  if (!isPending(tag)) {
    return renderErrorPage(
      "Tag já ativada",
      "Use a página /manage para alterar o destino desta tag.",
      409,
    );
  }

  let values: FormValues;
  try {
    values = await readForm(request);
  } catch (error) {
    if (error instanceof FormError) {
      return renderPendingPage(tag, serial, error.message, {}, false);
    }
    throw error;
  }

  const code = normalizeCode(formValue(values, "code"));
  const password = normalizePassword(formValue(values, "password"));
  if (!credentialsMatch(tag, code, password)) {
    return renderPendingPage(tag, serial, "Código ou senha inválidos.", values);
  }

  try {
    const patch = buildPatch(values, tag, env.DEFAULT_BUSINESS, true);
    const updated = await activateTag(env, serial, tag.link, patch);
    if (!updated) {
      return renderErrorPage(
        "Tag já ativada",
        "Esta tag foi configurada por outra solicitação. Use /manage para alterá-la.",
        409,
      );
    }

    return renderSuccessPage(
      safeDestination(updated.link, fallback),
      "A tag foi ativada com sucesso.",
    );
  } catch (error) {
    if (error instanceof FormError) {
      return renderPendingPage(tag, serial, error.message, values);
    }
    logError("tag-redirect activation error", error, serial);
    return renderErrorPage(
      "Não foi possível salvar",
      "Tente novamente em alguns instantes.",
      503,
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const fallback = env.FALLBACK_URL || "https://luzzi.dev";
    const headOnly = request.method === "HEAD";
    const isManagePath = url.pathname === "/manage" || url.pathname === "/manage/";

    if (isManagePath) {
      return handleManage(request, env, fallback, headOnly);
    }

    if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "POST") {
      return methodNotAllowed("GET, HEAD, POST");
    }

    // Missing secrets → public tag scans still redirect instead of failing.
    if (!hasSupabaseConfig(env)) {
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

    return handleTag(request, env, serial, fallback, headOnly);
  },
} satisfies ExportedHandler<Env>;
