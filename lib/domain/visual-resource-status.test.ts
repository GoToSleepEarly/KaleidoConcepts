import { describe, expect, test } from "vitest";

import { hasInFlightVisualVersion, needsInitialVisualGeneration, shouldGenerateVisualSlot } from "./visual-resource-status";

describe("视觉资源生成状态", () => {
  const versions = [
    { status: "generating", planRevision: 1 },
    { status: "failed", planRevision: 2 },
  ];

  test("旧视觉方案的生成任务不阻断当前方案", () => {
    expect(hasInFlightVisualVersion(versions, 2)).toBe(false);
    expect(needsInitialVisualGeneration({ activeAssetId: null, versions }, 2)).toBe(true);
    expect(shouldGenerateVisualSlot({ id: "slot-1", slotType: "lesson_shot", chapterId: "chapter-1", activeAssetId: null, versions }, { scope: "slot", slotId: "slot-1" }, 2)).toBe(true);
  });

  test("当前视觉方案的生成任务仍阻止重复提交", () => {
    expect(hasInFlightVisualVersion(versions, 1)).toBe(true);
    expect(needsInitialVisualGeneration({ activeAssetId: null, versions }, 1)).toBe(false);
  });

  test("形象修改后保留历史成功版本，但批量生成仍会补齐当前空槽", () => {
    const historicalSuccess = [{ status: "succeeded", planRevision: 2 }];
    expect(needsInitialVisualGeneration({ activeAssetId: null, versions: historicalSuccess }, 2)).toBe(true);
    expect(shouldGenerateVisualSlot({ id: "slot-1", slotType: "lesson_shot", chapterId: "chapter-1", activeAssetId: null, versions: historicalSuccess }, { scope: "all" }, 2)).toBe(true);
  });
});
