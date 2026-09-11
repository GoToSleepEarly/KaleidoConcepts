import { beforeEach, describe, expect, test, vi } from "vitest";

import { GET, PATCH } from "./route";

const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const timeoutSettings = {
  textStreamFirstEventTimeoutSeconds: 120,
  textStreamIdleTimeoutSeconds: 180,
  textStreamMaxDurationSeconds: 1_200,
  textNonStreamTimeoutSeconds: 600,
};

vi.mock("@/lib/server/db", () => ({
  getDb: vi.fn(() => ({ user: { findUnique, update } })),
}));

describe("account AI gateway route", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  test("GET reads the current gateway from the authenticated user's database row", async () => {
    findUnique.mockResolvedValue({
      id: "user-1",
      writingProvider: "deepseek-v4-pro",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2-c",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "main",
      textReasoningEffort: "high",
      textStreamingEnabled: true,
      ...timeoutSettings,
      imageQuality: "high",
    });
    const response = await GET(
      new Request("http://localhost/api/account/ai-gateway", {
        headers: { cookie: "kaleido.user-id=user-1" },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      writingProvider: "deepseek-v4-pro",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2-c",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "main",
      textReasoningEffort: "high",
      textStreamingEnabled: true,
      ...timeoutSettings,
      imageQuality: "high",
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  test("PATCH updates the database without storing the gateway in a cookie", async () => {
    findUnique.mockResolvedValue({
      id: "user-1",
      writingProvider: "gpt-5.6-sol",
      aiGateway: "quickrouter",
      quickRouterEndpoint: "main",
      imageModel: "gpt-image-2",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "main",
      textReasoningEffort: "medium",
      textStreamingEnabled: true,
      ...timeoutSettings,
      imageQuality: "medium",
    });
    update.mockResolvedValue({
      id: "user-1",
      writingProvider: "deepseek-v4-pro",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2-c",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "direct",
      textReasoningEffort: "high",
      textStreamingEnabled: false,
      ...timeoutSettings,
      imageQuality: "high",
    });
    const response = await PATCH(
      new Request("http://localhost/api/account/ai-gateway", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: "kaleido.user-id=user-1",
        },
        body: JSON.stringify({
          writingProvider: "deepseek-v4-pro",
          aiGateway: "crazyrouter",
          quickRouterEndpoint: "direct",
          imageModel: "gpt-image-2-c",
          imageGateway: "quickrouter",
          imageQuickRouterEndpoint: "direct",
          textReasoningEffort: "high",
          textStreamingEnabled: false,
          ...timeoutSettings,
          imageQuality: "low",
        }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      writingProvider: "deepseek-v4-pro",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2-c",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "direct",
      textReasoningEffort: "high",
      textStreamingEnabled: false,
      ...timeoutSettings,
      imageQuality: "high",
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        writingProvider: "deepseek-v4-pro",
        aiGateway: "crazyrouter",
        quickRouterEndpoint: "direct",
        imageModel: "gpt-image-2-c",
        imageGateway: "quickrouter",
        imageQuickRouterEndpoint: "direct",
        textReasoningEffort: "high",
        textStreamingEnabled: false,
        ...timeoutSettings,
        imageQuality: "high",
      },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("PATCH preserves the endpoint for a cached client that only sends the gateway", async () => {
    findUnique.mockResolvedValue({
      id: "user-1",
      writingProvider: "deepseek-v4-pro",
      aiGateway: "quickrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2",
      imageGateway: "crazyrouter",
      imageQuickRouterEndpoint: "main",
      ...timeoutSettings,
    });
    update.mockResolvedValue({
      id: "user-1",
      writingProvider: "deepseek-v4-pro",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2",
      imageGateway: "crazyrouter",
      imageQuickRouterEndpoint: "main",
      ...timeoutSettings,
    });

    const response = await PATCH(
      new Request("http://localhost/api/account/ai-gateway", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: "kaleido.user-id=user-1",
        },
        body: JSON.stringify({ aiGateway: "crazyrouter" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        writingProvider: "deepseek-v4-pro",
        aiGateway: "crazyrouter",
        quickRouterEndpoint: "direct",
        imageModel: "gpt-image-2",
        imageGateway: "crazyrouter",
        imageQuickRouterEndpoint: "main",
        ...timeoutSettings,
      },
    });
  });

  test("PATCH rejects an image model and gateway combination that is not preset", async () => {
    findUnique.mockResolvedValue({
      id: "user-1",
      writingProvider: "gpt-5.6-sol",
      aiGateway: "quickrouter",
      quickRouterEndpoint: "main",
      imageModel: "gpt-image-2",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "main",
      ...timeoutSettings,
    });

    const response = await PATCH(
      new Request("http://localhost/api/account/ai-gateway", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: "kaleido.user-id=user-1",
        },
        body: JSON.stringify({
          aiGateway: "quickrouter",
          imageModel: "gpt-image-2-c",
          imageGateway: "crazyrouter",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  test("PATCH accepts Easy88AI for the standard image model", async () => {
    findUnique.mockResolvedValue({ id: "user-1", writingProvider: "gpt-5.6-sol", aiGateway: "easy88ai", quickRouterEndpoint: "main", imageModel: "gpt-image-2", imageGateway: "quickrouter", imageQuickRouterEndpoint: "main", ...timeoutSettings });
    update.mockResolvedValue({ id: "user-1", writingProvider: "gpt-5.6-sol", aiGateway: "easy88ai", quickRouterEndpoint: "main", imageModel: "gpt-image-2", imageGateway: "easy88ai", imageQuickRouterEndpoint: "main", ...timeoutSettings });

    const response = await PATCH(
      new Request("http://localhost/api/account/ai-gateway", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: "kaleido.user-id=user-1" },
        body: JSON.stringify({ aiGateway: "easy88ai", imageModel: "gpt-image-2", imageGateway: "easy88ai" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ imageModel: "gpt-image-2", imageGateway: "easy88ai" }) }));
  });

  test("PATCH rejects a stream hard limit that is not greater than its activity timeouts", async () => {
    findUnique.mockResolvedValue({ id: "user-1", writingProvider: "gpt-5.6-sol", aiGateway: "easy88ai", quickRouterEndpoint: "main", imageModel: "gpt-image-2", imageGateway: "quickrouter", imageQuickRouterEndpoint: "main", ...timeoutSettings });

    const response = await PATCH(new Request("http://localhost/api/account/ai-gateway", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: "kaleido.user-id=user-1" },
      body: JSON.stringify({ aiGateway: "easy88ai", textStreamIdleTimeoutSeconds: 600, textStreamMaxDurationSeconds: 300 }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ message: expect.stringContaining("最长运行时间") });
    expect(update).not.toHaveBeenCalled();
  });
});
