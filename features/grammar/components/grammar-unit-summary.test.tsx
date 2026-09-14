import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GrammarUnitSummary } from "@/features/grammar/components/grammar-unit-summary";

describe("GrammarUnitSummary", () => {
  it("keeps the Unit and title together and progressively discloses rules", () => {
    const onExpandedChange = vi.fn();
    render(<GrammarUnitSummary expanded={false} onExpandedChange={onExpandedChange} rules={["Rule one", "Rule two", "Rule three"]} title="Reported speech 2" unitLabel="Unit 48" />);

    expect(screen.getByText("Unit 48 · Reported speech 2")).toBeInTheDocument();
    expect(screen.queryByText("Rule one")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看 Unit 48 · Reported speech 2 的 3 条语法要点" }));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });
});
