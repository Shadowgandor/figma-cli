import { FigmaConfig, FigmaApiError } from "./types.js";

const FIGMA_API_BASE = "https://api.figma.com";
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FigmaClient {
  private readonly authHeader: string;

  constructor(config: FigmaConfig) {
    this.authHeader = config.token;
  }

  async request<T>(path: string, params?: Record<string, string | number | boolean | string[]>): Promise<T> {
    let url = path.startsWith("http") ? path : `${FIGMA_API_BASE}${path}`;

    if (params) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          query.set(key, value.join(","));
        } else {
          query.set(key, String(value));
        }
      }
      const qs = query.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      "X-Figma-Token": this.authHeader,
      Accept: "application/json",
    };

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timer);
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error(`Request timed out after ${TIMEOUT_MS / 1000}s: ${url}`);
        }
        if (attempt < MAX_RETRIES - 1) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw err;
      }

      if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES - 1) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter ? Number(retryAfter) * 1000 : 1000 * 2 ** attempt;
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        let errorData: unknown;
        try {
          const text = await response.text();
          try { errorData = JSON.parse(text); } catch { errorData = text; }
        } catch {
          errorData = response.statusText;
        }
        throw new FigmaApiError(response.status, response.statusText, errorData);
      }

      return response.json() as Promise<T>;
    }

    throw new Error(`Request failed after ${MAX_RETRIES} attempts: ${url}`);
  }
}
