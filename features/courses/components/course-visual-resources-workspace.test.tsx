import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CourseVisualAsset, CourseVisualImageSlot, CourseVisualResourcesState } from "@/lib/contracts/api";
import { CourseVisualResourcesWorkspace, shouldPollVisualResources, showsImageGenerationWait } from "./course-visual-resources-workspace";

const asset = (overrides: Partial<CourseVisualAsset> = {}): CourseVisualAsset => ({
  id: "asset-1", parentAssetId: null, operation: "initial", userInstruction: null, quality: "medium", planRevision: 1,
  status: "succeeded", publicUrl: "/cover.webp", failureCode: null, failureReason: null, startedAt: null, createdAt: "2026-08-15T12:00:00.000Z", ...overrides,
});

const slot = (overrides: Partial<CourseVisualImageSlot>): CourseVisualImageSlot => ({
  id: "cover", stableKey: "visual-cover", slotType: "visual_cover", chapterId: null, chapterOrder: null, chapterTitle: null,
  paragraphId: null, sourceText: "封面概述", characterIds: ["jett"], focus: "封面重点", sceneDescription: "封面场景",
  prompt: "Final prompt", hasUnsyncedChanges: false, activeAssetId: null, activeAsset: null, versions: [], ...overrides,
});

const state: CourseVisualResourcesState = {
  course: { id: "course-1", title: "测试课程", currentStage: "visual_resources" },
  quality: "medium",
  imageGenerationConcurrency: 3,
  planReady: false,
  planRevision: null,
  planMode: null,
  confirmedCoverAssetId: null,
  policyBlocked: false,
  characters: [{
    id: "visual-teacher", characterId: "teacher", displayName: "林老师", chineseName: "林老师", englishName: "Ms Lin", sourceType: "person", sourceReferenceType: null,
    sourceReferenceName: null, visualAnchorMode: "reference", visualAnchorLabel: "林老师", visualAnchorContext: null, appearanceDescription: null, shouldAppearInImages: true, isMain: true, intent: "preserve_identity",
    source: "person_asset", status: "ready", personVisualUrl: "/teacher.webp", storyVisualDesign: "浅蓝色针织衫和深色长裤", activeAssetId: null, activeAsset: null, versions: [],
  }, {
    id: "visual-1", characterId: "jett", displayName: "捷特", sourceType: "referenced", sourceReferenceType: "game_character",
    chineseName: "捷特", englishName: "Jett", sourceReferenceName: "VALORANT", visualAnchorMode: "semantic", visualAnchorLabel: "Jett", visualAnchorContext: "VALORANT game character", appearanceDescription: "白色短发高高束起，身形轻盈敏捷。", shouldAppearInImages: true, isMain: true, intent: "preserve_identity",
    source: null, status: "ready", personVisualUrl: null, storyVisualDesign: "蓝灰色轻便战斗服和短靴", activeAssetId: null, activeAsset: null, versions: [],
  }],
  slots: [],
};

