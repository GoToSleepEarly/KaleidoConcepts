import { afterEach, describe, expect, test, vi } from "vitest";

import { POST } from "./route";

describe("POST /api/client-errors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("writes a bounded structured client error with its report id", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportId: "CE-20260820T110405-abcdef",
        type: "runtime",
        message: "crypto.randomUUID is not a function",
        route: "/courses/new",
        occurredAt: "2026-08-20T11:04:05.000Z",
      }),
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ reportId: "CE-20260820T110405-abcdef" });
    expect(errorSpy).toHaveBeenCalledWith(
      "[CLIENT_ERROR]",
      expect.stringContaining('"reportId":"CE-20260820T110405-abcdef"'),
    );
  });

  test("rejects oversized reports before parsing", async () => {
    const response = await POST(new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "content-length": "40000", "content-type": "application/json" },
      body: "{}",
    }));

    expect(response.status).toBe(413);
  });
});
