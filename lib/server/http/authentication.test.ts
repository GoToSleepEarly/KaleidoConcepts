import { describe, expect, test } from "vitest";

import { AiGatewayAuthenticationError } from "@/lib/server/ai/request-gateway";
import { authenticationErrorResponse } from "./authentication";

describe("authenticationErrorResponse", () => {
  test("returns an actionable 401 for an expired AI request identity", async () => {
    const response = authenticationErrorResponse(new AiGatewayAuthenticationError());

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ message: "登录状态已失效，请重新登录后继续" });
  });

  test("does not consume unrelated failures", () => {
    expect(authenticationErrorResponse(new Error("provider failed"))).toBeNull();
  });
});
