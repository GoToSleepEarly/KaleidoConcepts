import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { OverflowingKnowledgePointTitle } from "./overflowing-knowledge-point-title";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
});

describe("OverflowingKnowledgePointTitle", () => {
  test("animates an overflowing title on fine-pointer hover and resets on leave", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(120);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(360);
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel })) as unknown as typeof HTMLElement.prototype.animate;
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("hover"), addEventListener: vi.fn(), removeEventListener: vi.fn() })));

    render(<OverflowingKnowledgePointTitle title="A very long official Grammar in Use knowledge point title" />);

    const control = await screen.findByRole("button", { name: /展开完整知识点标题/ });
    fireEvent.mouseEnter(control);
    expect(animate).toHaveBeenCalledWith(
      [{ transform: "translateX(0)" }, { transform: "translateX(-240px)" }],
      expect.objectContaining({ easing: "linear", fill: "forwards" }),
    );
    fireEvent.mouseLeave(control);
    expect(cancel).toHaveBeenCalled();
  });

  test("expands and collapses an overflowing title when tapped", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(120);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(360);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));

    render(<OverflowingKnowledgePointTitle title="A very long official Grammar in Use knowledge point title" />);

    const expand = await screen.findByRole("button", { name: /展开完整知识点标题/ });
    fireEvent.click(expand);
    await waitFor(() => expect(screen.getByRole("button", { name: /收起完整知识点标题/ })).toHaveAttribute("aria-expanded", "true"));
    fireEvent.click(screen.getByRole("button", { name: /收起完整知识点标题/ }));
    expect(screen.getByRole("button", { name: /展开完整知识点标题/ })).toHaveAttribute("aria-expanded", "false");
  });
});
