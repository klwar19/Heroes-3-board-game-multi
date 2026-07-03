/**
 * An in-memory PostgREST emulator for the Supabase account-store tests — the
 * same offline-real-behaviour approach as the mock SMTP server in smtp.test.ts.
 * It implements exactly the PostgREST subset `PostgrestClient` emits (eq /
 * is-null / lt filters, order, limit, insert with unique-key enforcement and
 * ignore-duplicates, patch/delete returning representations), so the store's
 * flows are exercised against faithful Postgres semantics: unique violations
 * really 409 with code 23505, DELETE really returns the consumed row, and
 * ignore-duplicates really drops conflicting inserts.
 */

type Row = Record<string, unknown>;

export type FakeTableSpec = {
  /** Primary-key column (always unique). */
  pk: string;
  /** Additional single-column unique keys. */
  unique?: string[];
};

const DEFAULT_TABLES: Record<string, FakeTableSpec> = {
  homm3bg_accounts: { pk: "id", unique: ["nickname_key", "email"] },
  homm3bg_sessions: { pk: "digest" },
  homm3bg_email_tokens: { pk: "digest" },
  homm3bg_matches: { pk: "match_id" }
};

type Filter = (row: Row) => boolean;

function parseFilters(params: URLSearchParams): { filters: Filter[]; order?: string; limit?: number } {
  const filters: Filter[] = [];
  let order: string | undefined;
  let limit: number | undefined;
  for (const [key, rawValue] of params.entries()) {
    if (key === "order") {
      order = rawValue;
      continue;
    }
    if (key === "limit") {
      limit = Number(rawValue);
      continue;
    }
    if (rawValue.startsWith("eq.")) {
      const value = rawValue.slice(3);
      filters.push((row) => String(row[key]) === value && row[key] !== null && row[key] !== undefined);
    } else if (rawValue === "is.null") {
      filters.push((row) => row[key] === null || row[key] === undefined);
    } else if (rawValue.startsWith("lt.")) {
      const bound = Number(rawValue.slice(3));
      filters.push((row) => typeof row[key] === "number" && (row[key] as number) < bound);
    } else {
      throw new Error(`fake-postgrest: unsupported filter ${key}=${rawValue}`);
    }
  }
  return { filters, order, limit };
}

function compareBy(order: string): (a: Row, b: Row) => number {
  const keys = order.split(",").map((part) => {
    const [column, direction] = part.split(".");
    return { column, desc: direction === "desc" };
  });
  return (a, b) => {
    for (const { column, desc } of keys) {
      const av = a[column];
      const bv = b[column];
      if (av === bv) {
        continue;
      }
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return desc ? -cmp : cmp;
    }
    return 0;
  };
}

export class FakePostgrest {
  readonly tables = new Map<string, Row[]>();
  private readonly specs: Record<string, FakeTableSpec>;
  /** Every request seen, for assertions on auth headers etc. */
  readonly requests: { method: string; url: string; headers: Record<string, string> }[] = [];

  constructor(specs: Record<string, FakeTableSpec> = DEFAULT_TABLES) {
    this.specs = specs;
    for (const table of Object.keys(specs)) {
      this.tables.set(table, []);
    }
  }

  rows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  /** A fetch-compatible handler to inject as the store's `fetchImpl`. */
  get fetch(): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
        headers[k.toLowerCase()] = v;
      }
      this.requests.push({ method, url: url.pathname + url.search, headers });

      const match = url.pathname.match(/\/rest\/v1\/([^/]+)$/);
      if (!match) {
        return jsonResponse(404, { message: `no such path ${url.pathname}` });
      }
      const table = match[1];
      const spec = this.specs[table];
      if (!spec) {
        return jsonResponse(404, { code: "42P01", message: `relation "${table}" does not exist` });
      }
      const stored = this.tables.get(table)!;
      const { filters, order, limit } = parseFilters(url.searchParams);
      const matches = (row: Row) => filters.every((f) => f(row));

      if (method === "GET") {
        let result = stored.filter(matches);
        if (order) {
          result = [...result].sort(compareBy(order));
        }
        if (limit != null) {
          result = result.slice(0, limit);
        }
        return jsonResponse(200, result);
      }

      if (method === "POST") {
        const incoming = JSON.parse(String(init?.body ?? "[]")) as Row[];
        const ignoreDuplicates = (headers.prefer ?? "").includes("resolution=ignore-duplicates");
        const inserted: Row[] = [];
        for (const row of incoming) {
          const conflict = this.findConflict(table, row);
          if (conflict) {
            if (ignoreDuplicates) {
              continue;
            }
            return jsonResponse(409, {
              code: "23505",
              message: `duplicate key value violates unique constraint "${table}_${conflict}_key"`
            });
          }
          stored.push({ ...row });
          inserted.push(row);
        }
        return jsonResponse(201, inserted);
      }

      if (method === "PATCH") {
        const patch = JSON.parse(String(init?.body ?? "{}")) as Row;
        const updated: Row[] = [];
        for (const row of stored) {
          if (matches(row)) {
            Object.assign(row, patch);
            updated.push(row);
          }
        }
        return jsonResponse(200, updated);
      }

      if (method === "DELETE") {
        const removed = stored.filter(matches);
        this.tables.set(
          table,
          stored.filter((row) => !matches(row))
        );
        return jsonResponse(200, removed);
      }

      return jsonResponse(405, { message: `method ${method} not supported` });
    }) as typeof fetch;
  }

  private findConflict(table: string, row: Row): string | null {
    const spec = this.specs[table];
    const stored = this.tables.get(table)!;
    const uniqueColumns = [spec.pk, ...(spec.unique ?? [])];
    for (const column of uniqueColumns) {
      const value = row[column];
      if (value == null) {
        continue;
      }
      if (stored.some((existing) => existing[column] === value)) {
        return column;
      }
    }
    return null;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
