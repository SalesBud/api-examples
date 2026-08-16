/**
 * Minimal Salesbud API client. No dependencies — Node 18+ ships fetch.
 *
 * It exists to encode the three things that are easy to get wrong, so you do not have to:
 *
 *   1. Token renewal. Client credentials has no refresh token, so renewal is asking for a new
 *      token. Renewing on a timer alone is not enough: a credential can be revoked before the
 *      clock runs out, so a 401 also triggers one retry with a fresh token.
 *   2. Pagination. A page can come back short, or empty, while `has_more` is still true. The
 *      loop below follows `next_cursor` and never looks at `data.length`.
 *   3. Retries. 429 waits out `Retry-After`; 503 backs off exponentially with jitter; every other
 *      4xx fails immediately, because retrying an invalid request just fails again.
 */

const DEFAULT_BASE_URL = "https://api.salesbud.com.br";

/** Renew this many seconds before the token actually expires, to cover clock skew and latency. */
const RENEW_MARGIN_SECONDS = 60;

const MAX_RETRIES = 4;

export class SalesbudError extends Error {
  constructor(status, body, requestId) {
    const detail = body?.error?.detail ?? body?.error_description ?? "Request failed";
    super(detail);
    this.name = "SalesbudError";
    this.status = status;
    /** Branch on this. `detail` is human text and may be reworded between releases. */
    this.code = body?.error?.code ?? body?.error ?? "UNKNOWN";
    this.requestId = body?.error?.request_id ?? requestId;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class SalesbudClient {
  #clientId;
  #clientSecret;
  #baseUrl;
  #token = null;
  #expiresAt = 0;
  #pending = null;

  constructor({ clientId, clientSecret, baseUrl = DEFAULT_BASE_URL } = {}) {
    if (!clientId || !clientSecret) {
      throw new Error("clientId and clientSecret are required");
    }
    this.#clientId = clientId;
    this.#clientSecret = clientSecret;
    this.#baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Returns a valid access token, issuing one only when needed. Concurrent callers share a single
   * in-flight request instead of each burning a slot of the token-issuance rate limit.
   */
  async accessToken({ forceRefresh = false } = {}) {
    if (!forceRefresh && this.#token && Date.now() < this.#expiresAt) {
      return this.#token;
    }
    this.#pending ??= this.#issueToken().finally(() => {
      this.#pending = null;
    });
    return this.#pending;
  }

  async #issueToken() {
    const response = await fetch(`${this.#baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.#clientId,
        client_secret: this.#clientSecret,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      // The token endpoint answers in the OAuth 2.0 error shape, not the API envelope.
      throw new SalesbudError(response.status, body, response.headers.get("x-request-id"));
    }

    this.#token = body.access_token;
    this.#expiresAt = Date.now() + (body.expires_in - RENEW_MARGIN_SECONDS) * 1000;
    return this.#token;
  }

  async request(path, { query, retryOnUnauthorized = true } = {}) {
    const url = new URL(`${this.#baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }

    for (let attempt = 0; ; attempt += 1) {
      const token = await this.accessToken();
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });

      if (response.ok) return response.json();

      const body = await response.json().catch(() => ({}));
      const error = new SalesbudError(
        response.status,
        body,
        response.headers.get("x-request-id"),
      );

      // The credential may have been revoked, or the token rotated out, before it expired.
      if (response.status === 401 && retryOnUnauthorized) {
        await this.accessToken({ forceRefresh: true });
        retryOnUnauthorized = false;
        continue;
      }

      const retryable = response.status === 429 || response.status === 503;
      if (!retryable || attempt >= MAX_RETRIES) throw error;

      const retryAfter = Number(response.headers.get("retry-after"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 2 ** attempt * 500 + Math.random() * 250;
      await sleep(backoff);
    }
  }

  /** Client, company, scopes and the rate limit actually in effect for this credential. */
  context() {
    return this.request("/v1/context");
  }

  /**
   * Yields every record of a collection, page by page.
   *
   * The loop is driven by `next_cursor`, never by how many records a page returned — a short or
   * empty page with `has_more: true` is normal, and stopping on it silently truncates the walk.
   * Filters must stay identical across the walk: the cursor is signed and binds them.
   */
  async *list(collection, filters = {}) {
    let cursor = null;
    do {
      const page = await this.request(`/v1/${collection}`, {
        query: { ...filters, cursor },
      });
      yield* page.data;
      cursor = page.pagination.next_cursor;
    } while (cursor);
  }

  meetings(filters) {
    return this.list("meetings", filters);
  }

  /** Calls are records captured from a VoIP integration, addressed by `call_` ids. */
  calls(filters) {
    return this.list("calls", filters);
  }

  meeting(meetingId) {
    return this.request(`/v1/meetings/${meetingId}`);
  }

  call(callId) {
    return this.request(`/v1/calls/${callId}`);
  }

  /** Needs the `transcriptions.read` scope, which is granted separately from `meetings.read`. */
  transcript(collection, resourceId) {
    return this.request(`/v1/${collection}/${resourceId}/transcript`);
  }
}

export function clientFromEnv() {
  return new SalesbudClient({
    clientId: process.env.SALESBUD_CLIENT_ID,
    clientSecret: process.env.SALESBUD_CLIENT_SECRET,
    baseUrl: process.env.SALESBUD_BASE_URL,
  });
}
