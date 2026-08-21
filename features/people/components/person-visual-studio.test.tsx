import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PersonProfile, PersonVisualAsset } from "@/lib/contracts/api";

import { PersonVisualStudio } from "./person-visual-studio";

const person: PersonProfile = {
  id: "person-1",
  role: "student",
  chineseName: "夏天",
  englishName: "Summer",
  age: 9,
  gender: "female",
  activeVisual: null,
  visualStatus: "generating",
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

function visual(status: PersonVisualAsset["status"]): PersonVisualAsset {
  return {
    id: "visual-1",
    personId: person.id,
    parentAssetId: null,
    sourceMode: "description",
    appearanceConfig: null,
    userInstruction: null,
    status,
    publicUrl: status === "succeeded" ? "/summer.webp" : null,
    failureReason: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PersonVisualStudio", () => {
  test("uses one scroll surface for the embedded mobile editor while keeping desktop panes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ visuals: [visual("succeeded")] })));

    render(
      <PersonVisualStudio
        embedded
        onChanged={vi.fn()}
        onClose={vi.fn()}
        open
        person={{ ...person, activeVisual: { id: "visual-1", publicUrl: "/summer.webp", sourceMode: "description", createdAt: "2026-08-20T00:00:00.000Z" }, visualStatus: "ready" }}
      />,
    );

    const workspace = await screen.findByTestId("person-visual-workspace");
    const previewPane = screen.getByTestId("person-visual-preview-pane");
    const previewFrame = screen.getByRole("button", { name: "查看人物形象大图" });
    const settingsPane = screen.getByTestId("person-visual-settings-pane");

    expect(workspace).toHaveClass("flex", "flex-col", "overflow-y-auto", "lg:grid", "lg:overflow-hidden", "lg:grid-cols-2");
    expect(previewPane).toHaveClass("lg:overflow-hidden", "lg:border-r");
    expect(previewFrame).toHaveClass("h-[min(56dvh,420px)]", "lg:h-full");
    expect(settingsPane).toHaveClass("lg:overflow-hidden");
  });

  test("restores polling after refresh and reveals the completed image without another generation request", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ visuals: [visual("submitting")] }))
      .mockResolvedValueOnce(Response.json({ visuals: [visual("succeeded")] }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PersonVisualStudio
        embedded
        onChanged={vi.fn()}
        onClose={vi.fn()}
        open
        person={person}
      />,
    );

    expect(await screen.findByText("正在生成全身形象")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    await waitFor(() => expect(screen.getByAltText("夏天 的全身人物形象")).toHaveAttribute("src", "/summer.webp"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every((call) => !((call[1] as RequestInit | undefined)?.method))).toBe(true);
    expect(screen.getByRole("button", { name: /设为当前形象/ })).toBeInTheDocument();
  });
});
