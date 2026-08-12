import { afterEach, describe, expect, test, vi } from "vitest";

import { devAiLog } from "./dev-ai-log";

describe("devAiLog", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("does not write AI logs in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    devAiLog({ operation: "story_outline", phase: "request", payload: { prompt: "hello" } });

    expect(info).not.toHaveBeenCalled();
  });

  test("logs development calls while redacting image data", () => {
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    devAiLog({
      operation: "person_visual_edit",
      phase: "request",
      payload: { prompt: "修改外套", image: "data:image/png;base64,abcdef" },
    });

    expect(info).toHaveBeenCalledWith(
      "[AI][person_visual_edit][request]",
      expect.stringContaining("已省略"),
    );
  });

  test("prints request input and response output as explicit serialized logs", () => {
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    devAiLog({ operation: "content_generate_reading", phase: "request", payload: { input: "INPUT_MARKER" } });
    devAiLog({ operation: "content_generate_reading", phase: "response", payload: { output: "OUTPUT_MARKER" } });
    expect(info).toHaveBeenNthCalledWith(1, "[AI][content_generate_reading][request]", expect.stringContaining("INPUT_MARKER"));
    expect(info).toHaveBeenNthCalledWith(2, "[AI][content_generate_reading][response]", expect.stringContaining("OUTPUT_MARKER"));
  });

  test("includes the underlying transport error code", () => {
    vi.stubEnv("NODE_ENV", "development");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new TypeError("fetch failed", {
      cause: Object.assign(new Error("Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
    });
    devAiLog({ operation: "story_outline", phase: "error", error });

    expect(errorLog).toHaveBeenCalledWith(
      "[AI][story_outline][error]",
      expect.stringContaining("UND_ERR_CONNECT_TIMEOUT"),
    );
  });
});
