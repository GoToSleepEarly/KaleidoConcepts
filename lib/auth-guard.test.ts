import { describe, expect, test } from "vitest";

import { resolveAuthGuardState } from "./auth-guard";

describe("auth guard", () => {
  test("authenticates when a stored client session exists", () => {
    const session = {
      user: { displayName: "教师账号" },
      createdAt: "2026-07-04T12:00:00.000Z",
    };

    expect(resolveAuthGuardState(session)).toEqual({
      status: "authenticated",
      session,
    });
  });

  test("requires login when no stored client session exists", () => {
    expect(resolveAuthGuardState(null)).toEqual({
      status: "unauthenticated",
      session: null,
    });
  });
});
