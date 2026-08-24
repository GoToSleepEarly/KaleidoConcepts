import { beforeEach, describe, expect, test, vi } from "vitest";

import { POST } from "./route";

const verifyTeacherLogin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/db", () => ({ getDb: vi.fn(() => ({})) }));
vi.mock("@/lib/server/repositories/auth", () => ({ verifyTeacherLogin }));

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    verifyTeacherLogin.mockReset();
    verifyTeacherLogin.mockResolvedValue({ id: "user-1", displayName: "教师账号" });
  });

  test("persists only the authenticated user cookie when remember me is enabled", async () => {
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "teacher", password: "123456", remember: true }),
    }));
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(cookie).toContain("kaleido.user-id=user-1");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).not.toContain("kaleido.ai-gateway");
  });

  test("uses a browser-session user cookie when remember me is disabled", async () => {
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "teacher", password: "123456", remember: false }),
    }));
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(cookie).toContain("kaleido.user-id=user-1");
    expect(cookie).not.toContain("Max-Age");
    expect(cookie).not.toContain("kaleido.ai-gateway");
  });
});
