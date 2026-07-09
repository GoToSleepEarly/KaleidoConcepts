import { describe, expect, test, vi } from "vitest";

import HomePage from "./page";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("home page", () => {
  test("redirects to login without waiting for client hydration", () => {
    HomePage();

    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
