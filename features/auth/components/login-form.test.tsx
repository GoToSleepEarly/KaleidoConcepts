import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, test, vi } from "vitest";

import { LoginForm } from "./login-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("LoginForm", () => {
  test("keeps visible labels and adds consistent leading field icons", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("账号")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByTestId("username-icon")).toBeInTheDocument();
    expect(screen.getByTestId("password-icon")).toBeInTheDocument();
  });
});
