import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const SERIAL = "FF0F16FD7E0100";
const BASE_URL = "https://tag.example.test";

type TestRow = {
  serial_number: string;
  business: string | null;
  code: string | null;
  write_at: string;
  sale_at: string | null;
  link: string | null;
  platform: string | null;
  password: string | null;
};

const env = {
  FALLBACK_URL: "https://luzzi.dev",
  DEFAULT_BUSINESS: "Luzzi.Dev",
  TAG_ID_PATTERN: "^[0-9A-Fa-f]{8,20}$",
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

function makeRow(overrides: Partial<TestRow> = {}): TestRow {
  return {
    serial_number: SERIAL,
    business: "Luzzi.Dev",
    code: "9f3k",
    write_at: "2026-08-24T00:00:00.000Z",
    sale_at: null,
    link: null,
    platform: null,
    password: "pass123",
    ...overrides,
  };
}

function filteredRows(rows: TestRow[], url: URL): TestRow[] {
  const matches = (row: TestRow, key: "serial_number" | "code" | "link"): boolean => {
    const filter = url.searchParams.get(key);
    if (!filter) return true;
    if (filter === "is.null") return row[key] === null;
    if (filter.startsWith("eq.")) {
      return row[key] === decodeURIComponent(filter.slice(3));
    }
    return false;
  };

  return rows.filter((row) =>
    matches(row, "serial_number") && matches(row, "code") && matches(row, "link"),
  );
}

function mockSupabase(rows: TestRow[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const matches = filteredRows(rows, url);

    if (method === "GET") {
      return new Response(JSON.stringify(matches), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body)) as Omit<TestRow, "write_at" | "sale_at" | "platform">;
      const existing = rows.find((row) => row.serial_number === body.serial_number);
      if (existing) return new Response("[]", { status: 201 });

      const inserted: TestRow = {
        ...body,
        write_at: "2026-08-24T00:00:00.000Z",
        sale_at: null,
        platform: null,
      };
      rows.push(inserted);
      return new Response(JSON.stringify([inserted]), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "PATCH") {
      const row = matches[0];
      if (!row) return new Response("[]");
      Object.assign(row, JSON.parse(String(init?.body)) as Partial<TestRow>);
      return new Response(JSON.stringify([row]), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Method Not Allowed", { status: 405 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function formBody(values: Record<string, string>): string {
  return new URLSearchParams(values).toString();
}

function formRequest(path: string, values: Record<string, string>): Request {
  return new Request(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody(values),
  });
}

describe("tag activation flow", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("provisions a pending tag and renders its credentials", async () => {
    const rows: TestRow[] = [];
    mockSupabase(rows);

    const response = await worker.fetch(new Request(`${BASE_URL}/t/${SERIAL}`), env);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toContain("Ative sua tag");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.link).toBeNull();
    expect(body).toContain(rows[0]?.code ?? "");
    expect(body).toContain(rows[0]?.password ?? "");
  });

  it("activates a pending tag and redirects subsequent scans", async () => {
    const row = makeRow({ link: "" });
    const rows = [row];
    const fetchMock = mockSupabase(rows);

    const response = await worker.fetch(
      formRequest(`/t/${SERIAL}`, {
        code: "9F3K",
        password: "pass123",
        link: "https://client.example/reviews",
        business: "Padaria Central",
        platform: "google",
      }),
      env,
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("A tag foi ativada com sucesso");
    expect(row.link).toBe("https://client.example/reviews");
    expect(row.business).toBe("Padaria Central");
    expect(row.platform).toBe("google");
    expect(row.sale_at).toBeTruthy();

    const nextScan = await worker.fetch(new Request(`${BASE_URL}/t/${SERIAL}`), env);
    expect(nextScan.status).toBe(302);
    expect(nextScan.headers.get("location")).toBe("https://client.example/reviews");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true);
  });

  it("rejects invalid credentials and destinations without updating the tag", async () => {
    const row = makeRow();
    const rows = [row];
    const fetchMock = mockSupabase(rows);

    const wrongCredentials = await worker.fetch(
      formRequest(`/t/${SERIAL}`, {
        code: "9f3k",
        password: "wrong",
        link: "https://client.example",
      }),
      env,
    );
    expect((await wrongCredentials.text())).toContain("Código ou senha inválidos");

    const invalidDestination = await worker.fetch(
      formRequest(`/t/${SERIAL}`, {
        code: "9f3k",
        password: "pass123",
        link: "javascript:alert(1)",
      }),
      env,
    );
    expect((await invalidDestination.text())).toContain("http:// ou https://");
    expect(row.link).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("updates an active tag through /manage without changing sale_at", async () => {
    const row = makeRow({
      link: "https://old.example",
      sale_at: "2026-08-24T01:00:00.000Z",
    });
    const rows = [row];
    mockSupabase(rows);

    const response = await worker.fetch(
      formRequest("/manage", {
        code: "9f3k",
        password: "pass123",
        link: "https://new.example/path",
        business: "Novo negócio",
        platform: "whatsapp",
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect((await response.text())).toContain("O destino da tag foi atualizado");
    expect(row.link).toBe("https://new.example/path");
    expect(row.business).toBe("Novo negócio");
    expect(row.platform).toBe("whatsapp");
    expect(row.sale_at).toBe("2026-08-24T01:00:00.000Z");
  });
});
