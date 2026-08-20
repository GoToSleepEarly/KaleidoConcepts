import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, test, vi } from "vitest";

import { ClientErrorFallback } from "@/components/client-error-fallback";

describe("ClientErrorFallback", () => {
  test("gives the user recovery actions and a support report id", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));

    render(<ClientErrorFallback error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "页面加载失败" })).toBeInTheDocument();
    expect(screen.getByText(/CE-\d{8}T\d{6}-[a-z0-9]{6}/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新加载页面" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清除登录状态并重试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制错误编号" })).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });
});
