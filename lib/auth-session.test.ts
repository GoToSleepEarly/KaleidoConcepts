import { afterEach, describe, expect, test, vi } from "vitest";

import { clearAuthSession, getAuthSessionChangeEventName, getStoredSession, saveAuthSession } from "./auth-session";

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("auth session storage", () => {
  test("notifies the current window when a session is saved or cleared", () => {
    const listener = vi.fn();
    window.addEventListener(getAuthSessionChangeEventName(), listener);

    saveAuthSession({ user: { displayName: "教师账号" }, createdAt: "2026-07-09T00:00:00.000Z" }, true);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getStoredSession()?.user.displayName).toBe("教师账号");

    clearAuthSession();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(getStoredSession()).toBeNull();
  });
});
