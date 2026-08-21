import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, test, vi } from "vitest";

import LoginPage from "./page";

vi.mock("@/features/auth/components/login-form", () => ({
  LoginForm: () => <div data-testid="login-form" />,
}));

describe("LoginPage", () => {
  test("renders one brand, a one-line proposition, and one login form outside the illustration", () => {
    render(<LoginPage />);

    const background = screen.getByTestId("login-background");
    const illustration = screen.getByTestId("login-illustration");
    const workspace = screen.getByTestId("login-workspace");

    expect(background).toHaveClass("bg-[url('/mock-assets/login-learning-lab.png')]");
    expect(screen.getByTestId("login-transition")).toBeInTheDocument();
    expect(illustration).not.toHaveTextContent("万象为镜");
    expect(illustration).not.toHaveTextContent("Kaleido Concepts");
    expect(workspace).toHaveTextContent("Kaleido Concepts");
    expect(workspace).toHaveTextContent("万象为镜，照见奇思");
    expect(screen.getAllByText("Kaleido Concepts")).toHaveLength(1);
    expect(screen.getByText("万象为镜，照见奇思")).toBeInTheDocument();
    expect(screen.queryByText("万象为镜")).not.toBeInTheDocument();
    expect(screen.queryByText("照见奇思")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("login-form")).toHaveLength(1);
  });

  test("uses a single-column phone layout without the desktop minimum workspace width", () => {
    render(<LoginPage />);

    expect(screen.getByTestId("login-grid")).toHaveClass("grid-cols-1", "lg:grid-cols-[54%_46%]");
    expect(screen.getByTestId("login-illustration")).toHaveClass("hidden", "lg:block");
    expect(screen.getByTestId("login-workspace")).toHaveClass("min-w-0", "px-4");
    expect(screen.getByText("Kaleido Concepts")).toHaveClass("text-2xl", "sm:text-[2rem]");
  });
});
