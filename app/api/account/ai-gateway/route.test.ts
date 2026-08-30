import { beforeEach, describe, expect, test, vi } from "vitest";

import { GET, PATCH } from "./route";

const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/db", () => ({
  getDb: vi.fn(() => ({ user: { findUnique, update } })),
}));

describe("account AI gateway route", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  test("GET reads the current gateway from the authenticated user's database row", async () => {
    findUnique.mockResolvedValue({ id: "user-1", writingProvider: "quickrouter_deepseek", aiGateway: "crazyrouter", quickRouterEndpoint: "direct" });
    const response = await GET(new Request("http://localhost/api/account/ai-gateway", {
      headers: { cookie: "kaleido.user-id=user-1" },
    }));

    await expect(response.json()).resolves.toEqual({ writingProvider: "quickrouter_deepseek", aiGateway: "crazyrouter", quickRouterEndpoint: "direct" });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  test("PATCH updates the database without storing the gateway in a cookie", async () => {
    findUnique.mockResolvedValue({ id: "user-1", writingProvider: "quickrouter_gpt", aiGateway: "quickrouter", quickRouterEndpoint: "main" });
    update.mockResolvedValue({ id: "user-1", writingProvider: "quickrouter_deepseek", aiGateway: "crazyrouter", quickRouterEndpoint: "direct" });
    const response = await PATCH(new Request("http://localhost/api/account/ai-gateway", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: "kaleido.user-id=user-1" },
      body: JSON.stringify({ writingProvider: "quickrouter_deepseek", aiGateway: "crazyrouter", quickRouterEndpoint: "direct" }),
    }));

    await expect(response.json()).resolves.toEqual({ writingProvider: "quickrouter_deepseek", aiGateway: "crazyrouter", quickRouterEndpoint: "direct" });
    expect(update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { writingProvider: "quickrouter_deepseek", aiGateway: "crazyrouter", quickRouterEndpoint: "direct" } });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("PATCH preserves the endpoint for a cached client that only sends the gateway", async () => {
    findUnique.mockResolvedValue({ id: "user-1", writingProvider: "quickrouter_deepseek", aiGateway: "quickrouter", quickRouterEndpoint: "direct" });
    update.mockResolvedValue({ id: "user-1", writingProvider: "quickrouter_deepseek", aiGateway: "crazyrouter", quickRouterEndpoint: "direct" });

    const response = await PATCH(new Request("http://localhost/api/account/ai-gateway", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: "kaleido.user-id=user-1" },
      body: JSON.stringify({ aiGateway: "crazyrouter" }),
    }));

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { writingProvider: "quickrouter_deepseek", aiGateway: "crazyrouter", quickRouterEndpoint: "direct" } });
  });
});
