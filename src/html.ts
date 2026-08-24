import type { TagRow } from "./types";

export interface FormValues {
  code?: string;
  password?: string;
  link?: string;
  business?: string;
  platform?: string;
}

const HTML_HEADERS: HeadersInit = {
  "Content-Type": "text/html; charset=UTF-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

const STYLES = `
  :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; }
  body { margin: 0; background: #f5f7fb; color: #172033; }
  main { width: min(100% - 32px, 680px); margin: 0 auto; padding: 48px 0; }
  .card { background: #fff; border: 1px solid #e1e6ef; border-radius: 18px; box-shadow: 0 12px 32px #1b2a4a12; padding: 28px; }
  h1 { font-size: clamp(1.5rem, 4vw, 2rem); line-height: 1.15; margin: 0 0 10px; }
  h2 { font-size: 1.05rem; margin: 28px 0 12px; }
  p { line-height: 1.55; margin: 10px 0; }
  .muted { color: #5e6b82; font-size: .95rem; }
  .message { border-radius: 10px; margin: 18px 0; padding: 12px 14px; }
  .message.error { background: #fff0f0; border: 1px solid #f2b8b8; color: #8f1d1d; }
  .message.success { background: #effaf3; border: 1px solid #b7e3c2; color: #176b2d; }
  .credentials { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 20px 0; }
  .credential { background: #f7f9fc; border: 1px solid #e1e6ef; border-radius: 10px; padding: 12px; }
  .credential span { color: #5e6b82; display: block; font-size: .78rem; margin-bottom: 5px; text-transform: uppercase; letter-spacing: .04em; }
  .credential code { display: block; font-size: 1.1rem; overflow-wrap: anywhere; }
  label { display: block; font-size: .9rem; font-weight: 650; margin: 15px 0 7px; }
  input { box-sizing: border-box; border: 1px solid #bac4d4; border-radius: 9px; font: inherit; padding: 11px 12px; width: 100%; }
  input:focus { border-color: #3659c9; box-shadow: 0 0 0 3px #3659c933; outline: none; }
  input[readonly] { background: #f7f9fc; }
  button { background: #2446b8; border: 0; border-radius: 9px; color: #fff; cursor: pointer; font: inherit; font-weight: 700; margin-top: 22px; padding: 12px 17px; }
  button:hover { background: #1b3898; }
  button:disabled { background: #8994aa; cursor: not-allowed; }
  a { color: #2446b8; }
  footer { color: #718098; font-size: .82rem; margin-top: 18px; }
  @media (max-width: 520px) { main { padding: 24px 0; } .card { padding: 20px; } .credentials { grid-template-columns: 1fr; } }
`;

function escapeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function input(
  label: string,
  name: string,
  value: string | null | undefined,
  options: { type?: string; required?: boolean; readonly?: boolean; autocomplete?: string } = {},
): string {
  const type = options.type ?? "text";
  const required = options.required ? " required" : "";
  const readonly = options.readonly ? " readonly" : "";
  const autocomplete = options.autocomplete
    ? ` autocomplete="${escapeHtml(options.autocomplete)}"`
    : "";

  return `<label for="${escapeHtml(name)}">${escapeHtml(label)}</label>
    <input id="${escapeHtml(name)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}"${required}${readonly}${autocomplete}>`;
}

function page(title: string, content: string, headOnly = false): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>${STYLES}</style>
  </head>
  <body><main>${content}</main></body>
</html>`;

  return new Response(headOnly ? null : html, { headers: HTML_HEADERS });
}

function messageBlock(message: string | undefined, kind: "error" | "success"): string {
  if (!message) return "";
  return `<div class="message ${kind}" role="alert">${escapeHtml(message)}</div>`;
}

export function renderPendingPage(
  tag: TagRow,
  serial: string,
  message?: string,
  values: FormValues = {},
  headOnly = false,
): Response {
  const hasCredentials = Boolean(tag.code && tag.password);
  const action = `/t/${encodeURIComponent(serial)}`;
  const code = tag.code ?? "Indisponível";
  const password = tag.password ?? "Indisponível";

  const content = `<section class="card">
  <h1>Ative sua tag</h1>
  <p class="muted">Esta tag ainda não possui um link cadastrado. Use os dados abaixo para identificar e configurar a placa.</p>
  ${messageBlock(message, "error")}
  <div class="credentials">
    <div class="credential"><span>Código</span><code>${escapeHtml(code)}</code></div>
    <div class="credential"><span>Senha</span><code>${escapeHtml(password)}</code></div>
  </div>
  <p class="muted">Identificador NFC: <code>${escapeHtml(serial)}</code></p>
  <form method="post" action="${escapeHtml(action)}">
    ${input("Código", "code", tag.code, { readonly: true, autocomplete: "off" })}
    ${input("Senha", "password", tag.password, { readonly: true, autocomplete: "off" })}
    ${input("Link de destino", "link", values.link, { required: true, autocomplete: "url" })}
    ${input("Nome do negócio (opcional)", "business", values.business ?? tag.business ?? "")}
    ${input("Plataforma (opcional)", "platform", values.platform ?? tag.platform ?? "")}
    <button type="submit"${hasCredentials ? "" : " disabled"}>Salvar e ativar</button>
  </form>
  ${hasCredentials ? "" : '<p class="muted">As credenciais desta tag estão incompletas. Entre em contato com o administrador.</p>'}
  <footer>Depois da ativação, esta mesma tag redirecionará diretamente para o link cadastrado.</footer>
</section>`;

  return page("Ativar tag", content, headOnly);
}

export function renderManagePage(
  message?: string,
  values: FormValues = {},
  headOnly = false,
): Response {
  const content = `<section class="card">
  <h1>Gerenciar tag</h1>
  <p class="muted">Informe o código e a senha da tag para cadastrar ou alterar o destino.</p>
  ${messageBlock(message, "error")}
  <form method="post" action="/manage">
    ${input("Código", "code", values.code, { required: true, autocomplete: "off" })}
    ${input("Senha", "password", values.password, { type: "password", required: true, autocomplete: "current-password" })}
    ${input("Link de destino", "link", values.link, { required: true, autocomplete: "url" })}
    ${input("Nome do negócio (opcional)", "business", values.business)}
    ${input("Plataforma (opcional)", "platform", values.platform)}
    <button type="submit">Salvar alterações</button>
  </form>
  <footer>O código e a senha identificam e protegem a tag. Não compartilhe esses dados publicamente.</footer>
</section>`;

  return page("Gerenciar tag", content, headOnly);
}

export function renderSuccessPage(
  destination: string,
  message: string,
  headOnly = false,
): Response {
  const safeDestination = escapeHtml(destination);
  const content = `<meta http-equiv="refresh" content="3;url=${safeDestination}">
<section class="card">
  <h1>Tag atualizada</h1>
  <div class="message success" role="status">${escapeHtml(message)}</div>
  <p>Você será encaminhado em instantes para:</p>
  <p><a href="${safeDestination}">${safeDestination}</a></p>
</section>`;

  return page("Tag atualizada", content, headOnly);
}

export function renderErrorPage(
  title: string,
  message: string,
  status: number,
  headOnly = false,
): Response {
  const response = page(
    title,
    `<section class="card"><h1>${escapeHtml(title)}</h1>${messageBlock(message, "error")}</section>`,
    headOnly,
  );

  return new Response(response.body, { status, headers: response.headers });
}
