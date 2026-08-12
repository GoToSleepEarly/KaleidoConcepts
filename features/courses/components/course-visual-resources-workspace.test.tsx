import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CourseVisualResourcesState } from "@/lib/contracts/api";
import { CourseVisualResourcesWorkspace, showsImageGenerationWait } from "./course-visual-resources-workspace";

const state: CourseVisualResourcesState = {
  course: { id: "course-1", title: "测试课程", currentStage: "visual_resources" },
  quality: "medium",
  planReady: false,
  characters: [{
    id: "visual-1",
    characterId: "character-1",
    displayName: "Jett",
    sourceType: "referenced",
    sourceReferenceType: "game_character",
    shouldAppearInImages: true,
    intent: "preserve_identity",
    source: null,
    status: "missing",
    personVisualUrl: null,
    storyVisualDesign: null,
    activeAssetId: null,
    activeAsset: null,
    versions: [],
  }],
  slots: [],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Step 5 视觉资源工作区", () => {
  test("画面质量展示中、高、极高并默认选择高", () => {
    render(<CourseVisualResourcesWorkspace initialState={state} />);
    expect(screen.getByRole("radio", { name: "中" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "高（默认）" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "极高" })).toHaveAttribute("aria-checked", "false");
  });

  test("保持原形象的外部角色始终显示文件选择入口", () => {
    render(<CourseVisualResourcesWorkspace initialState={state} />);
    expect(screen.getByText("需要上传参考图")).toBeInTheDocument();
    expect(screen.getByLabelText("选择参考图")).toHaveAttribute("type", "file");
  });

  test("只有真正提交图片生成时显示长耗时提示", () => {
    expect(showsImageGenerationWait("quality:medium")).toBe(false);
    expect(showsImageGenerationWait("intent:character-1")).toBe(false);
    expect(showsImageGenerationWait("slot:slot-1")).toBe(true);
    expect(showsImageGenerationWait("refine:asset-1")).toBe(true);
  });

  test("沿用旧版的资源方案、封面、按章节插图布局", () => {
    render(<CourseVisualResourcesWorkspace initialState={{
      ...state,
      planReady: true,
      slots: [
        { id: "cover", stableKey: "visual-cover", slotType: "visual_cover", chapterId: null, chapterOrder: null, chapterTitle: null, paragraphId: null, sourceText: "封面概述", characterIds: [], focus: "封面概述", prompt: "Horizontal cover prompt", activeAssetId: null, activeAsset: null, versions: [] },
        { id: "shot-1", stableKey: "paragraph-p1", slotType: "lesson_shot", chapterId: "chapter-1", chapterOrder: 1, chapterTitle: "进入珊瑚花园", paragraphId: "p1", sourceText: "第一段正文", characterIds: [], focus: "第一段正文", prompt: "First shot prompt", activeAssetId: null, activeAsset: null, versions: [] },
        { id: "shot-2", stableKey: "paragraph-p2", slotType: "lesson_shot", chapterId: "chapter-1", chapterOrder: 1, chapterTitle: "进入珊瑚花园", paragraphId: "p2", sourceText: "第二段正文", characterIds: [], focus: "第二段正文", prompt: "Second shot prompt", activeAssetId: null, activeAsset: null, versions: [] },
      ],
    }} />);

    expect(screen.getByText("1 · 角色确认")).toBeInTheDocument();
    expect(screen.getByText("2 · 资源方案")).toBeInTheDocument();
    expect(screen.getByText("3 · 视觉封面")).toBeInTheDocument();
    expect(screen.getByText("4 · 章节插图")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "第 1 章 · 进入珊瑚花园" })).toBeInTheDocument();
    expect(screen.getByText("2 张段落插图")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成本章" })).toBeInTheDocument();
  });

  test("刷新后仍按服务端生成状态锁定封面，不能重复提交", () => {
    render(<CourseVisualResourcesWorkspace initialState={{
      ...state,
      planReady: true,
      slots: [{
        id: "cover",
        stableKey: "visual-cover",
        slotType: "visual_cover",
        chapterId: null,
        chapterOrder: null,
        chapterTitle: null,
        paragraphId: null,
        sourceText: "封面概述",
        characterIds: [],
        focus: "封面概述",
        prompt: "Horizontal cover prompt",
        activeAssetId: null,
        activeAsset: null,
        versions: [{ id: "asset-running", parentAssetId: null, operation: "initial", userInstruction: null, quality: "medium", status: "submitting", publicUrl: null, failureReason: null, createdAt: "2026-08-11T12:00:00.000Z" }],
      }],
    }} />);

    expect(screen.getAllByText("生成中").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "生成中" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "重新生成封面" })).not.toBeInTheDocument();
    expect(screen.getByText("还有 1 张图片正在生成，全部完成后才能预览发布")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "进入预览发布" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一步：预览发布" })).toBeDisabled();
  });

  test("没有资源方案和课程图片时也能使用占位进入预览发布", () => {
    render(<CourseVisualResourcesWorkspace initialState={{
      ...state,
      planReady: false,
      slots: [],
    }} />);

    expect(screen.getByText("尚未生成课程图片，将使用占位图继续预览发布")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "进入预览发布" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一步：预览发布" })).toBeEnabled();
  });

  test("刷新后遇到服务端生成任务会自动同步最终成功状态", async () => {
    vi.useFakeTimers();
    const runningSlot: CourseVisualResourcesState["slots"][number] = {
      id: "cover", stableKey: "visual-cover", slotType: "visual_cover", chapterId: null, chapterOrder: null, chapterTitle: null, paragraphId: null, sourceText: "封面概述", characterIds: [], focus: "封面概述", prompt: "Horizontal cover prompt", activeAssetId: null, activeAsset: null,
      versions: [{ id: "asset-running", parentAssetId: null, operation: "initial", userInstruction: null, quality: "medium", status: "submitting", publicUrl: null, failureReason: null, createdAt: "2026-08-11T12:00:00.000Z" }],
    };
    const completedSlot: CourseVisualResourcesState["slots"][number] = {
      ...runningSlot,
      activeAssetId: "asset-running",
      versions: [{ ...runningSlot.versions[0]!, status: "succeeded", publicUrl: "/cover.webp" }],
    };
    const request = vi.fn(async () => new Response(JSON.stringify({ ...state, planReady: true, slots: [completedSlot] }), { status: 200 }));
    vi.stubGlobal("fetch", request);

    render(<CourseVisualResourcesWorkspace initialState={{ ...state, planReady: true, slots: [runningSlot] }} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });

    expect(request).toHaveBeenCalledWith("/api/courses/course-1/visual-resources", { cache: "no-store" });
    expect(screen.getAllByText("已采用").length).toBeGreaterThan(0);
    expect(screen.getByText("当前采用")).toBeInTheDocument();
  });

  test("成功图片默认采用，点击编辑图片后才显示聊天修改框", () => {
    const asset = { id: "asset-1", parentAssetId: null, operation: "initial" as const, userInstruction: null, quality: "medium" as const, status: "succeeded" as const, publicUrl: "/cover.webp", failureReason: null, createdAt: "2026-08-11T12:00:00.000Z" };
    render(<CourseVisualResourcesWorkspace initialState={{
      ...state,
      planReady: true,
      slots: [{ id: "cover", stableKey: "visual-cover", slotType: "visual_cover", chapterId: null, chapterOrder: null, chapterTitle: null, paragraphId: null, sourceText: "封面概述", characterIds: [], focus: "封面概述", prompt: "Horizontal cover prompt", activeAssetId: asset.id, activeAsset: asset, versions: [asset] }],
    }} />);

    expect(screen.getByText("当前采用")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("例如：把背景改成黄昏")).not.toBeInTheDocument();
    expect(screen.getByText("查看 Prompt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新生成封面" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑图片" }));
    expect(screen.getByPlaceholderText("例如：把背景改成黄昏")).toBeInTheDocument();
  });

  test("原创角色直接展示本课文字造型，不再要求生成中间角色图", () => {
    render(<CourseVisualResourcesWorkspace initialState={{
      ...state,
      planReady: true,
      characters: [{ ...state.characters[0]!, sourceType: "original", intent: "originalize", storyVisualDesign: "A navy explorer jacket with a coral scarf." }],
    }} />);

    expect(screen.getByText("使用文字设定")).toBeInTheDocument();
    expect(screen.getByText("A navy explorer jacket with a coral scarf.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /生成原创形象/ })).not.toBeInTheDocument();
  });
});
