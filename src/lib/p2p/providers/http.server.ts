// Server-only HTTP helper: timeouts, retries with exponential backoff,
// rate-limit awareness. Never logs credentials.

export interface FetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Redact anything that looks like a credential before logging. */
export function safeMessage(input: unknown): string {
  const text = input instanceof Error ? input.message : String(input);
  return text.replace(/(key|secret|token|authorization)[=:]\s*\S+/gi, "$1=[redacted]").slice(0, 300);
}

export async function requestJson<T = unknown>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const { method = "GET", headers = {}, body, timeoutMs = 9000, retries = 2 } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(300 * 2 ** (attempt - 1) + Math.random() * 150);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          "user-agent": "Mozilla/5.0 (compatible; p2p-arb-scanner/1.0)",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        ...(body !== undefined
          ? { body: typeof body === "string" ? body : JSON.stringify(body) }
          : {}),
        signal: controller.signal,
      });

      if (response.status === 429 || response.status >= 500) {
        throw new ProviderError(`upstream ${response.status}`, response.status);
      }
      if (!response.ok) {
        throw new ProviderError(`upstream ${response.status}`, response.status);
      }
      const text = await response.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ProviderError("invalid JSON response");
      }
    } catch (error) {
      lastError = error;
      const status = error instanceof ProviderError ? error.status : undefined;
      // Do not retry hard client errors (4xx other than 429).
      if (status && status < 500 && status !== 429) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ProviderError(safeMessage(lastError));
}

export const toNumber = (value: unknown, fallback = 0): number => {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
};
