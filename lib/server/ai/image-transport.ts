import { Agent, type Dispatcher } from "undici";

const transportMarginMs = 30_000;
const dispatchers = new Map<string, Dispatcher>();

export function imageTransportTimeoutMs(requestTimeoutMs: number) {
  return requestTimeoutMs + transportMarginMs;
}

function imageDispatcher(timeoutMs: number) {
  const transportTimeout = imageTransportTimeoutMs(timeoutMs);
  const key = String(transportTimeout);
  const existing = dispatchers.get(key);
  if (existing) return existing;
  const dispatcher = new Agent({ headersTimeout: transportTimeout, bodyTimeout: transportTimeout });
  dispatchers.set(key, dispatcher);
  return dispatcher;
}

export function imageFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const requestInit: RequestInit & { dispatcher: Dispatcher } = {
    ...init,
    dispatcher: imageDispatcher(timeoutMs),
  };
  return globalThis.fetch(url, requestInit);
}

export function isImageTransportTimeout(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  const cause = error.cause as { code?: unknown } | undefined;
  return cause?.code === "UND_ERR_HEADERS_TIMEOUT" || cause?.code === "UND_ERR_BODY_TIMEOUT";
}
