import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createSignedAuthSession, readAuthSession } from "./auth-session-cookie";

describe("signed auth session cookie", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SESSION_SECRET", "test-session-secret-with-at-least-32-characters");
  });

  afterEach(() => vi.unstubAllEnvs());

  test("round-trips a signed user id across releases that keep the same secret", () => {
    const token = createSignedAuthSession("user-1", 1_700_000_000);
    const request = new Request("http://example.test/api", { headers: { cookie: `kaleido.user-id=${encodeURIComponent(token)}` } });
    expect(readAuthSession(request, 1_700_000_100)).toEqual({ status: "valid", userId: "user-1" });
  });

  test("rejects tampering instead of trusting browser identity", () => {
    const token = createSignedAuthSession("user-1", 1_700_000_000);
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}x.${parts[2]}`;
    const request = new Request("http://example.test/api", { headers: { cookie: `kaleido.user-id=${encodeURIComponent(tampered)}` } });
    expect(readAuthSession(request, 1_700_000_100)).toEqual({ status: "invalid" });
  });

  test("identifies the old raw user id for the one-time login notice", () => {
    const request = new Request("http://example.test/api", { headers: { cookie: "kaleido.user-id=user-1" } });
    expect(readAuthSession(request)).toEqual({ status: "upgrade_required" });
  });

  test("expires a signed session after 30 days even if replayed", () => {
    const issuedAt = 1_700_000_000;
    const token = createSignedAuthSession("user-1", issuedAt);
    const request = new Request("http://example.test/api", { headers: { cookie: `kaleido.user-id=${encodeURIComponent(token)}` } });
    expect(readAuthSession(request, issuedAt + 30 * 24 * 60 * 60 + 1)).toEqual({ status: "invalid" });
  });
});
