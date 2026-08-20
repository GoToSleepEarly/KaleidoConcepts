import { describe, expect, test, vi } from "vitest";

import { createRequestId } from "@/lib/utils/request-id";

describe("createRequestId", () => {
  test("uses native randomUUID when the browser exposes it", () => {
    const randomUUID = vi.fn(() => "11111111-2222-4333-8444-555555555555");

    expect(createRequestId({ randomUUID })).toBe("11111111-2222-4333-8444-555555555555");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  test("creates an RFC 4122 UUID v4 with getRandomValues on insecure HTTP contexts", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.forEach((_, index) => { bytes[index] = index; });
      return bytes;
    });

    expect(createRequestId({ getRandomValues })).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  test("still returns a valid UUID v4 when Web Crypto is completely unavailable", () => {
    const requestId = createRequestId(null, () => 0.5);

    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
