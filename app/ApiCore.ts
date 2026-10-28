/**
 * ApiCore — the ONLY place the client talks HTTP to the backend.
 *
 * The web app, a future React Native app and a desktop app all use the same
 * services (app/services/*) on top of this class. Nothing in the UI imports
 * from /server; the contract between them is `/api/*` + `lib/types.ts`.
 *
 * Web (same origin): no config needed — cookies carry the session.
 * Native / desktop / separately-hosted web:
 *   ApiClient.configure({ baseUrl: "https://api.getklique.app", native: true, getToken: () => storedToken });
 */

type Primitive = string | number | boolean | null | undefined;
export type QueryParams = Record<string, Primitive>;

export interface ApiConfig {
  /** API origin. "" = same origin (the web app). */
  baseUrl: string;
  /** Returns the bearer token for native/desktop clients. */
  getToken?: () => string | null | Promise<string | null>;
  /** Native/desktop clients: ask the API to return the login token and skip cookies. */
  native?: boolean;
}

/** An error the UI can show as-is. `errors` carries per-field messages for forms. */
export class ApiRequestError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string>;

  constructor(status: number, message: string, code = "error", errors?: Record<string, string>) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export const isApiError = (e: unknown): e is ApiRequestError => e instanceof ApiRequestError;
export const errorMessage = (e: unknown, fallback = "Something went wrong. Please try again.") =>
  e instanceof Error && e.message ? e.message : fallback;

/**
 * Small in-memory cache for GETs that opt in with `{ ttl }` (seconds): repeat visits to a page, the back
 * button and two components asking for the same thing at once all share one request. Any write (POST, PATCH,
 * PUT, DELETE) empties it, so what you just changed is never shown stale. Chat and other polled endpoints
 * simply don't opt in.
 */
const cache = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_CACHED = 200;

let config: ApiConfig = { baseUrl: (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "") };

export default class ApiClient {
  /** Override defaults (call once at app start in a native/desktop client). */
  static configure(next: Partial<ApiConfig>) {
    config = { ...config, ...next, baseUrl: (next.baseUrl ?? config.baseUrl).replace(/\/$/, "") };
  }

  get<T>(path: string, params?: QueryParams, opts?: { ttl?: number }): Promise<T> {
    const url = path + toQuery(params);
    const ttl = opts?.ttl ?? 0;
    if (!ttl) return this.request<T>("GET", url);
    const key = config.baseUrl + url;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value as T);
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
    const p = this.request<T>("GET", url)
      .then((value) => {
        if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
        cache.set(key, { expires: Date.now() + ttl * 1000, value });
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  /** Full URL for a path, for things the browser must navigate to (like "Continue with Google") rather than fetch. */
  static url(path: string) {
    return config.baseUrl + path;
  }

  /** Forget cached reads (after sign-in / sign-out, or when something outside this client changed). */
  static clearCache() {
    cache.clear();
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body);
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, body);
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body);
  }
  delete<T>(path: string, params?: QueryParams) {
    return this.request<T>("DELETE", path + toQuery(params));
  }
  /** Send a file's raw bytes as the body (not JSON). */
  postFile<T>(path: string, file: Blob) {
    return this.request<T>("POST", path, undefined, file);
  }

  private async request<T>(method: string, path: string, body?: unknown, file?: Blob): Promise<T> {
    if (method !== "GET") cache.clear();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (file) headers["Content-Type"] = file.type || "application/octet-stream";
    else if (body !== undefined || method === "POST" || method === "PATCH" || method === "PUT") {
      headers["Content-Type"] = "application/json";
    }
    if (config.native) headers["X-Klique-Client"] = "native";
    const token = await config.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(config.baseUrl + path, {
        method,
        headers,
        body: file ?? (body !== undefined ? JSON.stringify(body) : method === "POST" || method === "PATCH" || method === "PUT" ? "{}" : undefined),
        credentials: config.baseUrl ? "include" : "same-origin",
        cache: "no-store",
      });
    } catch {
      throw new ApiRequestError(0, "You seem to be offline. Check your connection and try again.", "network");
    }

    let json: { success?: boolean; message?: string; code?: string; errors?: Record<string, string> } | null = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body (proxy error page, etc.) */
    }

    if (!res.ok || json?.success === false) {
      throw new ApiRequestError(
        res.status,
        json?.message ?? (res.status >= 500 ? "Something went wrong on our side. Please try again." : "That didn't work."),
        json?.code ?? "error",
        json?.errors,
      );
    }
    return json as T;
  }
}

function toQuery(params?: QueryParams) {
  if (!params) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}
