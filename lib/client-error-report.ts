export const clientErrorEndpoint = "/api/client-errors";
export const authSessionStorageKey = "kaleido.mock.session";

type StorageProbe = {
  available: boolean;
  errorMessage?: string;
  errorName?: string;
};

export type BrowserDiagnostics = {
  isSecureContext: boolean;
  localStorage: StorageProbe;
  randomUUIDAvailable: boolean;
  sessionStorage: StorageProbe;
};

export type ClientErrorType = "error-boundary" | "promise" | "resource" | "runtime";

export type ClientErrorInput = {
  digest?: string;
  message: string;
  resourceUrl?: string;
  stack?: string;
  type: ClientErrorType;
};

type BrowserCapabilityScope = {
  crypto?: { randomUUID?: unknown };
  isSecureContext?: boolean;
  localStorage?: Storage;
  sessionStorage?: Storage;
};

function shortText(value: unknown, maximum = 4_000) {
  return String(value ?? "").slice(0, maximum);
}

function sanitizeUrls(value: string) {
  return value.replace(/https?:\/\/[^\s)]+/g, (candidate) => {
    try {
      const url = new URL(candidate);
      return `${url.origin}${url.pathname}`;
    } catch {
      return candidate;
    }
  });
}

function probeStorage(readStorage: () => Storage | undefined): StorageProbe {
  try {
    const storage = readStorage();
    if (!storage) return { available: false, errorName: "Unavailable" };
    const key = `__kaleido_storage_probe_${Date.now()}__`;
    storage.setItem(key, "1");
    storage.removeItem(key);
    return { available: true };
  } catch (caught) {
    return {
      available: false,
      errorMessage: shortText(caught instanceof Error ? caught.message : caught, 500),
      errorName: caught instanceof Error ? caught.name : "UnknownError",
    };
  }
}

export function createClientErrorReportId(now = new Date(), random = Math.random) {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "");
  const suffix = Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0");
  return `CE-${timestamp}-${suffix}`;
}

export function probeBrowserCapabilities(scope?: BrowserCapabilityScope): BrowserDiagnostics {
  const browserScope = scope;
  let browserCrypto: BrowserCapabilityScope["crypto"];
  let secureContext: boolean;

  try {
    browserCrypto = browserScope ? browserScope.crypto : window.crypto;
  } catch {
    // Treat blocked Web Crypto access as unavailable.
  }

  try {
    secureContext = Boolean(browserScope ? browserScope.isSecureContext : window.isSecureContext);
  } catch {
    secureContext = false;
  }

  return {
    isSecureContext: secureContext,
    localStorage: probeStorage(() => browserScope ? browserScope.localStorage : window.localStorage),
    randomUUIDAvailable: typeof browserCrypto?.randomUUID === "function",
    sessionStorage: probeStorage(() => browserScope ? browserScope.sessionStorage : window.sessionStorage),
  };
}

export function clearStoredAuthState() {
  try {
    window.sessionStorage.removeItem(authSessionStorageKey);
  } catch {
    // Storage access can be the original failure; recovery must continue without it.
  }
  try {
    window.localStorage.removeItem(authSessionStorageKey);
  } catch {
    // Storage access can be the original failure; recovery must continue without it.
  }
}

export function sendClientErrorReport(input: ClientErrorInput, reportId = createClientErrorReportId()) {
  const payload = {
    diagnostics: probeBrowserCapabilities(),
    digest: shortText(input.digest, 200) || undefined,
    message: shortText(input.message || "Unknown client error", 2_000),
    occurredAt: new Date().toISOString(),
    online: typeof navigator.onLine === "boolean" ? navigator.onLine : undefined,
    reportId,
    resourceUrl: input.resourceUrl ? sanitizeUrls(shortText(input.resourceUrl, 2_000)) : undefined,
    route: `${window.location.pathname}`.slice(0, 1_000),
    stack: input.stack ? sanitizeUrls(shortText(input.stack, 8_000)) : undefined,
    type: input.type,
    userAgent: shortText(navigator.userAgent, 1_000),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
  const body = JSON.stringify(payload);

  try {
    if (typeof navigator.sendBeacon === "function") {
      const queued = navigator.sendBeacon(clientErrorEndpoint, new Blob([body], { type: "application/json" }));
      if (queued) return reportId;
    }
  } catch {
    // Fall through to keepalive fetch.
  }

  try {
    void fetch(clientErrorEndpoint, {
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  } catch {
    // Reporting must never replace the original application error.
  }

  return reportId;
}

export function errorDetails(value: unknown) {
  if (value instanceof Error) {
    return { message: value.message || value.name, stack: value.stack };
  }
  return { message: shortText(value || "Unknown client error", 2_000) };
}
