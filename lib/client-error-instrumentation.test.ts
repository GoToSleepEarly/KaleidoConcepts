import { afterEach, describe, expect, test, vi } from "vitest";

import { registerClientErrorInstrumentation } from "@/lib/client-error-instrumentation";

let unregister: (() => void) | null = null;

describe("client error instrumentation", () => {
  afterEach(() => {
    unregister?.();
    unregister = null;
    vi.restoreAllMocks();
  });

  test("reports global runtime errors", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    unregister = registerClientErrorInstrumentation(window);

    window.dispatchEvent(new ErrorEvent("error", {
      error: new Error("runtime boom"),
      message: "runtime boom",
      filename: "https://example.test/_next/static/chunk.js",
    }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/client-errors",
      expect.objectContaining({
        keepalive: true,
        method: "POST",
      }),
    );
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({
      message: "runtime boom",
      resourceUrl: "https://example.test/_next/static/chunk.js",
      type: "runtime",
    });
  });

  test("reports unhandled promise rejections", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    unregister = registerClientErrorInstrumentation(window);
    const event = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", { value: new Error("async boom") });

    window.dispatchEvent(event);

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({
      message: "async boom",
      type: "promise",
    });
  });

  test("reports resource loading failures once per resource", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    unregister = registerClientErrorInstrumentation(window);
    const image = document.createElement("img");
    image.src = "https://example.test/missing.png?token=secret";
    document.body.append(image);

    image.dispatchEvent(new Event("error", { bubbles: false }));
    image.dispatchEvent(new Event("error", { bubbles: false }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({
      message: "Resource failed to load: IMG",
      resourceUrl: "https://example.test/missing.png",
      type: "resource",
    });
    image.remove();
  });
});
