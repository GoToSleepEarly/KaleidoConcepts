import { afterEach, describe, expect, test, vi } from "vitest";

import { authenticatedFetch, getAuthInvalidEventName, readServerAuthSession } from "./auth-client";

describe("browser auth client", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("reads the server cookie session as the only authenticated state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ user: { id: "user-1", displayName: "教师账号" }, createdAt: "2026-09-16T00:00:00.000Z" })));
    await expect(readServerAuthSession()).resolves.toMatchObject({ status: "authenticated", session: { user: { id: "user-1" } } });
  });

  test("preserves the migration reason from a legacy cookie", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "AUTH_SESSION_UPGRADE_REQUIRED" }, { status: 401 })));
    await expect(readServerAuthSession()).resolves.toEqual({ status: "unauthenticated", reason: "session-upgrade" });
  });

  test("announces a protected request 401 without replaying it", async () => {
    const request = vi.fn(async () => new Response(null, { status: 401 }));
    const listener = vi.fn();
    vi.stubGlobal("fetch", request);
    window.addEventListener(getAuthInvalidEventName(), listener);
    const response = await authenticatedFetch("/api/courses");
    expect(response.status).toBe(401);
    expect(request).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(getAuthInvalidEventName(), listener);
  });
});
