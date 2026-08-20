type AiLogPhase = "request" | "response" | "error";

type AiLogEntry = {
  operation: string;
  phase: AiLogPhase;
  context?: {
    gateway?: string;
    courseId?: string;
    requestId?: string;
    personId?: string;
    assetId?: string;
  };
  payload?: unknown;
  status?: number;
  latencyMs?: number;
  error?: unknown;
};

const MAX_TEXT_LENGTH = 20_000;

function safeValue(value: unknown, key = ""): unknown {
  if (/authorization|api[_-]?key/i.test(key)) return "[已脱敏]";
  if (/b64_json|imageDataUrl|image_data/i.test(key) && typeof value === "string") return `[图片数据已省略，长度 ${value.length}]`;
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) return `[图片 data URL 已省略，长度 ${value.length}]`;
    if (value.length > MAX_TEXT_LENGTH) return `${value.slice(0, MAX_TEXT_LENGTH)}\n[已截断 ${value.length - MAX_TEXT_LENGTH} 字符]`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => safeValue(item));
  if (value instanceof Error) {
    const extra = Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, safeValue(entryValue, entryKey)]));
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause ? { cause: safeValue(value.cause, "cause") } : {}),
      ...extra,
    };
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, safeValue(entryValue, entryKey)]));
  }
  return value;
}

export function devAiLog(entry: AiLogEntry) {
  const environment = process.env.NODE_ENV;
  if (environment === "test") return;
  if (environment === "production" && entry.phase !== "error") return;
  if (environment !== "development" && environment !== "production") return;
  const details = safeValue({
    timestamp: new Date().toISOString(),
    context: entry.context,
    status: entry.status,
    latencyMs: entry.latencyMs,
    ...(environment === "development" ? { payload: entry.payload } : {}),
    error: entry.error,
  });
  const label = `[AI][${entry.operation}][${entry.phase}]`;
  const serialized = JSON.stringify(details, null, 2);
  if (entry.phase === "error") console.error(label, serialized);
  else console.info(label, serialized);
}
