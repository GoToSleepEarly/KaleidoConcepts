import { Agent, fetch as undiciFetch, type Dispatcher, type RequestInit as UndiciRequestInit } from "undici";

import type { StoryWritingProvider } from "@/lib/contracts/api";
import { aiProviderBaseUrl, defaultTextTimeoutSettings, normalizeAiProviderSettings, textProviderSettings, upstreamTextModel, type AccountAiSettings, type AiGateway, type AiProviderSettings, type AiProviderSettingsInput, type TextGenerationModel, type TextProviderSettings, type TextReasoningEffort } from "@/lib/ai-gateway";

import { devAiLog } from "./dev-ai-log";

type ProviderConfig = {
  apiKey: string;
  baseUrl?: string;
  gateway?: AiGateway | "deepseek";
  gptModel: string;
  researchModel: string;
  responsesPath?: string;
  stream?: boolean;
  reasoningEffort?: TextReasoningEffort;
  timeoutMs?: number;
  streamFirstEventTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  streamMaxDurationMs?: number;
  nonStreamTimeoutMs?: number;
};

type ResponsesData = {
  status?: string;
  incomplete_details?: { reason?: string };
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string; type?: string }>;
  }>;
  error?: { message?: string };
  message?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
  };
};

type ResponsesStreamEvent = {
  type?: string;
  delta?: string;
  text?: string;
  message?: string;
  error?: { message?: string };
  response?: ResponsesData;
};

export type StoryOutlineUsage = {
  inputTokens: number;
  outputTokens: number;
  visibleOutputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export class StoryOutlineProviderConfigError extends Error {
  constructor(message = "故事大纲服务尚未配置") {
    super(message);
    this.name = "StoryOutlineProviderConfigError";
  }
}

export class AiProviderResultUnknownError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AiProviderResultUnknownError";
  }
}

const textDispatchers = new Map<string, Dispatcher>();
const transportTimeoutMarginMs = 30_000;

export function textTransportTimeoutMs(requestTimeoutMs: number) {
  return requestTimeoutMs + transportTimeoutMarginMs;
}

function textDispatcher(headersTimeoutMs: number, bodyTimeoutMs = headersTimeoutMs) {
  const headersTimeout = textTransportTimeoutMs(headersTimeoutMs);
  const bodyTimeout = textTransportTimeoutMs(bodyTimeoutMs);
  const key = `${headersTimeout}:${bodyTimeout}`;
  const existing = textDispatchers.get(key);
  if (existing) return existing;
  const dispatcher = new Agent({
    headersTimeout,
    bodyTimeout,
  });
  textDispatchers.set(key, dispatcher);
  return dispatcher;
}

type SelectedTextSettings = AiProviderSettingsInput | AccountAiSettings | (AiProviderSettings & Partial<Omit<TextProviderSettings, keyof AiProviderSettings>>);

function normalizedTextSettings(input: SelectedTextSettings) {
  const defaults = defaultTextTimeoutSettings();
  if (typeof input === "object" && "writingProvider" in input) return textProviderSettings(input);
  if (typeof input === "object" && "textStreamingEnabled" in input) return { ...defaults, ...input };
  return { ...defaults, ...normalizeAiProviderSettings(input), textReasoningEffort: undefined, textStreamingEnabled: false };
}

