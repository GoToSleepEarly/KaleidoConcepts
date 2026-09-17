import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createSignedAuthSession } from "@/lib/server/auth-session-cookie";
import { GET } from "./route";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/db", () => ({ getDb: () => ({ user: { findUnique } }) }));

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
    findUnique.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  test("returns the database user for a valid signed cookie", async () => {
    findUnique.mockResolvedValue({ id: "user-1", displayName: "教师账号" });
    const token = createSignedAuthSession("user-1");
    const response = await GET(new Request("http://example.test/api/auth/session", { headers: { cookie: `kaleido.user-id=${encodeURIComponent(token)}` } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ user: { id: "user-1", displayName: "教师账号" } });
  });

  test("explains that a legacy cookie needs the security upgrade", async () => {
    const response = await GET(new Request("http://example.test/api/auth/session", { headers: { cookie: "kaleido.user-id=user-1" } }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTH_SESSION_UPGRADE_REQUIRED" });
  });

  test("rejects a signed session when the user no longer exists", async () => {
    findUnique.mockResolvedValue(null);
    const token = createSignedAuthSession("removed-user");
    const response = await GET(new Request("http://example.test/api/auth/session", { headers: { cookie: `kaleido.user-id=${encodeURIComponent(token)}` } }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
