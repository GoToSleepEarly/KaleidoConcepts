import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_COOKIE_SECURE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("expires the authenticated user cookie", async () => {
    const response = await POST();
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(cookie).toContain("kaleido.user-id=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Secure");
  });

  test("uses the HTTP cookie override when expiring the authenticated session", async () => {
    vi.stubEnv("AUTH_COOKIE_SECURE", "false");

    const response = await POST();
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(cookie).toContain("kaleido.user-id=");
    expect(cookie).not.toContain("Secure");
  });
});
