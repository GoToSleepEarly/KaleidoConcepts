import { describe, expect, test, vi } from "vitest";

import { AiGatewayAuthenticationError, aiGatewayFromRequest } from "./request-gateway";

describe("aiGatewayFromRequest", () => {
  test("uses the authenticated account preference and ignores unrelated cookies", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "teacher-1",
      username: "teacher",
      password: "secret",
      displayName: "Teacher",
      aiGateway: "crazyrouter",
    });
    const request = new Request("http://localhost/api/test", {
      headers: { cookie: "kaleido.user-id=teacher-1; theme=dark" },
    });

    await expect(aiGatewayFromRequest(request, { user: { findUnique } })).resolves.toBe("crazyrouter");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "teacher-1" } });
  });

  test("reads the latest account preference on every request without requiring another login", async () => {
    let aiGateway: "quickrouter" | "crazyrouter" = "quickrouter";
    const findUnique = vi.fn().mockImplementation(async () => ({
      id: "teacher-1",
      username: "teacher",
      password: "secret",
      displayName: "Teacher",
      aiGateway,
    }));
    const db = { user: { findUnique } };
    const request = new Request("http://localhost/api/test", { headers: { cookie: "kaleido.user-id=teacher-1" } });

    await expect(aiGatewayFromRequest(request, db)).resolves.toBe("quickrouter");
    aiGateway = "crazyrouter";
    await expect(aiGatewayFromRequest(request, db)).resolves.toBe("crazyrouter");
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  test("rejects a request without an authenticated account instead of falling back to a gateway cookie", async () => {
    const request = new Request("http://localhost/api/test", { headers: { cookie: "kaleido.ai-gateway=crazyrouter" } });
    const findUnique = vi.fn();

    await expect(aiGatewayFromRequest(request, { user: { findUnique } })).rejects.toBeInstanceOf(AiGatewayAuthenticationError);
    expect(findUnique).not.toHaveBeenCalled();
  });

  test("rejects a removed account instead of using a default gateway", async () => {
    const db = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const request = new Request("http://localhost/api/test", { headers: { cookie: "kaleido.user-id=removed-user" } });

    await expect(aiGatewayFromRequest(request, db)).rejects.toBeInstanceOf(AiGatewayAuthenticationError);
  });
});
