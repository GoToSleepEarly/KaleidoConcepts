import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";

describe("AutoGrowTextarea", () => {
  test("starts as one row and grows to the measured content height", () => {
    render(<AutoGrowTextarea aria-label="消息" rows={1} />);

    const textarea = screen.getByRole("textbox", { name: "消息" });
    expect(textarea).toHaveAttribute("rows", "1");
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 84 });
    fireEvent.input(textarea, { target: { value: "第一行\n第二行\n第三行" } });
    expect(textarea).toHaveStyle({ height: "84px" });
  });
});
