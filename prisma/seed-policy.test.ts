import { describe, expect, test } from "vitest";

import { existingSeedUserData } from "./seed-policy";

describe("seed policy", () => {
  test("preserves mutable account AI preferences for existing users", () => {
    expect(existingSeedUserData({ displayName: "教师账号" })).toEqual({
      displayName: "教师账号",
    });
    expect(
      existingSeedUserData({ displayName: "教师账号" }),
    ).not.toHaveProperty("writingProvider");
    expect(
      existingSeedUserData({ displayName: "教师账号" }),
    ).not.toHaveProperty("aiGateway");
    expect(
      existingSeedUserData({ displayName: "教师账号" }),
    ).not.toHaveProperty("quickRouterEndpoint");
  });
});
