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

    saveAuthSession({ user: { displayName: "教师账号" }, createdAt: new Date(Date.now()).toISOString() }, true);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getStoredSession()?.user.displayName).toBe("教师账号");

    clearAuthSession();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(getStoredSession()).toBeNull();
  });

  test("normalizes a removed gateway in an existing browser session", () => {
    sessionStorage.setItem("kaleido.mock.session", JSON.stringify({
      user: { displayName: "教师账号", aiGateway: "easy88ai" },
      createdAt: new Date(Date.now()).toISOString(),
    }));

    expect(getStoredSession()?.user.aiGateway).toBe("quickrouter");
  });

  test("expires remembered browser state with the server authentication cookie", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-21T00:00:00.000Z"));
    const expired = JSON.stringify({
      user: { id: "user-1", displayName: "教师账号" },
      createdAt: "2026-07-21T00:00:00.000Z",
    });
    localStorage.setItem("kaleido.mock.session", expired);

    expect(getStoredSession()).toBeNull();
    expect(localStorage.getItem("kaleido.mock.session")).toBeNull();
  });
});
