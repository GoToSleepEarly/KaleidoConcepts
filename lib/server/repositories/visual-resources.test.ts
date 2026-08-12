import { describe, expect, test, vi } from "vitest";
import { adoptLatestPersonVisual, generateVisualSlot, refineCourseVisualAsset, saveUploadedCharacterReference, selectCourseVisualAsset, updateCourseVisualQuality, updateCharacterVisualIntent } from "./visual-resources";

describe("视觉资源仓储", () => {
  test("课程画面质量只影响后续请求", async () => {
    const update = vi.fn(async () => ({ visualQuality: "high" }));
    const db = { course: { findUnique: vi.fn(async () => ({ id: "course-1" })), update } };
    await updateCourseVisualQuality(db as never, "course-1", "high");
    expect(update).toHaveBeenCalledWith({ where: { id: "course-1" }, data: { visualQuality: "high" } });
  });

  test("只有 referenced 角色可以切换保持原形象或课堂原创化", async () => {
    const upsert = vi.fn(async () => ({ id: "visual-1" }));
    const db = {
      courseCharacter: { findFirst: vi.fn(async () => ({ id: "character-1", sourceType: "original" })) },
      courseCharacterVisual: { upsert },
    };
    await expect(updateCharacterVisualIntent(db as never, "course-1", "character-1", "preserve_identity")).rejects.toThrow("只有外部引用角色");
    expect(upsert).not.toHaveBeenCalled();
  });

  test("历史成功版本可以手动回退，失败版本不能成为当前版本", async () => {
    const slotUpdate = vi.fn(async () => ({}));
    const baseDb = {
      courseImage: { findFirst: vi.fn(async () => ({ id: "asset-1", courseId: "course-1", slotId: "slot-1", characterVisualId: null, status: "failed" })) },
      courseVisualImageSlot: { update: slotUpdate },
      courseCharacterVisual: { update: vi.fn(async () => ({})) },
    };
    await expect(selectCourseVisualAsset(baseDb as never, "course-1", "asset-1")).rejects.toThrow("只能采用生成成功");
    expect(slotUpdate).not.toHaveBeenCalled();

    baseDb.courseImage.findFirst.mockResolvedValueOnce({ id: "asset-1", courseId: "course-1", slotId: "slot-1", characterVisualId: null, status: "succeeded" });
    await selectCourseVisualAsset(baseDb as never, "course-1", "asset-1");
    expect(slotUpdate).toHaveBeenCalledWith({ where: { id: "slot-1" }, data: { activeImageId: "asset-1" } });
  });

  test("历史人物角色缺少 sourcePersonId 时按姓名修复绑定并同步最新形象", async () => {
    const characterUpdate = vi.fn(async () => ({}));
    const personSnapshotUpdate = vi.fn(async () => ({}));
    const visualUpsert = vi.fn(async () => ({ id: "visual-1" }));
    const db = {
      courseCharacter: {
        findFirst: vi.fn(async () => ({ id: "character-1", displayName: "Summer", sourceType: "person", sourcePersonId: null })),
        update: characterUpdate,
      },
      coursePerson: {
        findMany: vi.fn(async () => [{ personId: "student-1", chineseNameSnapshot: "小夏", englishNameSnapshot: "Summer" }]),
        update: personSnapshotUpdate,
      },
      person: { findUnique: vi.fn(async () => ({ activeVisualAssetId: "person-asset-1", activeVisualAsset: { id: "person-asset-1", status: "succeeded" } })) },
      courseCharacterVisual: { upsert: visualUpsert },
    };

    await adoptLatestPersonVisual(db as never, "course-1", "character-1");

    expect(characterUpdate).toHaveBeenCalledWith({ where: { id: "character-1" }, data: { sourcePersonId: "student-1" } });
    expect(personSnapshotUpdate).toHaveBeenCalledWith({ where: { courseId_personId: { courseId: "course-1", personId: "student-1" } }, data: { visualAssetIdSnapshot: "person-asset-1" } });
    expect(visualUpsert).toHaveBeenCalled();
  });

  test("图片槽已有服务端生成任务时不再创建或调用第二次生图", async () => {
    const runningAsset = { id: "asset-running", courseId: "course-1", slotId: "slot-1", status: "submitting" };
    const upsert = vi.fn();
    const edit = vi.fn();
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseVisualImageSlot: { findFirst: vi.fn(async () => ({ id: "slot-1", courseId: "course-1", prompt: "scene", characterIds: ["character-1"] })) },
      courseCharacter: { findFirst: vi.fn(async () => ({ id: "character-1", sourceType: "original", displayName: "角色" })) },
      courseCharacterVisual: { findUnique: vi.fn(async () => ({ activeImage: { id: "reference-1", storagePath: "reference.webp" } })) },
      courseImage: { findFirst: vi.fn(async () => runningAsset), upsert },
    };

    const result = await generateVisualSlot(db as never, "course-1", "slot-1", "new-key", {
      edit,
      generate: vi.fn(),
      persist: vi.fn(),
      composeReferences: vi.fn(),
      removeTemporarySource: vi.fn(),
    });

    expect(result).toBe(runningAsset);
    expect(upsert).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  test("原创角色不需要中间基准图，场景成功后自动采用", async () => {
    const slotUpdate = vi.fn(async () => ({}));
    const generate = vi.fn(async () => ({ imageUrl: "data:image/png;base64,aGVsbG8=" }));
    const edit = vi.fn();
    const asset = { id: "asset-1", courseId: "course-1", slotId: "slot-1", characterVisualId: null, prompt: "English scene prompt", quality: "medium", status: "pending", providerImageUrl: null, temporarySourcePath: null };
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseVisualImageSlot: { findFirst: vi.fn(async () => ({ id: "slot-1", courseId: "course-1", prompt: asset.prompt, characterIds: ["character-1"] })), update: slotUpdate },
      courseCharacter: { findFirst: vi.fn(async () => ({ id: "character-1", sourceType: "original", displayName: "原创角色" })) },
      courseCharacterVisual: { findUnique: vi.fn(async () => null), update: vi.fn() },
      courseImage: {
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => asset),
        upsert: vi.fn(async () => asset),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async ({ data }) => ({ ...asset, ...data })),
      },
    };

    await generateVisualSlot(db as never, "course-1", "slot-1", "key-1", {
      generate,
      edit,
      persist: vi.fn(async () => ({ storagePath: "scene.webp", publicUrl: "/scene.webp" })),
      composeReferences: vi.fn(),
      removeTemporarySource: vi.fn(),
    });

    expect(generate).toHaveBeenCalledWith({ prompt: asset.prompt, quality: "medium", portrait: undefined });
    expect(edit).not.toHaveBeenCalled();
    expect(slotUpdate).toHaveBeenCalledWith({ where: { id: "slot-1" }, data: { activeImageId: "asset-1" } });
  });

  test("上传外形参考只持久化原图，不调用图片模型，并自动设为当前参考", async () => {
    const visualUpdate = vi.fn(async () => ({}));
    const asset = { id: "asset-ref", courseId: "course-1", slotId: null, characterVisualId: "visual-1", prompt: "Identity appearance reference", quality: "medium", status: "pending", providerImageUrl: null, temporarySourcePath: "tmp.webp" };
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseCharacter: { findFirst: vi.fn(async () => ({ id: "character-1", sourceType: "referenced", displayName: "外部人物" })) },
      courseCharacterVisual: {
        upsert: vi.fn(async () => ({ id: "visual-1", intent: "preserve_identity" })),
        update: visualUpdate,
      },
      courseImage: {
        upsert: vi.fn(async () => asset),
        update: vi.fn(async ({ data }) => ({ ...asset, ...data })),
      },
    };
    const persist = vi.fn(async () => ({ storagePath: "reference.webp", publicUrl: "/reference.webp" }));

    await saveUploadedCharacterReference(db as never, "course-1", "character-1", "key-1", {
      temporarySourcePath: "tmp.webp",
      sourceDataUrl: "data:image/webp;base64,aGVsbG8=",
    }, { persist });

    expect(persist).toHaveBeenCalled();
    expect(visualUpdate).toHaveBeenCalledWith({ where: { id: "visual-1" }, data: { activeImageId: "asset-ref", source: "uploaded_reference", status: "ready" } });
  });

  test("更新资源方案后编辑旧图片会使用槽位中的最新英文 Prompt", async () => {
    const parent = { id: "old-cover", courseId: "course-1", slotId: "slot-1", characterVisualId: null, prompt: "旧中文提示词", quality: "medium", status: "succeeded", storagePath: "old.webp", providerImageUrl: null, temporarySourcePath: null };
    const revision = { ...parent, id: "revision-1", parentAssetId: parent.id, prompt: "new prompt", status: "pending" };
    const edit = vi.fn(async (input: { prompt: string; quality: "low" | "medium" | "high"; imageDataUrl: string; portrait?: boolean }) => {
      void input;
      return { imageUrl: "data:image/png;base64,aGVsbG8=" };
    });
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseImage: { findFirst: vi.fn(async () => parent), upsert: vi.fn(async ({ create }) => ({ ...revision, ...create })), updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async ({ data }) => ({ ...revision, ...data })) },
      courseVisualImageSlot: { findUnique: vi.fn(async () => ({ id: "slot-1", prompt: "GPT Image 2 prompt: Horizontal 16:9 NEW VISUAL BIBLE", characterIds: [] })), update: vi.fn(async () => ({})) },
      courseCharacterVisual: { update: vi.fn(async () => ({})) },
    };

    await refineCourseVisualAsset(db as never, "course-1", parent.id, "make the scene brighter", "key-refine", {
      generate: vi.fn(), edit,
      persist: vi.fn(async () => ({ storagePath: "new.webp", publicUrl: "/new.webp" })),
      composeReferences: vi.fn(async () => "data:image/webp;base64,aGVsbG8="),
      removeTemporarySource: vi.fn(),
    });

    const submittedPrompt = edit.mock.calls[0]![0].prompt;
    expect(submittedPrompt).toContain("GPT Image 2 prompt: Horizontal 16:9 NEW VISUAL BIBLE");
    expect(submittedPrompt).not.toContain("旧中文提示词");
  });
});
