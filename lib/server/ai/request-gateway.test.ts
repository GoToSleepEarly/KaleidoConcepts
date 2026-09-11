import { describe, expect, test, vi } from "vitest";

import { AiGatewayAuthenticationError, aiGatewayFromRequest } from "./request-gateway";

const timeoutSettings = {
  textStreamFirstEventTimeoutSeconds: 120,
  textStreamIdleTimeoutSeconds: 180,
  textStreamMaxDurationSeconds: 1_200,
  textNonStreamTimeoutSeconds: 600,
};

describe("aiGatewayFromRequest", () => {
  test("uses the authenticated account preference and ignores unrelated cookies", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "teacher-1",
      username: "teacher",
      password: "secret",
      displayName: "Teacher",
      writingProvider: "deepseek-v4-pro",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2-c",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "direct",
      textReasoningEffort: "high",
      textStreamingEnabled: true,
      ...timeoutSettings,
      imageQuality: "low",
    });
    const request = new Request("http://localhost/api/test", {
      headers: { cookie: "kaleido.user-id=teacher-1; theme=dark" },
    });

    await expect(aiGatewayFromRequest(request, { user: { findUnique } })).resolves.toEqual({
      writingProvider: "deepseek-v4-pro",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2-c",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "direct",
      textReasoningEffort: "high",
      textStreamingEnabled: true,
      ...timeoutSettings,
      imageQuality: "high",
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "teacher-1" } });
  });

  test("reads the latest account preference on every request without requiring another login", async () => {
    let aiGateway: "quickrouter" | "crazyrouter" = "quickrouter";
    const findUnique = vi.fn().mockImplementation(async () => ({
      id: "teacher-1",
      username: "teacher",
      password: "secret",
      displayName: "Teacher",
      writingProvider: "gpt-5.6-sol" as const,
      aiGateway,
      quickRouterEndpoint: "main",
      imageModel: "gpt-image-2" as const,
      imageGateway: "crazyrouter" as const,
      imageQuickRouterEndpoint: "main" as const,
      textReasoningEffort: "medium" as const,
      textStreamingEnabled: true,
      ...timeoutSettings,
      imageQuality: "medium" as const,
    }));
    const db = { user: { findUnique } };
    const request = new Request("http://localhost/api/test", {
      headers: { cookie: "kaleido.user-id=teacher-1" },
    });

    await expect(aiGatewayFromRequest(request, db)).resolves.toEqual({
      writingProvider: "gpt-5.6-sol",
      aiGateway: "quickrouter",
      quickRouterEndpoint: "main",
      imageModel: "gpt-image-2",
      imageGateway: "crazyrouter",
      imageQuickRouterEndpoint: "main",
      textReasoningEffort: "medium",
      textStreamingEnabled: true,
      ...timeoutSettings,
      imageQuality: "medium",
    });
    aiGateway = "crazyrouter";
    await expect(aiGatewayFromRequest(request, db)).resolves.toEqual({
      writingProvider: "gpt-5.6-sol",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "main",
      imageModel: "gpt-image-2",
      imageGateway: "crazyrouter",
      imageQuickRouterEndpoint: "main",
      textReasoningEffort: "medium",
      textStreamingEnabled: true,
      ...timeoutSettings,
      imageQuality: "medium",
    });
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  test("rejects a request without an authenticated account instead of falling back to a gateway cookie", async () => {
    const request = new Request("http://localhost/api/test", {
      headers: { cookie: "kaleido.ai-gateway=crazyrouter" },
    });
    const findUnique = vi.fn();

    await expect(aiGatewayFromRequest(request, { user: { findUnique } })).rejects.toBeInstanceOf(AiGatewayAuthenticationError);
    expect(findUnique).not.toHaveBeenCalled();
  });

  test("rejects a removed account instead of using a default gateway", async () => {
    const db = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const request = new Request("http://localhost/api/test", {
      headers: { cookie: "kaleido.user-id=removed-user" },
    });

    await expect(aiGatewayFromRequest(request, db)).rejects.toBeInstanceOf(AiGatewayAuthenticationError);
  });

  test("rejects a persisted image combination outside the preset compatibility matrix", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      writingProvider: "gpt-5.6-sol",
      aiGateway: "easy88ai",
      quickRouterEndpoint: "main",
      imageModel: "gpt-image-2-c",
      imageGateway: "crazyrouter",
      imageQuickRouterEndpoint: "main",
      textReasoningEffort: "medium",
      textStreamingEnabled: true,
      ...timeoutSettings,
      imageQuality: "medium",
    });
    const request = new Request("http://localhost/api/test", {
      headers: { cookie: "kaleido.user-id=teacher-1" },
    });

    await expect(aiGatewayFromRequest(request, { user: { findUnique } })).rejects.toThrow("账户 AI 设置无效");
  });
});
