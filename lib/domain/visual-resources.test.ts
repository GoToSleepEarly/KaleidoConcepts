import { describe, expect, test } from "vitest";
import {
  canGenerateVisualSlot,
  defaultCharacterVisualIntent,
  imageQualityLabel,
  matchCoursePersonForCharacter,
  hasInFlightVisualVersion,
  needsInitialVisualGeneration,
  shouldGenerateVisualSlot,
  visualGenerationFingerprint,
} from "./visual-resources";

describe("视觉资源领域规则", () => {
  test("画面质量使用老师可理解的中、高、极高映射，默认值由服务端使用 medium", () => {
    expect(imageQualityLabel("low")).toBe("中");
    expect(imageQualityLabel("medium")).toBe("高");
    expect(imageQualityLabel("high")).toBe("极高");
  });

  test("外部引用角色默认保持原形象，原创角色默认课堂原创化", () => {
    expect(defaultCharacterVisualIntent("referenced")).toBe("preserve_identity");
    expect(defaultCharacterVisualIntent("original")).toBe("originalize");
    expect(defaultCharacterVisualIntent("person")).toBeNull();
  });

  test("包含未固定主要角色的图片槽不能生成", () => {
    expect(canGenerateVisualSlot(["character-1", "character-2"], new Set(["character-1"]))).toEqual({
      allowed: false,
      missingCharacterIds: ["character-2"],
    });
    expect(canGenerateVisualSlot(["character-1"], new Set(["character-1"]))).toEqual({
      allowed: true,
      missingCharacterIds: [],
    });
  });

  test("生成指纹记录实际质量和引用版本", () => {
    const low = visualGenerationFingerprint({ prompt: "A scene", quality: "low", referenceAssetIds: ["b", "a"] });
    const medium = visualGenerationFingerprint({ prompt: "A scene", quality: "medium", referenceAssetIds: ["a", "b"] });
    expect(low).not.toBe(medium);
    expect(medium).toBe(visualGenerationFingerprint({ prompt: " A  scene ", quality: "medium", referenceAssetIds: ["b", "a"] }));
  });

  test("历史人物角色缺少 sourcePersonId 时按课程快照姓名恢复绑定", () => {
    const people = [
      { personId: "teacher-1", chineseName: "孟老师", englishName: "Meng" },
      { personId: "student-1", chineseName: "小夏", englishName: "Summer" },
    ];
    expect(matchCoursePersonForCharacter({ sourcePersonId: null, displayName: "Summer" }, people)?.personId).toBe("student-1");
    expect(matchCoursePersonForCharacter({ sourcePersonId: "teacher-1", displayName: "其他名字" }, people)?.personId).toBe("teacher-1");
  });

  test("批量生成不会重复生成尚未采用的成功版本", () => {
    expect(needsInitialVisualGeneration({ activeAssetId: null, versions: [] })).toBe(true);
    expect(needsInitialVisualGeneration({ activeAssetId: null, versions: [{ status: "submitting" }] })).toBe(false);
    expect(needsInitialVisualGeneration({ activeAssetId: null, versions: [{ status: "generating" }] })).toBe(false);
    expect(needsInitialVisualGeneration({ activeAssetId: null, versions: [{ status: "succeeded" }] })).toBe(false);
    expect(needsInitialVisualGeneration({ activeAssetId: "asset-1", versions: [{ status: "succeeded" }] })).toBe(false);
    expect(hasInFlightVisualVersion([{ status: "failed" }, { status: "submitting" }])).toBe(true);
  });

  test("单张重新生成会创建新版本，但批量生成仍跳过成功图片", () => {
    const succeeded = { id: "slot-1", slotType: "visual_cover", chapterId: null, activeAssetId: "asset-1", versions: [{ status: "succeeded" }] };
    expect(shouldGenerateVisualSlot(succeeded, { scope: "slot", slotId: "slot-1" })).toBe(true);
    expect(shouldGenerateVisualSlot(succeeded, { scope: "all" })).toBe(false);
    expect(shouldGenerateVisualSlot({ ...succeeded, versions: [{ status: "generating" }] }, { scope: "slot", slotId: "slot-1" })).toBe(false);
  });
});
