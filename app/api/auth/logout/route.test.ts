import { describe, expect, test } from "vitest";

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  test("expires the authenticated user cookie", async () => {
    const response = await POST();
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(cookie).toContain("kaleido.user-id=");
    expect(cookie).toContain("Max-Age=0");
  });
});