function configFromEnvironment(input: SelectedTextSettings): ProviderConfig & { gateway: AiGateway } {
  const settings = normalizedTextSettings(input);
  const gateway = settings.aiGateway;
  const isCrazyrouter = gateway === "crazyrouter";
  const isEasy88ai = gateway === "easy88ai";
  const apiKey = isCrazyrouter ? process.env.CRAZYROUTER_TEXT_API_KEY : isEasy88ai ? process.env.EASY88AI_TEXT_API_KEY : process.env.QUICKROUTER_TEXT_API_KEY;
  if (!apiKey) throw new StoryOutlineProviderConfigError();
  return {
    apiKey,
    gateway,
    baseUrl: aiProviderBaseUrl(settings),
    gptModel: "gpt-5.6-sol",
    researchModel: "gpt-5.6-sol",
    stream: settings.textStreamingEnabled,
    reasoningEffort: settings.textReasoningEffort,
    streamFirstEventTimeoutMs: settings.textStreamFirstEventTimeoutSeconds * 1_000,
    streamIdleTimeoutMs: settings.textStreamIdleTimeoutSeconds * 1_000,
    streamMaxDurationMs: settings.textStreamMaxDurationSeconds * 1_000,
    nonStreamTimeoutMs: settings.textNonStreamTimeoutSeconds * 1_000,
  };
}

function outputText(data: ResponsesData) {
  if (data.output_text) return data.output_text;
  const parts = data.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter((text): text is string => Boolean(text));
  return parts?.join("\n").trim() || null;
}

export class StoryOutlineIncompleteResponseError extends Error {
  constructor(
    readonly reason?: string,
    readonly usage?: StoryOutlineUsage,
  ) {
    super(reason === "max_output_tokens" ? "模型输出达到上限，返回内容未完成" : "模型返回内容未完成");
    this.name = "StoryOutlineIncompleteResponseError";
  }
}

function responseUsage(data: ResponsesData): StoryOutlineUsage | undefined {
  if (!data.usage) return undefined;
  const outputTokens = data.usage.output_tokens ?? 0;
  const reasoningTokens = data.usage.output_tokens_details?.reasoning_tokens ?? 0;
  return {
    inputTokens: data.usage.input_tokens ?? 0,
    outputTokens,
    visibleOutputTokens: Math.max(0, outputTokens - reasoningTokens),
    reasoningTokens,
    totalTokens: data.usage.total_tokens ?? 0,
  };
}

function parseResponsesStream(rawResponse: string) {
  let deltaText = "";
  let doneText = "";
  let completed = false;
  let finalResponse: ResponsesData | undefined;
  let eventCount = 0;

  for (const line of rawResponse.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trimStart();
    if (!payload || payload === "[DONE]") continue;
    const event = JSON.parse(payload) as ResponsesStreamEvent;
    eventCount += 1;
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") deltaText += event.delta;
    if (event.type === "response.output_text.done" && typeof event.text === "string") doneText = event.text;
    if (event.type === "response.completed") {
      completed = true;
      finalResponse = event.response ?? { status: "completed" };
    }
    if (event.type === "response.incomplete") {
      finalResponse = event.response ?? { status: "incomplete" };
    }
    if (event.type === "response.failed" || event.type === "error") {
      throw new Error(event.response?.error?.message || event.error?.message || event.message || "故事大纲生成失败");
    }
  }

  if (!completed) {
    const incomplete = finalResponse?.status === "incomplete";
    if (incomplete) return finalResponse as ResponsesData;
    throw new AiProviderResultUnknownError(eventCount > 0
      ? "故事大纲服务流式响应中断，生成结果未能确认，请手动重试本步"
      : "故事大纲服务未返回有效的流式事件，生成结果未能确认，请手动重试本步");
  }

  const data = finalResponse ?? { status: "completed" };
  return outputText(data) ? data : { ...data, output_text: doneText || deltaText };
}

type StreamTimeoutKind = "first_event" | "idle" | "max_duration";

const streamTimeoutMessages: Record<StreamTimeoutKind, string> = {
  first_event: "故事大纲服务等待首个流式事件超时，生成结果未能确认，请手动重试本步",
  idle: "故事大纲服务流式响应长时间没有新事件，生成结果未能确认，请手动重试本步",
  max_duration: "故事大纲服务超过最长运行时间，生成结果未能确认，请手动重试本步",
};

