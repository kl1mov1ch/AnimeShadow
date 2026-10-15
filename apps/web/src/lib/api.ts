import { type ApiError, apiErrorSchema } from "@animeshadow/shared";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiError["error"]["code"],
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }

  /** First message for a given form field, if the server flagged one. */
  fieldError(name: string): string | undefined {
    return this.fields?.[name]?.[0];
  }
}

let authToken: string | null = null;

/** Set by the auth layer so subsequent requests carry the bearer token. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Let the request outlive the page — for the last flush on tab close. */
  keepalive?: boolean;
}

/** A guest's own birth date (YYYY-MM-DD), typed on an 18+ title's page — sent so the server can open R+. */
const GUEST_DOB_KEY = "as:guest-dob";
export function guestDob(): string | null {
  try {
    return localStorage.getItem(GUEST_DOB_KEY);
  } catch {
    return null;
  }
}
export function setGuestDob(value: string | null): void {
  try {
    if (value) localStorage.setItem(GUEST_DOB_KEY, value);
    else localStorage.removeItem(GUEST_DOB_KEY);
  } catch {
    // No storage: asked again next page.
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = new URL(`${API_BASE}/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      keepalive: options.keepalive,
    });
  } catch {
    throw new ApiRequestError(
      0,
      "INTERNAL",
      "Can't reach the server. Check your connection and try again.",
    );
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiRequestError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.fields,
      );
    }
    throw new ApiRequestError(
      response.status,
      "INTERNAL",
      "Something went wrong. Try again shortly.",
    );
  }

  return payload as T;
}

/**
 * A server-sent event stream from the API, read with fetch so the signed-in
 * token travels as a header (EventSource can't send one). Calls `onData` for
 * every `data:` line (parsed JSON) and `onError` for an `event: error`; the
 * promise settles when the stream ends or `signal` aborts.
 */
export async function apiStream(
  path: string,
  handlers: { onData: (data: unknown) => void; onError?: (message: string) => void },
  signal: AbortSignal,
): Promise<void> {
  const url = new URL(`${API_BASE}/api${path}`, window.location.origin);
  const response = await fetch(url, {
    headers: { accept: "text/event-stream", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    credentials: "include",
    signal,
  });
  if (!response.ok || !response.body) throw new ApiRequestError(response.status, "INTERNAL_ERROR" as ApiError["error"]["code"], "stream failed");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const isError = /^event: error$/m.test(block);
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("\n");
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as { message?: string };
        if (isError) handlers.onError?.(parsed.message ?? "error");
        else handlers.onData(parsed);
      } catch {
        // A broken line: skipped.
      }
    }
  }
}

/**
 * A file from the API, saved to disk under `filename` — for downloads that
 * need the signed-in user's token, which a plain link can't carry.
 */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const url = new URL(`${API_BASE}/api${path}`, window.location.origin);
  const response = await fetch(url, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    credentials: "include",
  });
  if (!response.ok) throw new ApiRequestError(response.status, "INTERNAL_ERROR" as ApiError["error"]["code"], "download failed");
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
