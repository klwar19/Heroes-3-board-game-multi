/**
 * Minimal PostgREST client for the Supabase Postgres backend — the same
 * zero-dependency philosophy as smtp.ts: a tiny, fully-tested fetch wrapper
 * instead of a fat SDK, so it runs identically on Node servers and serverless
 * and its behaviour is pinned offline against a fake PostgREST server.
 *
 * Supabase exposes every Postgres table over PostgREST at
 * `<project>.supabase.co/rest/v1/<table>`; authenticated here with the
 * SERVICE-ROLE key (server-only, bypasses row-level security). Only the small
 * query surface the account store needs is implemented:
 *   - eq / is-null column matches, plus raw extra filters ("expires_at=lt.123")
 *   - order / limit
 *   - insert with optional ignore-duplicates upsert semantics
 *   - update / delete returning the affected rows
 */

export type PgValue = string | number | boolean;
/** Column matches: value ⇒ `col=eq.value`, null ⇒ `col=is.null`. */
export type PgMatch = Record<string, PgValue | null>;

export type PostgrestRequestOptions = {
  /** Extra raw PostgREST filters, e.g. `"expires_at=lt.1700"` (pre-encoded). */
  filters?: string[];
  /** PostgREST order clause, e.g. `"mmr.desc,nickname.asc"`. */
  order?: string;
  limit?: number;
};

export class PostgrestError extends Error {
  readonly status: number;
  /** Postgres error code from the response body, e.g. "23505" (unique violation). */
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "PostgrestError";
    this.status = status;
    this.code = code;
  }
  get isUniqueViolation(): boolean {
    return this.code === "23505" || this.status === 409;
  }
}

type FetchLike = typeof fetch;

export class PostgrestClient {
  private readonly restUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: FetchLike;

  constructor(baseUrl: string, serviceKey: string, fetchImpl: FetchLike = fetch) {
    this.restUrl = `${baseUrl.replace(/\/+$/, "")}/rest/v1`;
    this.headers = {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json"
    };
    this.fetchImpl = fetchImpl;
  }

  /** SELECT rows matching the filters. */
  select<T>(table: string, match: PgMatch = {}, options: PostgrestRequestOptions = {}): Promise<T[]> {
    return this.request<T[]>("GET", table, match, options);
  }

  /**
   * INSERT rows, returning the inserted representation. With
   * `ignoreDuplicates`, a row conflicting on a unique key is skipped instead of
   * erroring and is absent from the returned array — the idempotency primitive
   * recordMatchResult builds on.
   */
  insert<T>(table: string, rows: object | object[], options: { ignoreDuplicates?: boolean } = {}): Promise<T[]> {
    const prefer = options.ignoreDuplicates
      ? "return=representation,resolution=ignore-duplicates"
      : "return=representation";
    return this.request<T[]>("POST", table, {}, {}, Array.isArray(rows) ? rows : [rows], prefer);
  }

  /** UPDATE matching rows with the patch, returning the updated rows. */
  update<T>(table: string, patch: object, match: PgMatch, options: PostgrestRequestOptions = {}): Promise<T[]> {
    return this.request<T[]>("PATCH", table, match, options, patch, "return=representation");
  }

  /** DELETE matching rows, returning the deleted rows (atomic consume). */
  delete<T>(table: string, match: PgMatch, options: PostgrestRequestOptions = {}): Promise<T[]> {
    return this.request<T[]>("DELETE", table, match, options, undefined, "return=representation");
  }

  private async request<T>(
    method: string,
    table: string,
    match: PgMatch,
    options: PostgrestRequestOptions,
    body?: object,
    prefer?: string
  ): Promise<T> {
    const params: string[] = [];
    for (const [column, value] of Object.entries(match)) {
      params.push(value === null ? `${column}=is.null` : `${column}=eq.${encodeURIComponent(String(value))}`);
    }
    for (const raw of options.filters ?? []) {
      params.push(raw);
    }
    if (options.order) {
      params.push(`order=${options.order}`);
    }
    if (options.limit != null) {
      params.push(`limit=${options.limit}`);
    }
    const url = `${this.restUrl}/${table}${params.length ? `?${params.join("&")}` : ""}`;
    const response = await this.fetchImpl(url, {
      method,
      headers: prefer ? { ...this.headers, prefer } : this.headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) {
      let code: string | undefined;
      let message = `PostgREST ${method} ${table} failed with ${response.status}`;
      try {
        const data = (await response.json()) as { code?: string; message?: string };
        code = typeof data.code === "string" ? data.code : undefined;
        if (typeof data.message === "string" && data.message) {
          message = `${message}: ${data.message}`;
        }
      } catch {
        /* non-JSON error body */
      }
      throw new PostgrestError(message, response.status, code);
    }
    if (response.status === 204) {
      return [] as T;
    }
    return (await response.json()) as T;
  }
}