function createStreamTimeoutGuard(firstEventTimeoutMs: number, idleTimeoutMs: number, maxDurationMs: number) {
  const controller = new AbortController();
  let timeoutKind: StreamTimeoutKind | null = null;
  let activityTimer: ReturnType<typeof setTimeout>;
  const abortFor = (kind: StreamTimeoutKind) => {
    if (timeoutKind) return;
    timeoutKind = kind;
    controller.abort(new DOMException(streamTimeoutMessages[kind], "TimeoutError"));
  };
  const armActivity = (kind: "first_event" | "idle", timeoutMs: number) => {
    clearTimeout(activityTimer);
    activityTimer = setTimeout(() => abortFor(kind), timeoutMs);
    activityTimer.unref?.();
  };
  armActivity("first_event", firstEventTimeoutMs);
  const hardTimer = setTimeout(() => abortFor("max_duration"), maxDurationMs);
  hardTimer.unref?.();
  return {
    signal: controller.signal,
    markActivity(timeoutMs = idleTimeoutMs) { armActivity("idle", timeoutMs); },
    timeoutError() { return timeoutKind ? new AiProviderResultUnknownError(streamTimeoutMessages[timeoutKind]) : null; },
    dispose() { clearTimeout(activityTimer); clearTimeout(hardTimer); },
  };
}

function isValidSseActivity(frame: string) {
  if (frame.split(/\r?\n/).some((line) => line.startsWith(":"))) return true;
  const payload = frame.split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!payload) return false;
  if (payload === "[DONE]") return true;
  try { return typeof JSON.parse(payload) === "object"; }
  catch { return false; }
}

async function readWithSignal(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal) {
  if (signal.aborted) throw signal.reason;
  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    reader.read().then(
      (result) => { signal.removeEventListener("abort", abort); resolve(result); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

async function readResponsesStream(response: Response, guard: ReturnType<typeof createStreamTimeoutGuard>) {
  if (!response.body) throw new AiProviderResultUnknownError("故事大纲服务未返回流式响应正文，生成结果未能确认，请手动重试本步");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rawResponse = "";
  let pendingFrames = "";
  try {
    while (true) {
      const { done, value } = await readWithSignal(reader, guard.signal);
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      rawResponse += text;
      pendingFrames += text;
      while (true) {
        const match = /\r?\n\r?\n/.exec(pendingFrames);
        if (!match || match.index === undefined) break;
        const frame = pendingFrames.slice(0, match.index);
        pendingFrames = pendingFrames.slice(match.index + match[0].length);
        if (isValidSseActivity(frame)) guard.markActivity();
      }
    }
    const tail = decoder.decode();
    rawResponse += tail;
    pendingFrames += tail;
    if (pendingFrames && isValidSseActivity(pendingFrames)) guard.markActivity();
    return rawResponse;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw guard.timeoutError() ?? error;
  } finally {
    reader.releaseLock();
  }
}

function deepSeekConfigFromEnvironment(settings: ReturnType<typeof normalizedTextSettings>): ProviderConfig {
  const apiKey = process.env.DEEPSEEK_TEXT_API_KEY;
  if (!apiKey) throw new StoryOutlineProviderConfigError("DeepSeek 服务尚未配置");
  return {
    apiKey,
    baseUrl: "https://api.deepseek.com",
    gateway: "deepseek",
    gptModel: "deepseek-v4-pro",
    researchModel: "deepseek-v4-pro",
    responsesPath: "/responses",
    stream: settings.textStreamingEnabled,
    reasoningEffort: settings.textReasoningEffort,
    streamFirstEventTimeoutMs: settings.textStreamFirstEventTimeoutSeconds * 1_000,
    streamIdleTimeoutMs: settings.textStreamIdleTimeoutSeconds * 1_000,
    streamMaxDurationMs: settings.textStreamMaxDurationSeconds * 1_000,
    nonStreamTimeoutMs: settings.textNonStreamTimeoutSeconds * 1_000,
  };
}

const RETRYABLE_CONNECT_CODES = new Set(["UND_ERR_CONNECT_TIMEOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"]);

const INTERRUPTED_RESPONSE_CODES = new Set(["UND_ERR_SOCKET", "ECONNRESET", "EPIPE"]);

function transportErrorCode(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    const code = Reflect.get(current, "code");
    if (typeof code === "string") return code;
    current = Reflect.get(current, "cause");
  }
  return null;
}

function canRetryBeforeConnection(error: unknown) {
  const code = transportErrorCode(error);
  return code !== null && RETRYABLE_CONNECT_CODES.has(code);
}

function isAmbiguousTimeout(error: unknown) {
  const code = transportErrorCode(error);
  return code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT" || (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"));
}

