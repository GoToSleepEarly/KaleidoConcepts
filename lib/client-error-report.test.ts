import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createClientErrorReportId,
  probeBrowserCapabilities,
  sendClientErrorReport,
} from "@/lib/client-error-report";

describe("client error reporting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("creates an operator-searchable report id without relying on crypto.randomUUID", () => {
    expect(createClientErrorReportId(new Date("2026-08-20T11:04:05.000Z"), () => 0.123456)).toBe(
      "CE-20260820T110405-4fzyo8",
    );
  });

  test("reports insecure context and unavailable randomUUID explicitly", () => {
    const diagnostics = probeBrowserCapabilities({
      isSecureContext: false,
      crypto: {},
      localStorage,
      sessionStorage,
    });

    expect(diagnostics).toMatchObject({
      isSecureContext: false,
      randomUUIDAvailable: false,
      localStorage: { available: true },
      sessionStorage: { available: true },
    });
  });

  test("falls back to keepalive fetch when sendBeacon is unavailable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));

    const reportId = sendClientErrorReport(
      { message: "crypto.randomUUID is not a function", type: "runtime" },
      "CE-20260820T110405-abcdef",
    );

    expect(reportId).toBe("CE-20260820T110405-abcdef");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/client-errors",
      expect.objectContaining({ keepalive: true, method: "POST" }),
    );
  });
});
