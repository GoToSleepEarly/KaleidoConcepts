import { describe, expect, test, vi } from "vitest";

import { aiGatewayFromRequest } from "./request-gateway";

describe("aiGatewayFromRequest", () => {
  test("uses the authenticated account preference instead of a stale gateway cookie", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "teacher-1",
      username: "teacher",
      password: "secret",
      displayName: "Teacher",
      aiGateway: "crazyrouter",
    });
    const request = new Request("http://localhost/api/test", {
      headers: { cookie: "kaleido.user-id=teacher-1; kaleido.ai-gateway=quickrouter" },
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

  test("keeps the gateway cookie as an unauthenticated compatibility fallback", async () => {
    const request = new Request("http://localhost/api/test", { headers: { cookie: "kaleido.ai-gateway=crazyrouter" } });
    const findUnique = vi.fn();

    await expect(aiGatewayFromRequest(request, { user: { findUnique } })).resolves.toBe("crazyrouter");
    expect(findUnique).not.toHaveBeenCalled();
  });

  test("defaults missing or invalid compatibility preferences to QuickRouter", async () => {
    const db = { user: { findUnique: vi.fn() } };
    await expect(aiGatewayFromRequest(new Request("http://localhost/api/test"), db)).resolves.toBe("quickrouter");
    await expect(aiGatewayFromRequest(new Request("http://localhost/api/test", { headers: { cookie: "kaleido.ai-gateway=unknown" } }), db)).resolves.toBe("quickrouter");
    await expect(aiGatewayFromRequest(new Request("http://localhost/api/test", { headers: { cookie: "kaleido.ai-gateway=easy88ai" } }), db)).resolves.toBe("quickrouter");
  });
});
