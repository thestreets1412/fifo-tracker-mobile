/**
 * The single outbound-network seam for the whole app.
 *
 * `fetch` is an injected parameter, not a global, for two reasons: tests run
 * under plain Node with a stub and never touch the network, and React
 * Native's fetch and Node's fetch are different implementations that happen
 * to share a shape — depending on either one's types here would couple this
 * file to a platform it should not know about.
 *
 * Every request is timeout-bounded. Spec §5 states both quote endpoints "can
 * break without notice", and a mobile radio can stall a request indefinitely
 * without failing it; an unbounded fetch would hang the dashboard forever
 * rather than falling back to the cached value.
 */

export interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type HttpFetch = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<HttpResponse>;

export class HttpError extends Error {
  constructor(readonly url: string, reason: string) {
    super(`GET ${url} failed: ${reason}`);
    this.name = 'HttpError';
  }
}

/**
 * Identifies the app and its version only. Deliberately carries no device,
 * install, or user identifier — spec "Privacy Is a Product Constraint": the
 * only thing that may leave the device is a ticker and a date.
 */
export const USER_AGENT = 'fifo-tracker-mobile/1.0';

export const REQUEST_TIMEOUT_MS = 5000;

/** The real platform fetch, structurally narrowed to HttpFetch. Never used in a test. */
export const platformFetch: HttpFetch = (url, init) =>
  (globalThis as unknown as { fetch: (u: string, i?: unknown) => Promise<HttpResponse> }).fetch(url, init);

export async function httpGetText(
  url: string,
  fetchImpl: HttpFetch,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Raced against the request as well as aborted, because a fetch
  // implementation that ignores `signal` would otherwise never reject.
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // Reject the expiry promise first so that Promise.race sees the timeout error,
      // then defer the abort so the abort listener fires but doesn't override the result.
      const error = new HttpError(url, `timed out after ${timeoutMs}ms`);
      reject(error);
      queueMicrotask(() => {
        controller.abort();
      });
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
        signal: controller.signal,
      }),
      expiry,
    ]);
    if (!response.ok) {
      throw new HttpError(url, `HTTP ${response.status}`);
    }
    return await Promise.race([response.text(), expiry]);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(url, error instanceof Error ? error.message : String(error));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
