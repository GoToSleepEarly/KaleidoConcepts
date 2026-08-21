import { errorDetails, sendClientErrorReport } from "@/lib/client-error-report";

const recentReportWindowMs = 30_000;

function normalizeResourceUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

function resourceUrlFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return undefined;
  if (target instanceof HTMLImageElement) return target.currentSrc || target.src || undefined;
  if (target instanceof HTMLScriptElement) return target.src || undefined;
  if (target instanceof HTMLLinkElement) return target.href || undefined;
  if (target instanceof HTMLSourceElement) return target.src || undefined;
  return undefined;
}

function resourceName(target: EventTarget | null) {
  if (!(target instanceof Element)) return "resource";
  return target.tagName || "resource";
}

function shouldReport(recentReports: Map<string, number>, key: string) {
  const now = Date.now();
  const lastReportedAt = recentReports.get(key);
  if (lastReportedAt && now - lastReportedAt < recentReportWindowMs) return false;
  recentReports.set(key, now);
  for (const [reportKey, reportedAt] of recentReports) {
    if (now - reportedAt > recentReportWindowMs) recentReports.delete(reportKey);
  }
  return true;
}

function reportOnce(recentReports: Map<string, number>, key: string, input: Parameters<typeof sendClientErrorReport>[0]) {
  if (shouldReport(recentReports, key)) sendClientErrorReport(input);
}

export function registerClientErrorInstrumentation(scope: Window = window) {
  const recentReports = new Map<string, number>();

  const handleError = (event: ErrorEvent) => {
    const target = event.target;
    if (target instanceof Element) {
      const rawUrl = resourceUrlFromTarget(target);
      const resourceUrl = rawUrl ? normalizeResourceUrl(rawUrl) : undefined;
      const name = resourceName(target);
      reportOnce(recentReports, `resource:${name}:${resourceUrl ?? ""}`, {
        message: `Resource failed to load: ${name}`,
        resourceUrl,
        type: "resource",
      });
      return;
    }

    const details = errorDetails(event.error ?? event.message);
    reportOnce(recentReports, `runtime:${event.message}:${event.filename}:${event.lineno}:${event.colno}`, {
      ...details,
      message: event.message || details.message,
      resourceUrl: event.filename,
      type: "runtime",
    });
  };

  const handlePromiseRejection = (event: PromiseRejectionEvent) => {
    const details = errorDetails(event.reason);
    reportOnce(recentReports, `promise:${details.message}:${details.stack ?? ""}`, { ...details, type: "promise" });
  };

  scope.addEventListener("error", handleError, true);
  scope.addEventListener("unhandledrejection", handlePromiseRejection);

  return () => {
    scope.removeEventListener("error", handleError, true);
    scope.removeEventListener("unhandledrejection", handlePromiseRejection);
  };
}
