import { describe, expect, test } from "vitest";

import { aiGatewayFromRequest } from "./request-gateway";

describe("aiGatewayFromRequest", () => {
  test("uses the account Crazyrouter preference from the request cookie", () => {
    const request = new Request("http://localhost/api/test", { headers: { cookie: "other=value; kaleido.ai-gateway=crazyrouter" } });
    expect(aiGatewayFromRequest(request)).toBe("crazyrouter");
  });

  test("defaults missing or invalid preferences to QuickRouter", () => {
    expect(aiGatewayFromRequest(new Request("http://localhost/api/test"))).toBe("quickrouter");
    expect(aiGatewayFromRequest(new Request("http://localhost/api/test", { headers: { cookie: "kaleido.ai-gateway=unknown" } }))).toBe("quickrouter");
    expect(aiGatewayFromRequest(new Request("http://localhost/api/test", { headers: { cookie: "kaleido.ai-gateway=easy88ai" } }))).toBe("quickrouter");
  });
});
