import { errorDetails, sendClientErrorReport } from "@/lib/client-error-report";

window.addEventListener("error", (event) => {
  const target = event.target;
  if (target && target !== window) {
    const element = target as HTMLLinkElement | HTMLScriptElement;
    const resourceUrl = "src" in element ? element.src : element.href;
    sendClientErrorReport({
      message: `Resource failed to load: ${resourceUrl || element.tagName}`,
      resourceUrl,
      type: "resource",
    });
    return;
  }

  const details = errorDetails(event.error ?? event.message);
  sendClientErrorReport({ ...details, type: "runtime" });
}, true);

window.addEventListener("unhandledrejection", (event) => {
  sendClientErrorReport({ ...errorDetails(event.reason), type: "promise" });
});