export function createStoryOutlineProvider(config?: ProviderConfig, selectedSettings: SelectedTextSettings = "quickrouter") {
  const textSettings = normalizedTextSettings(selectedSettings);
  function resolvedConfig(model?: TextGenerationModel) {
    if (model === "deepseek-v4-pro") return deepSeekConfigFromEnvironment(textSettings);
    if (config)
      return {
        baseUrl: "https://api.quickrouter.ai",
        gateway: "quickrouter" as const,
        ...config,
      };
    const activeConfig = configFromEnvironment(selectedSettings);
    if (!model) return activeConfig;
    const selectedModel = upstreamTextModel(model, activeConfig.gateway ?? "quickrouter");
    return {
      ...activeConfig,
      gptModel: selectedModel,
      researchModel: selectedModel,
    };
  }

  async function request(operation: string, body: Record<string, unknown>, activeConfig: ProviderConfig) {
    const startedAt = Date.now();
    const requestBody = activeConfig.stream ? { ...body, stream: true } : body;
    const injectedTimeoutMs = activeConfig.timeoutMs;
    const nonStreamTimeoutMs = activeConfig.nonStreamTimeoutMs ?? injectedTimeoutMs ?? 600_000;
    const streamFirstEventTimeoutMs = activeConfig.streamFirstEventTimeoutMs ?? injectedTimeoutMs ?? 120_000;
    const streamIdleTimeoutMs = activeConfig.streamIdleTimeoutMs ?? injectedTimeoutMs ?? 180_000;
    const streamMaxDurationMs = activeConfig.streamMaxDurationMs ?? injectedTimeoutMs ?? 1_200_000;
    devAiLog({ operation, phase: "request", payload: requestBody });
    let response: Response | null = null;
    let streamGuard: ReturnType<typeof createStreamTimeoutGuard> | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const attemptGuard = activeConfig.stream
        ? createStreamTimeoutGuard(streamFirstEventTimeoutMs, streamIdleTimeoutMs, streamMaxDurationMs)
        : null;
      try {
        response = (await undiciFetch(`${activeConfig.baseUrl ?? "https://api.quickrouter.ai"}${activeConfig.responsesPath ?? "/v1/responses"}`, {
          method: "POST",
          headers: {
            Accept: activeConfig.stream ? "text/event-stream" : "application/json",
            Authorization: `Bearer ${activeConfig.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: attemptGuard?.signal ?? AbortSignal.timeout(nonStreamTimeoutMs),
          dispatcher: activeConfig.stream
            ? textDispatcher(streamFirstEventTimeoutMs, streamIdleTimeoutMs)
            : textDispatcher(nonStreamTimeoutMs),
        } as UndiciRequestInit)) as unknown as Response;
        streamGuard = attemptGuard;
        break;
      } catch (error) {
        const configuredTimeoutError = attemptGuard?.timeoutError();
        attemptGuard?.dispose();
        const retrying = attempt === 1 && canRetryBeforeConnection(error);
        devAiLog({
          operation,
          phase: "error",
          context: { gateway: activeConfig.gateway },
          latencyMs: Date.now() - startedAt,
          payload: { attempt, retrying },
          error,
        });
        if (retrying) continue;
        if (configuredTimeoutError) throw configuredTimeoutError;
        if (isAmbiguousTimeout(error)) {
          throw new AiProviderResultUnknownError("故事大纲服务响应超时，生成结果未能确认，请手动重试本步", { cause: error });
        }
        throw new Error("故事大纲服务连接失败，请稍后重试", { cause: error });
      }
    }

    if (!response) throw new Error("故事大纲服务连接失败，请稍后重试");

    let data: ResponsesData;
    let rawResponse: string;
    try {
      const isResponsesStream = activeConfig.stream && response.ok && response.headers.get("content-type")?.includes("text/event-stream");
      if (isResponsesStream && streamGuard) rawResponse = await readResponsesStream(response, streamGuard);
      else {
        streamGuard?.markActivity(nonStreamTimeoutMs);
        rawResponse = await response.text();
      }
      devAiLog({
        operation,
        phase: "response",
        status: response.status,
        latencyMs: Date.now() - startedAt,
        payload: rawResponse,
      });
      data = isResponsesStream
        ? parseResponsesStream(rawResponse)
        : JSON.parse(rawResponse) as ResponsesData;
    } catch (error) {
      devAiLog({
        operation,
        phase: "error",
        context: { gateway: activeConfig.gateway },
        status: response.status,
        latencyMs: Date.now() - startedAt,
        error,
      });
      const code = transportErrorCode(error);
      if (error instanceof AiProviderResultUnknownError) throw error;
      if (isAmbiguousTimeout(error) || (code && INTERRUPTED_RESPONSE_CODES.has(code))) {
        const reason = isAmbiguousTimeout(error) ? "响应超时" : "响应中断";
        throw new AiProviderResultUnknownError(`故事大纲服务${reason}，生成结果未能确认，请手动重试本步`, { cause: error });
      }
      throw new Error("故事大纲服务返回异常", { cause: error });
    } finally {
      streamGuard?.dispose();
    }
    if (!response.ok) {
      const error = new Error(data.error?.message || data.message || "故事大纲生成失败");
      devAiLog({
        operation,
        phase: "error",
        context: { gateway: activeConfig.gateway },
        status: response.status,
        latencyMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
    if (data.status === "incomplete") {
      const error = new StoryOutlineIncompleteResponseError(data.incomplete_details?.reason, responseUsage(data));
      devAiLog({
        operation,
        phase: "error",
        context: { gateway: activeConfig.gateway },
        status: response.status,
        latencyMs: Date.now() - startedAt,
        payload: { incompleteReason: data.incomplete_details?.reason },
        error,
      });
      throw error;
    }
    const text = outputText(data);
    if (!text) {
      const error = new Error("故事大纲服务未返回内容");
      devAiLog({
        operation,
        phase: "error",
        context: { gateway: activeConfig.gateway },
        status: response.status,
        latencyMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
    return {
      text,
      usage: responseUsage(data),
    };
  }

  return {
    generateOutline: ({ writingProvider, prompt, operation, reasoningEffort, maxOutputTokens }: { writingProvider: StoryWritingProvider; prompt: string; operation?: string; reasoningEffort?: "low" | "medium" | "high"; maxOutputTokens?: number }) => {
      const activeConfig = resolvedConfig(writingProvider);
      return request(
        operation || "story_outline",
        {
          model: activeConfig.gptModel,
          input: prompt,
          ...((activeConfig.reasoningEffort ?? reasoningEffort) ? { reasoning: { effort: activeConfig.reasoningEffort ?? reasoningEffort } } : {}),
          ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
        },
        activeConfig,
      );
    },
    searchReference: ({ writingProvider = "gpt-5.6-sol", prompt, operation = "search_reference" }: { writingProvider?: StoryWritingProvider; prompt: string; operation?: string }) => {
      const activeConfig = resolvedConfig(writingProvider);
      return request(
        operation,
        {
          model: activeConfig.researchModel,
          input: prompt,
          tools: [{ type: "web_search" }],
          ...(activeConfig.gateway === "deepseek" ? { tool_choice: { type: "web_search" } } : {}),
        },
        activeConfig,
      );
    },
  };
}