const plannedState: CourseVisualResourcesState = {
  ...state,
  planReady: true,
  planRevision: 1,
  planMode: "faithful",
  slots: [
    slot({}),
    slot({ id: "shot-1", stableKey: "paragraph-p1", slotType: "lesson_shot", chapterId: "chapter-1", chapterOrder: 1, chapterTitle: "风之路", paragraphId: "p1", sourceText: "第一段正文", characterIds: ["jett"], focus: "第一段", sceneDescription: "Jett opens a wind path." }),
    slot({ id: "shot-2", stableKey: "paragraph-p2", slotType: "lesson_shot", chapterId: "chapter-2", chapterOrder: 2, chapterTitle: "守护花园", paragraphId: "p2", sourceText: "第二段正文", characterIds: ["jett"], focus: "第二段", sceneDescription: "Jett reaches the garden." }),
  ],
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Step 5 视觉资源工作区", () => {
  test("顶部保留紧凑流程介绍和独立视觉方案组件，不展示空图片 Tab", () => {
    render(<CourseVisualResourcesWorkspace initialState={state} />);
    expect(screen.getByText("图片生成流程")).toBeInTheDocument();
    expect(screen.getByText("2 · 主要角色")).toBeInTheDocument();
    expect(screen.getByText("3 · 视觉封面")).toBeInTheDocument();
    expect(screen.getByText("4 · 章节图片")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "视觉方案" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成视觉方案" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "主要角色" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "视觉封面" })).not.toBeInTheDocument();
    expect(screen.queryByText(/先统一视觉方案/)).not.toBeInTheDocument();
    expect(screen.getByText("系统将根据故事生成角色形象；若封面生成的人物形象不够精确，可上传参考图后重试。")).toBeInTheDocument();
  });

  test("老师学生卡展示中英文名、人物形象和本课形象，不提供上传入口", () => {
    render(<CourseVisualResourcesWorkspace initialState={plannedState} />);
    expect(screen.getByText("林老师")).toBeInTheDocument();
    expect(screen.getByText("Ms Lin")).toBeInTheDocument();
    expect(screen.getByText("浅蓝色针织衫和深色长裤")).toBeInTheDocument();
    expect(screen.getByAltText("林老师 的形象")).toHaveAttribute("src", expect.stringContaining("teacher.webp"));
    expect(screen.queryByRole("button", { name: /上传参考图/ })).not.toBeInTheDocument();
  });

  test("课程角色展示中英文名、角色形象和本课造型", () => {
    render(<CourseVisualResourcesWorkspace initialState={plannedState} />);
    fireEvent.click(screen.getByRole("tab", { name: "主要角色（1）" }));
    expect(screen.getByText("捷特")).toBeInTheDocument();
    expect(screen.getByText("Jett")).toBeInTheDocument();
    expect(screen.getByText("白色短发高高束起，身形轻盈敏捷。")).toBeInTheDocument();
    expect(screen.getByText(/蓝灰色轻便战斗服和短靴/)).toBeInTheDocument();
    expect(screen.queryByText(/沿用.*经典角色/)).not.toBeInTheDocument();
    expect(screen.queryByText("额外外貌描述")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上传参考图" })).toBeEnabled();
    expect(screen.queryByText(/VALORANT game character/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /确认主要角色/ })).not.toBeInTheDocument();
  });

  test("课程角色上传参考图后，用参考图替换首字头像", () => {
    const reference = asset({ id: "jett-reference", publicUrl: "/jett-reference.webp" });
    render(<CourseVisualResourcesWorkspace initialState={{
      ...plannedState,
      characters: plannedState.characters.map((character) => character.characterId === "jett" ? { ...character, activeAssetId: reference.id, activeAsset: reference, versions: [reference] } : character),
    }} />);
    fireEvent.click(screen.getByRole("tab", { name: "主要角色（1）" }));
    expect(screen.getByAltText("捷特 的形象")).toHaveAttribute("src", expect.stringContaining("jett-reference.webp"));
    expect(screen.getByRole("button", { name: "更换参考图" })).toBeEnabled();
  });

  test("视觉方案生成后分为视觉封面和章节图片两个独立模块", () => {
    render(<CourseVisualResourcesWorkspace initialState={plannedState} />);
    expect(screen.getByRole("button", { name: "更新视觉方案" })).toBeEnabled();
    const summary = screen.getByRole("region", { name: "视觉方案成果" });
    expect(within(summary).getByText("视觉方案已生成")).toBeInTheDocument();
    expect(within(summary).getByText("2 个角色")).toBeInTheDocument();
    expect(within(summary).getByText("1 张封面方案")).toBeInTheDocument();
    expect(within(summary).getByText(/2 张章节图片方案/)).toBeInTheDocument();
    expect(within(summary).getByText("接下来可以检查角色形象并生成视觉封面。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "视觉封面" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "章节图片" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /第 1 章/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /第 2 章/ })).toBeInTheDocument();
    expect(screen.getAllByText("查看 Prompt").length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "生成全部未生成图片" })).toBeDisabled();
  });

  test("生成视觉方案时显示真实等待时间和预计耗时，避免被误认为卡死", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<CourseVisualResourcesWorkspace initialState={state} />);

    fireEvent.click(screen.getByRole("button", { name: "生成视觉方案" }));
    expect(screen.getByRole("status")).toHaveTextContent("正在生成视觉方案");
    expect(screen.getByRole("status")).toHaveTextContent("通常需要 1–3 分钟");
    expect(screen.getByRole("status")).toHaveTextContent("已等待 00:00");

    await act(async () => { await vi.advanceTimersByTimeAsync(65_000); });
    expect(screen.getByRole("status")).toHaveTextContent("已等待 01:05");
  });

  test("更新视觉方案必须二次确认，首次点击不调用接口", async () => {
    const request = vi.fn().mockResolvedValue(Response.json(plannedState));
    vi.stubGlobal("fetch", request);
    render(<CourseVisualResourcesWorkspace initialState={plannedState} />);

    fireEvent.click(screen.getByRole("button", { name: "更新视觉方案" }));
    expect(screen.getByRole("dialog", { name: "更新视觉方案？" })).toBeInTheDocument();
    expect(screen.getByText(/会替换当前角色设定/)).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认更新视觉方案" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[0]?.[0]).toBe("/api/courses/course-1/visual-resources/plan/generate");
  });

  test("角色卡片文字居中，每页最多六张且不提供搜索", () => {
    const referenced = plannedState.characters[1]!;
    const manyCharacters = Array.from({ length: 7 }, (_, index) => ({
      ...referenced,
      id: `visual-role-${index + 1}`,
      characterId: `role-${index + 1}`,
      displayName: `角色${index + 1}`,
      chineseName: `角色${index + 1}`,
      englishName: `Role ${index + 1}`,
      visualAnchorLabel: `角色${index + 1}`,
    }));
    render(<CourseVisualResourcesWorkspace initialState={{ ...plannedState, characters: [plannedState.characters[0]!, ...manyCharacters] }} />);
    fireEvent.click(screen.getByRole("tab", { name: "主要角色（7）" }));

    expect(screen.getByText("角色1")).toBeInTheDocument();
    expect(screen.getByText("角色6")).toBeInTheDocument();
    expect(screen.queryByText("角色7")).not.toBeInTheDocument();
    expect(screen.getByTestId("character-card-copy-role-1")).toHaveClass("text-center");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一页角色" }));
    expect(screen.getByText("角色7")).toBeInTheDocument();
    expect(screen.queryByText("角色1")).not.toBeInTheDocument();
  });

  test("章节 Tab 支持方向键连续浏览", () => {
    render(<CourseVisualResourcesWorkspace initialState={plannedState} />);
    fireEvent.keyDown(screen.getByRole("tablist", { name: "章节图片导航" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /第 2 章/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tablist", { name: "章节图片导航" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /第 1 章/ })).toHaveAttribute("aria-selected", "true");
  });

  test("封面未确认时可以浏览章节正文，但不能生成章节图片", () => {
    render(<CourseVisualResourcesWorkspace initialState={plannedState} />);
    fireEvent.click(screen.getByRole("tab", { name: /第 1 章/ }));
    expect(screen.getByText("第一段正文")).toBeInTheDocument();
    expect(screen.getByText("请先确认视觉封面，再生成章节图片")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成本章未生成图片" })).toBeDisabled();
  });

  test("封面确认后允许跳转章节生成，并提供状态汇总", () => {
    const cover = asset();
    render(<CourseVisualResourcesWorkspace initialState={{
      ...plannedState,
      confirmedCoverAssetId: cover.id,
      slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, activeAssetId: cover.id, activeAsset: cover, versions: [cover] } : item),
    }} />);
    expect(screen.getByRole("tab", { name: /第 1 章/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "生成本章未生成图片" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "跳转章节" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成全部未生成图片" })).toBeEnabled();
  });

  test("Prompt 默认折叠展示，高级模式开放画质、批量并发数和角色描述编辑", () => {
    const cover = asset();
    render(<CourseVisualResourcesWorkspace initialState={{
      ...plannedState, confirmedCoverAssetId: cover.id,
      slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, activeAssetId: cover.id, activeAsset: cover, versions: [cover, asset({ id: "asset-2", publicUrl: "/cover-2.webp" })] } : item),
    }} />);
    expect(screen.getByRole("button", { name: "编辑图片" })).toBeInTheDocument();
    expect(screen.getByText("历史版本（2）")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "高" })).not.toBeInTheDocument();
    expect(screen.getAllByText("查看 Prompt").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "高级模式" }));
    expect(screen.getByRole("radio", { name: "高" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "同时生成图片数" })).toHaveValue("3");
    expect(screen.getByText(/数值越高生成越快/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑林老师形象描述" })).toBeInTheDocument();
  });

  test("高级设置修改批量并发数后立即刷新课程状态", async () => {
    const nextState = { ...plannedState, imageGenerationConcurrency: 4 };
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ imageGenerationConcurrency: 4 }))
      .mockResolvedValueOnce(Response.json(nextState));
    vi.stubGlobal("fetch", request);
    render(<CourseVisualResourcesWorkspace initialState={plannedState} />);

    fireEvent.click(screen.getByRole("button", { name: "高级模式" }));
    fireEvent.change(screen.getByRole("combobox", { name: "同时生成图片数" }), { target: { value: "4" } });

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[0]?.[0]).toBe("/api/courses/course-1/visual-resources/settings");
    expect(JSON.parse(String((request.mock.calls[0]?.[1] as RequestInit).body))).toEqual({ imageGenerationConcurrency: 4 });
    expect(screen.getByRole("combobox", { name: "同时生成图片数" })).toHaveValue("4");
  });

  test("课程角色可以同时编辑中文角色形象和本课造型，保存后已有图片保持可见", async () => {
    const cover = asset();
    const nextState = {
      ...plannedState,
      characters: plannedState.characters,
      slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, hasUnsyncedChanges: true, activeAssetId: cover.id, activeAsset: cover, versions: [cover] } : item),
    };
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ characterId: "jett" }))
      .mockResolvedValueOnce(Response.json(nextState));
    vi.stubGlobal("fetch", request);
    render(<CourseVisualResourcesWorkspace initialState={{ ...nextState, characters: plannedState.characters }} />);

    fireEvent.click(screen.getByRole("button", { name: "高级模式" }));
    fireEvent.click(screen.getByRole("tab", { name: "主要角色（1）" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑捷特形象描述" }));
    fireEvent.change(screen.getByLabelText("角色形象"), { target: { value: "银白短发，蓝色眼睛。" } });
    fireEvent.change(screen.getByLabelText("本课造型"), { target: { value: "深蓝短外套、轻便长裤和短靴。" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String((request.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      appearanceDescription: "银白短发，蓝色眼睛。",
      courseAppearance: "深蓝短外套、轻便长裤和短靴。",
    });
    expect(screen.getByAltText("当前查看的图片版本")).toBeInTheDocument();
    expect(within(screen.getByTestId("character-card-jett")).queryByText(/尚未同步/)).not.toBeInTheDocument();
    const coverSection = screen.getByRole("heading", { name: "视觉封面" }).closest("section");
    expect(coverSection).not.toBeNull();
    expect(within(coverSection!).getByText("角色设定已更新，现有图片不会自动变化；如有需要，请重新生成。")).toBeInTheDocument();
  });

  test("重新生成图片时在当前图片旁显示等待文案和真实等待时长", async () => {
    vi.useFakeTimers();
    const failed = asset({ id: "failed-cover", status: "failed", publicUrl: null, failureReason: "上次生成失败" });
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<CourseVisualResourcesWorkspace initialState={{
      ...plannedState,
      slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, versions: [failed] } : item),
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "重新生成封面" }));
    const loading = screen.getByRole("status");
    expect(loading).toHaveTextContent("正在重新生成视觉封面");
    expect(loading.closest('[data-testid="asset-image-frame"]')).not.toBeNull();
    expect(screen.queryByAltText("当前查看的图片版本")).not.toBeInTheDocument();
    expect(screen.queryByText("上次生成失败")).not.toBeInTheDocument();
    expect(screen.queryByText("生成失败")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("通常需要 1–3 分钟");
    expect(screen.getByRole("status")).toHaveTextContent("已等待 00:00");
    await act(async () => { await vi.advanceTimersByTimeAsync(65_000); });
    expect(screen.getByRole("status")).toHaveTextContent("已等待 01:05");
  });

  test("失败后重新生成成功会立即切换到新图片，不需要刷新页面", async () => {
    const failed = asset({ id: "failed-cover", status: "failed", publicUrl: null, failureReason: "上次生成失败" });
    const succeeded = asset({ id: "new-cover", publicUrl: "/new-cover.webp" });
    const initial = { ...plannedState, slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, versions: [failed] } : item) };
    const next = { ...plannedState, slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, activeAssetId: succeeded.id, activeAsset: succeeded, versions: [failed, succeeded] } : item) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(succeeded)).mockResolvedValueOnce(Response.json(next)));
    render(<CourseVisualResourcesWorkspace initialState={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "重新生成封面" }));
    await waitFor(() => expect(screen.getByAltText("当前查看的图片版本")).toHaveAttribute("src", expect.stringContaining("new-cover.webp")));
    expect(screen.queryByText("上次生成失败")).not.toBeInTheDocument();
  });

  test("重新生成成功后历史失败不再影响章节状态和失败统计", () => {
    const cover = asset({ id: "cover-success" });
    const failed = asset({ id: "shot-failed", status: "failed", publicUrl: null, failureReason: "旧图片失败" });
    const succeeded = asset({ id: "shot-success", publicUrl: "/shot-success.webp", createdAt: "2026-08-15T12:05:00.000Z" });
    render(<CourseVisualResourcesWorkspace initialState={{
      ...plannedState,
      confirmedCoverAssetId: cover.id,
      slots: plannedState.slots.map((item) => {
        if (item.slotType === "visual_cover") return { ...item, activeAssetId: cover.id, activeAsset: cover, versions: [cover] };
        if (item.id === "shot-1") return { ...item, activeAssetId: succeeded.id, activeAsset: succeeded, versions: [failed, succeeded] };
        return item;
      }),
    }} />);

    expect(screen.getByRole("tab", { name: "第 1 章 · 已完成" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "章节图片" }).closest("section")).toHaveTextContent("1/2 已完成");
    expect(screen.getByRole("heading", { name: "章节图片" }).closest("section")).not.toHaveTextContent("张失败");
    expect(screen.queryByText("旧图片失败")).not.toBeInTheDocument();
  });

  test("原创化成功进入新方案后不再展示旧方案的失败", async () => {
    const failed = asset({ id: "failed-cover", status: "failed", publicUrl: null, failureReason: "原作图片生成失败" });
    const initial = {
      ...plannedState,
      policyBlocked: true,
      slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, versions: [failed] } : item),
    };
    const originalized = {
      ...initial,
      planRevision: 2,
      planMode: "originalized" as const,
      policyBlocked: false,
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ planRevision: 2 }))
      .mockResolvedValueOnce(Response.json(originalized)));
    render(<CourseVisualResourcesWorkspace initialState={initial} />);

    expect(screen.getByText("原作图片生成失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "改用原创视觉设定" }));
    fireEvent.click(screen.getByRole("button", { name: "确认并原创化" }));

    expect(screen.queryByText("原作图片生成失败")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在生成原创视觉设定");
    await waitFor(() => expect(screen.queryByText("原作图片生成失败")).not.toBeInTheDocument());
    expect(screen.queryByText("图片生成失败，可以重新生成")).not.toBeInTheDocument();
    expect(screen.queryByText(/张失败/)).not.toBeInTheDocument();
  });

  test("编辑图片失败后在当前图片卡显示后台错误", async () => {
    const current = asset({ id: "current-cover" });
    const failedRevision = asset({ id: "failed-revision", parentAssetId: current.id, operation: "revision", status: "failed", publicUrl: null, failureReason: "图片生成服务繁忙，请稍后重试" });
    const initial = { ...plannedState, slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, activeAssetId: current.id, activeAsset: current, versions: [current] } : item) };
    const failedState = { ...plannedState, slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, activeAssetId: current.id, activeAsset: current, versions: [current, failedRevision] } : item) };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ message: failedRevision.failureReason }, { status: 500 }))
      .mockResolvedValueOnce(Response.json(failedState)));
    render(<CourseVisualResourcesWorkspace initialState={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑图片" }));
    fireEvent.change(screen.getByLabelText("修改当前版本"), { target: { value: "把背景改成黄昏" } });
    fireEvent.click(screen.getByRole("button", { name: "提交修改" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("图片生成服务繁忙，请稍后重试"));
    expect(screen.getByText("编辑图片失败，可以修改要求后重试")).toBeInTheDocument();
  });

  test("远端图片已生成但保存失败时，默认重新保存并提供强制重新生成兜底", async () => {
    const failed = asset({
      id: "recoverable-cover",
      operation: "revision",
      parentAssetId: "current-cover",
      status: "failed",
      publicUrl: null,
      failureCode: "storage_recoverable",
      failureReason: "图片已生成，但下载或保存失败：下载远端图片超时",
    });
    const failedState = {
      ...plannedState,
      slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, versions: [failed] } : item),
    };
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ results: [{ slotId: "cover", assetId: "new-cover" }] }))
      .mockResolvedValueOnce(Response.json(failedState));
    vi.stubGlobal("fetch", request);
    render(<CourseVisualResourcesWorkspace initialState={failedState} />);

    expect(screen.getByRole("button", { name: "重新保存图片" })).toBeEnabled();
    expect(screen.getByText("图片内容已经生成，可以重新保存，不会再次调用 AI")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "修改要求后重试" })).not.toBeInTheDocument();

    const menuTrigger = screen.getByRole("button", { name: "更多图片恢复操作" });
    fireEvent.click(menuTrigger);
    expect(menuTrigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: "重新生成图片" })).not.toBeInTheDocument();
    expect(menuTrigger).toHaveFocus();
    fireEvent.click(menuTrigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "重新生成图片" }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String((request.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      scope: "slot",
      slotId: "cover",
      recoveryMode: "regenerate",
    });
  });

  test("高级模式始终提供 IP 角色原创化入口并在执行前确认影响", () => {
    render(<CourseVisualResourcesWorkspace initialState={plannedState} />);

    fireEvent.click(screen.getByRole("button", { name: "高级模式" }));
    fireEvent.click(screen.getByRole("button", { name: "改用原创视觉设定" }));
    expect(screen.getByRole("heading", { name: "改用原创视觉设定？" })).toBeInTheDocument();
    expect(screen.getByText(/保留故事内容和整体视觉气质/)).toBeInTheDocument();
    expect(screen.getByText(/专有地名和背景元素会改为描述性设定/)).toBeInTheDocument();
  });

  test("策略拦截后同时保留图片重试和原创视觉设定入口", () => {
    const failed = asset({ id: "blocked-cover", status: "failed", publicUrl: null, failureCode: "policy_blocked", failureReason: "内容安全策略拦截" });
    render(<CourseVisualResourcesWorkspace initialState={{
      ...plannedState,
      policyBlocked: true,
      slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, versions: [failed] } : item),
    }} />);

    expect(screen.getByText(/可以直接重试当前图片，也可以改用原创视觉设定/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新生成封面" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "改用原创视觉设定" })).toBeEnabled();
  });

  test("原创视觉方案再次被拦截时可以重试图片或重新调整方案", () => {
    const failed = asset({ id: "blocked-original-cover", status: "failed", publicUrl: null, failureCode: "policy_blocked", failureReason: "内容安全策略拦截" });
    render(<CourseVisualResourcesWorkspace initialState={{
      ...plannedState,
      planMode: "originalized",
      policyBlocked: true,
      slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, versions: [failed] } : item),
    }} />);

    expect(screen.getByText(/可以直接重试当前图片，也可以重新调整原创视觉设定/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新生成封面" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "重新调整原创视觉设定" }));
    expect(screen.getByRole("heading", { name: "重新调整原创视觉设定？" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认重新调整" })).toBeEnabled();
  });

  test("修改图片时提示老师描述对象、位置和目标结果", () => {
    const current = asset();
    render(<CourseVisualResourcesWorkspace initialState={{
      ...plannedState,
      slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, activeAssetId: current.id, activeAsset: current, versions: [current] } : item),
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑图片" }));

    expect(screen.getByText("请具体描述要修改的对象、位置和目标结果，信息越明确，修改越准确。")).toBeInTheDocument();
    expect(screen.getByLabelText("修改当前版本")).toHaveAttribute("placeholder", "例如：消除画面右侧重复的角色，其他人物和构图保持不变");
  });

  test("只有真正提交图片生成时显示长耗时提示", () => {
    expect(showsImageGenerationWait("quality:medium")).toBe(false);
    expect(showsImageGenerationWait("slot:slot-1")).toBe(true);
    expect(showsImageGenerationWait("refine:asset-1")).toBe(true);
  });

  test("图片 POST 尚未返回时也持续向服务端同步状态", () => {
    expect(shouldPollVisualResources("slot:cover", false)).toBe(true);
    expect(shouldPollVisualResources(null, true)).toBe(true);
    expect(shouldPollVisualResources("quality:medium", false)).toBe(false);
  });

  test("批量生成尚未结束时立即展示已成功的单张图片", async () => {
    vi.useFakeTimers();
    const cover = asset({ id: "cover-asset", publicUrl: "/cover.webp" });
    const shotOne = asset({ id: "shot-asset-1", publicUrl: "/shot-1.webp" });
    const shotTwoGenerating = asset({ id: "shot-asset-2", status: "generating", publicUrl: null, startedAt: "2026-08-15T12:01:00.000Z" });
    const chapterState: CourseVisualResourcesState = {
      ...plannedState,
      confirmedCoverAssetId: cover.id,
      slots: [
        { ...plannedState.slots[0], activeAssetId: cover.id, activeAsset: cover, versions: [cover] },
        { ...plannedState.slots[1], chapterId: "chapter-1" },
        { ...plannedState.slots[2], chapterId: "chapter-1", chapterOrder: 1, chapterTitle: "风之路" },
      ],
    };
    const intermediate: CourseVisualResourcesState = {
      ...chapterState,
      slots: chapterState.slots.map((item) => item.id === "shot-1"
        ? { ...item, activeAssetId: shotOne.id, activeAsset: shotOne, versions: [shotOne] }
        : item.id === "shot-2" ? { ...item, versions: [shotTwoGenerating] } : item),
    };
    const neverFinishes = new Promise<Response>(() => undefined);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? neverFinishes
      : Promise.resolve(Response.json(intermediate)));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseVisualResourcesWorkspace initialState={chapterState} />);

    fireEvent.click(screen.getByRole("button", { name: "生成本章未生成图片" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3_100); });

    const firstCard = screen.getByText("第 1 段插图").closest("article")!;
    const secondCard = screen.getByText("第 2 段插图").closest("article")!;
    expect(within(firstCard).getByAltText("当前查看的图片版本")).toHaveAttribute("src", expect.stringContaining("shot-1.webp"));
    expect(within(firstCard).queryByText("正在生成本段插图")).not.toBeInTheDocument();
    expect(within(secondCard).getByText("正在重新生成插图")).toBeInTheDocument();
  });

  test("生成响应丢失后先对账服务端状态，不提示老师盲目重复提交", async () => {
    const generating = asset({ id: "asset-running", status: "generating", publicUrl: null });
    const reconciled = {
      ...plannedState,
      slots: plannedState.slots.map((item) => item.slotType === "visual_cover" ? { ...item, versions: [generating] } : item),
    };
    const request = vi.fn()
      .mockRejectedValueOnce(new TypeError("network disconnected"))
      .mockResolvedValueOnce(new Response(JSON.stringify(reconciled), { status: 200 }));
    vi.stubGlobal("fetch", request);

    render(<CourseVisualResourcesWorkspace initialState={plannedState} />);
    fireEvent.click(screen.getByRole("button", { name: "生成视觉封面" }));

    await waitFor(() => expect(screen.getAllByText("生成中").length).toBeGreaterThan(0));
    expect(screen.queryByText(/恢复网络后可安全重试/)).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
  });

  test("网络结果未知后的手动重试沿用原提交标识，不产生第二笔 AI 调用", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new TypeError("network disconnected"))
      .mockResolvedValueOnce(Response.json(state))
      .mockResolvedValueOnce(Response.json({ message: "视觉方案请求正在处理中", code: "operation_in_progress" }, { status: 409 }));
    vi.stubGlobal("fetch", request);
    render(<CourseVisualResourcesWorkspace initialState={state} />);

    fireEvent.click(screen.getByRole("button", { name: "生成视觉方案" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("恢复网络后可安全重试"));
    fireEvent.click(screen.getByRole("button", { name: "生成视觉方案" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));

    const firstKey = new Headers((request.mock.calls[0]?.[1] as RequestInit).headers).get("Idempotency-Key");
    const retryKey = new Headers((request.mock.calls[2]?.[1] as RequestInit).headers).get("Idempotency-Key");
    expect(firstKey).toBeTruthy();
    expect(retryKey).toBe(firstKey);
  });

  test("视觉方案失败提示不会被页面重新聚焦后的自动同步清除", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ message: "AI 返回的视觉方案内容不完整，请重试", code: "invalid_ai_response", retrySafe: true }, { status: 502 }))
      .mockResolvedValueOnce(Response.json(state));
    vi.stubGlobal("fetch", request);
    render(<CourseVisualResourcesWorkspace initialState={state} />);

    fireEvent.click(screen.getByRole("button", { name: "生成视觉方案" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("AI 返回的视觉方案内容不完整，请重试"));
    expect(screen.getByRole("alert")).not.toHaveTextContent("恢复网络");

    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert")).toHaveTextContent("AI 返回的视觉方案内容不完整，请重试");
  });
});
