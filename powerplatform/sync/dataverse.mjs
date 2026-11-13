// A small Dataverse Web API client with no dependencies.
//
// It runs in Node 20+ (with a bearer token) and in a browser page on the Dataverse host (with the
// signed-in session, no token). Both use the same code, so the schema can be provisioned and data
// loaded from either place.

export const API = "/api/data/v9.2";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class DataverseError extends Error {
  constructor(status, message, detail) {
    super(`Dataverse ${status}: ${message}`);
    this.status = status;
    this.detail = detail;
  }
}

export class Dataverse {
  /**
   * @param {object} options
   * @param {string} [options.url] Environment URL, for example https://contoso.crm.dynamics.com. Empty in a browser page on that host.
   * @param {() => Promise<string>} [options.token] Returns a bearer token. Omit in a browser page on the host.
   * @param {string} [options.solution] Solution unique name, added as MSCRM.SolutionUniqueName on metadata writes.
   * @param {(message: string) => void} [options.log]
   */
  constructor({ url = "", token = null, solution = null, log = () => {} } = {}) {
    this.base = url.replace(/\/$/, "") + API;
    this.token = token;
    this.solution = solution;
    this.log = log;
  }

  async headers(extra = {}) {
    const headers = {
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      "Content-Type": "application/json; charset=utf-8",
      ...extra,
    };
    if (this.token) headers.Authorization = `Bearer ${await this.token()}`;
    return headers;
  }

  /** Sends one request, retrying on service protection limits and transient errors. */
  async request(method, path, body = undefined, extraHeaders = {}, attempt = 0) {
    const url = path.startsWith("http") ? path : this.base + (path.startsWith("/") ? path : `/${path}`);
    const headers = await this.headers(extraHeaders);
    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
        credentials: this.token ? "omit" : "include",
      });
    } catch (error) {
      if (attempt < 5) {
        await sleep(2 ** attempt * 1000);
        return this.request(method, path, body, extraHeaders, attempt + 1);
      }
      throw error;
    }
    if ((response.status === 429 || response.status === 503 || response.status === 502) && attempt < 8) {
      const wait = Number(response.headers.get("Retry-After") ?? 0) * 1000 || 2 ** attempt * 1000;
      this.log(`Dataverse asked us to wait ${Math.round(wait / 1000)}s (${response.status}).`);
      await sleep(wait);
      return this.request(method, path, body, extraHeaders, attempt + 1);
    }
    if (response.status === 204) return { status: 204, headers: response.headers, data: null };
    const textBody = await response.text();
    let data = null;
    if (textBody) {
      try {
        data = JSON.parse(textBody);
      } catch {
        data = textBody;
      }
    }
    if (!response.ok) {
      const message = data?.error?.message ?? (typeof data === "string" ? data.slice(0, 500) : response.statusText);
      throw new DataverseError(response.status, message, data);
    }
    return { status: response.status, headers: response.headers, data };
  }

  get(path, headers) {
    return this.request("GET", path, undefined, headers).then((r) => r.data);
  }

  /** Returns null instead of throwing when the resource does not exist. */
  async tryGet(path, headers) {
    try {
      return await this.get(path, headers);
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  /** Follows @odata.nextLink until every row has been read. */
  async getAll(path, pageSize = 5000) {
    const rows = [];
    let next = path;
    while (next) {
      const page = await this.get(next, { Prefer: `odata.maxpagesize=${pageSize}` });
      rows.push(...page.value);
      next = page["@odata.nextLink"] ?? null;
    }
    return rows;
  }

  /** Creates metadata inside the solution, so it is exported with it. */
  createMetadata(path, body) {
    const headers = this.solution ? { "MSCRM.SolutionUniqueName": this.solution } : {};
    return this.request("POST", path, body, headers);
  }

  /**
   * Sends up to 1,000 independent requests in one $batch call. Requests are not in a change set,
   * so one failure does not undo the others; failures are returned for the caller to report.
   * @param {{method: string, url: string, body?: object, headers?: object}[]} requests
   */
  async batch(requests) {
    if (!requests.length) return { ok: 0, failed: [] };
    const boundary = `batch_${Math.random().toString(36).slice(2)}`;
    const parts = requests.map((r) => {
      const lines = [
        `--${boundary}`,
        "Content-Type: application/http",
        "Content-Transfer-Encoding: binary",
        "",
        `${r.method} ${this.base}/${r.url} HTTP/1.1`,
        "Content-Type: application/json; type=entry",
      ];
      for (const [k, v] of Object.entries(r.headers ?? {})) lines.push(`${k}: ${v}`);
      lines.push("", r.body === undefined ? "" : JSON.stringify(r.body));
      return lines.join("\r\n");
    });
    const payload = `${parts.join("\r\n")}\r\n--${boundary}--\r\n`;
    const response = await this.request("POST", "$batch", payload, {
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
      Prefer: "odata.continue-on-error",
    });
    return parseBatchResponse(String(response.data ?? ""), requests);
  }

  /** Splits requests into batches and runs a few at a time. */
  async batchAll(requests, { size = 200, concurrency = 4, label = "rows" } = {}) {
    const chunks = [];
    for (let i = 0; i < requests.length; i += size) chunks.push(requests.slice(i, i + size));
    let ok = 0;
    const failed = [];
    let done = 0;
    const worker = async () => {
      while (chunks.length) {
        const chunk = chunks.shift();
        const result = await this.batch(chunk);
        ok += result.ok;
        failed.push(...result.failed);
        done += chunk.length;
        this.log(`  ${label}: ${done}/${requests.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length || 1) }, worker));
    return { ok, failed };
  }
}

export function parseBatchResponse(text, requests) {
  const statuses = [...text.matchAll(/HTTP\/1\.1 (\d{3})[^\r\n]*/g)].map((m) => Number(m[1]));
  const failed = [];
  let ok = 0;
  statuses.forEach((status, i) => {
    if (status >= 200 && status < 300) ok += 1;
    else {
      const after = text.split(/HTTP\/1\.1 \d{3}/)[i + 1] ?? "";
      const message = after.match(/"message"\s*:\s*"([^"]*)"/)?.[1] ?? `HTTP ${status}`;
      failed.push({ request: requests[i], status, message });
    }
  });
  return { ok, failed };
}

// Deterministic IDs. Each row's primary key is a name-based UUID (RFC 4122 version 5) of its natural
// key, so every sync upserts the same row without a lookup, and lookups can bind by ID directly.
const NAMESPACE = "6b0f3f0e-5a52-4d5e-9c3a-2f1c8c7e4a10";

function uuidBytes(uuid) {
  const hex = uuid.replace(/-/g, "");
  return Uint8Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

export async function stableId(...parts) {
  const name = new TextEncoder().encode(parts.join("|"));
  const ns = uuidBytes(NAMESPACE);
  const input = new Uint8Array(ns.length + name.length);
  input.set(ns);
  input.set(name, ns.length);
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-1", input)).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = [...hash].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
