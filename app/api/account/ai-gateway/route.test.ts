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
    findUnique.mockResolvedValue({ id: "user-1", aiGateway: "crazyrouter" });
    const response = await GET(new Request("http://localhost/api/account/ai-gateway", {
      headers: { cookie: "kaleido.user-id=user-1" },
    }));

    await expect(response.json()).resolves.toEqual({ aiGateway: "crazyrouter" });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  test("PATCH updates the database without storing the gateway in a cookie", async () => {
    update.mockResolvedValue({ id: "user-1", aiGateway: "crazyrouter" });
    const response = await PATCH(new Request("http://localhost/api/account/ai-gateway", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: "kaleido.user-id=user-1" },
      body: JSON.stringify({ aiGateway: "crazyrouter" }),
    }));

    await expect(response.json()).resolves.toEqual({ aiGateway: "crazyrouter" });
    expect(update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { aiGateway: "crazyrouter" } });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
