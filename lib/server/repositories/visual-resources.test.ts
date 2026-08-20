import { describe, expect, test, vi } from "vitest";
import { CourseVisualPlanResponseError } from "@/lib/server/ai/course-visual-plan-deps";
import { adoptLatestPersonVisual, buildCourseImageEditPrompt, generateCourseVisualPlan, generateVisualSlot, getCourseVisualResources, hasUnsyncedCharacterAppearance, recoverStaleCourseImages, refineCourseVisualAsset, saveUploadedCharacterReference, selectCourseVisualAsset, updateCourseVisualSettings, updateCharacterVisualIntent, updateVisualCharacterAppearance } from "./visual-resources";

describe("视觉资源仓储", () => {
  const currentPlan = {
    revision: 1,
    confirmedCoverAssetId: "cover-1",
    coverBrief: {
      schemaVersion: 4,
      mainCharacterIds: [],
      visualStyle: "Bright picture-book art.",
      storyWorld: "A coherent garden world.",
      characterDesigns: [{ characterId: "character-1", visualAnchor: { mode: "description" as const, label: "Original explorer", context: null }, appearanceDescription: "一名身形小巧的原创探险家。", courseAppearance: "深蓝色野外夹克。" }],
      cover: { focus: "Garden", characterIds: [], sceneDescription: "A wide garden cover." },
      shots: [{ paragraphId: "p1", focus: "Adventure", characterIds: ["character-1"], sceneDescription: "The explorer crosses the garden." }],
    },
  };
  test("图片修改 Prompt 只强调本次目标并保护未要求修改的内容", () => {
    const prompt = buildCourseImageEditPrompt("消除画面右侧重复的角色");

    expect(prompt).toContain("本次修改要求：\n消除画面右侧重复的角色");
    expect(prompt).toContain("将修改要求视为最终目标，而不是建议");
    expect(prompt).toContain("不要新增、复制、删除或替换未被要求修改的人物或物体");
  });
  test("只有角色外貌或本课造型变化才提示图片未同步", () => {
    const designs = currentPlan.coverBrief.characterDesigns;
    const prompt = "角色 C01。角色形象：一名身形小巧的原创探险家。本课造型：深蓝色野外夹克。";

    expect(hasUnsyncedCharacterAppearance(prompt, ["character-1"], designs)).toBe(false);
    expect(hasUnsyncedCharacterAppearance(prompt.replace("深蓝色野外夹克。", "旧造型。"), ["character-1"], designs)).toBe(true);
    expect(hasUnsyncedCharacterAppearance(prompt, ["other-character"], designs)).toBe(false);
  });
  test("相同视觉方案请求正在执行时不再次调用 AI", async () => {
    const generate = vi.fn();
    const db = {
      aiGenerationLog: { findUnique: vi.fn(async () => ({ requestId: "same-key", status: "running", inputSnapshot: { mode: "faithful" }, outputSnapshot: null, errorMessage: null })) },
    };

    await expect(generateCourseVisualPlan(db as never, "course-1", "same-key", { generate } as never)).rejects.toThrow("视觉方案请求正在处理中");
    expect(generate).not.toHaveBeenCalled();
  });

  test("相同视觉方案请求已经失败时返回持久化原因，不再次调用 AI", async () => {
    const generate = vi.fn();
    const db = {
      aiGenerationLog: { findUnique: vi.fn(async () => ({ requestId: "same-key", status: "failed", inputSnapshot: { mode: "faithful" }, outputSnapshot: { diagnostics: { kind: "invalid_structure", issues: [{ path: "shots.3", message: "Required" }] } }, errorMessage: "AI 返回的视觉方案内容不完整，请重试" })) },
    };

    await expect(generateCourseVisualPlan(db as never, "course-1", "same-key", { generate } as never)).rejects.toThrow("AI 返回的视觉方案内容不完整，请重试");
    expect(generate).not.toHaveBeenCalled();
  });

  test("视觉方案解析失败会把请求标识和具体字段诊断持久化", async () => {
    const diagnostics = { kind: "invalid_structure" as const, issues: [{ path: "shots.3.sceneDescription", message: "Required", code: "invalid_type" }] };
    const failure = new CourseVisualPlanResponseError(undefined, diagnostics);
    const update = vi.fn(async () => ({}));
    const db = {
      aiGenerationLog: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "operation-1", ...data, outputSnapshot: null, errorMessage: null })),
        update,
      },
      course: { findUnique: vi.fn(async () => ({ id: "course-1" })) },
      courseLessonContent: { findUnique: vi.fn(async () => ({ status: "confirmed", chapters: [], writingProvider: "quickrouter_gpt", sourceRevision: 2, contentVersion: 3 })) },
      courseStoryOutline: { findUnique: vi.fn(async () => ({ title: "Story", summary: "Summary" })) },
      courseCharacter: { findMany: vi.fn(async () => []) },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => null) },
    };
    const generate = vi.fn(async (_input, _provider, onResponse) => {
      await onResponse({ text: "{\"candidate\":true}", usage: { inputTokens: 100, outputTokens: 50, visibleOutputTokens: 40, reasoningTokens: 10, totalTokens: 150 } });
      throw failure;
    });

    await expect(generateCourseVisualPlan(db as never, "course-1", "paid-request-1", { generate } as never)).rejects.toBe(failure);

    expect(db.aiGenerationLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ requestId: "paid-request-1", status: "running" }) });
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "operation-1" },
      data: {
        status: "failed",
        errorMessage: "AI 返回的视觉方案内容不完整，请重试",
        outputSnapshot: {
          rawResponse: "{\"candidate\":true}",
          tokenUsage: { inputTokens: 100, outputTokens: 50, visibleOutputTokens: 40, reasoningTokens: 10, totalTokens: 150 },
          diagnostics,
        },
      },
    });
  });
  test("引用角色缺少资料关联时不调用视觉方案 AI", async () => {
    const generate = vi.fn();
    const db = {
      aiGenerationLog: { findUnique: vi.fn(async () => null) },
      course: { findUnique: vi.fn(async () => ({ id: "course-1" })) },
      courseLessonContent: { findUnique: vi.fn(async () => ({ status: "confirmed", chapters: [], writingProvider: "quickrouter_gpt" })) },
      courseStoryOutline: { findUnique: vi.fn(async () => ({ title: "Jett Story" })) },
      courseCharacter: { findMany: vi.fn(async () => [{ id: "jett", displayName: "Jett", sourceType: "referenced", sourceReference: null }]) },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => null) },
    };

    await expect(generateCourseVisualPlan(db as never, "course-1", "missing-reference", { generate } as never)).rejects.toThrow("引用角色缺少参考资料关联：Jett");
    expect(generate).not.toHaveBeenCalled();
  });
  test("已有原创视觉方案可以再次调整，不要求先恢复忠实模式", async () => {
    const update = vi.fn(async () => ({}));
    const generate = vi.fn(async () => { throw new Error("stop-after-guard"); });
    const db = {
      aiGenerationLog: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "operation-1", ...data, outputSnapshot: null, errorMessage: null })),
        update,
      },
      course: { findUnique: vi.fn(async () => ({ id: "course-1" })) },
      courseLessonContent: { findUnique: vi.fn(async () => ({ status: "confirmed", chapters: [], writingProvider: "quickrouter_gpt", sourceRevision: 2, contentVersion: 3 })) },
      courseStoryOutline: { findUnique: vi.fn(async () => ({ title: "Story", summary: "Summary" })) },
      courseCharacter: { findMany: vi.fn(async () => [{ id: "character-1", displayName: "捷特", englishName: "Jett", sourceType: "referenced", shouldAppearInImages: true, roleInStory: "hero", sourceReference: { name: "VALORANT", type: "game_character", summary: "Referenced agent." } }]) },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => ({ ...currentPlan, mode: "originalized" })) },
    };

    await expect(generateCourseVisualPlan(db as never, "course-1", "adjust-originalized", { generate } as never, "originalized")).rejects.toThrow("stop-after-guard");

    expect(generate).toHaveBeenCalledOnce();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }));
  });
  test("过期的图片生成租约会恢复为可重试失败而不是永久生成中", async () => {
    const updateMany = vi.fn(async () => ({ count: 2 }));
    const db = { courseImage: { updateMany } };
    const now = new Date("2026-08-15T10:00:00.000Z");

    await recoverStaleCourseImages(db as never, "course-1", now);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        courseId: "course-1",
        status: { in: ["pending", "submitting", "generating"] },
        OR: [
          { leaseExpiresAt: { lte: now } },
          { startedAt: { lte: new Date("2026-08-15T09:48:00.000Z") } },
        ],
      },
      data: {
        status: "failed",
        failureCode: "retryable",
        failureReason: "上次图片生成已中断或超时，请重试",
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
  });
  test("课程视觉设置只影响后续请求", async () => {
    const update = vi.fn(async () => ({ visualQuality: "high", imageGenerationConcurrency: 4 }));
    const db = { course: { findUnique: vi.fn(async () => ({ id: "course-1" })), update } };
    await updateCourseVisualSettings(db as never, "course-1", { quality: "high", imageGenerationConcurrency: 4 });
    expect(update).toHaveBeenCalledWith({ where: { id: "course-1" }, data: { visualQuality: "high", imageGenerationConcurrency: 4 }, select: { visualQuality: true, imageGenerationConcurrency: true } });
  });

  test("高级编辑更新中文角色形象和本课造型，但保留当前图片和封面确认", async () => {
    const planUpdate = vi.fn(async () => ({}));
    const slotUpdate = vi.fn(async () => ({ count: 2 }));
    const confirmationUpdate = vi.fn(async () => ({ count: 1 }));
    const db = {
      courseCharacter: { findFirst: vi.fn(async () => ({ id: "character-1", sourceType: "original" })) },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => currentPlan), update: planUpdate, updateMany: confirmationUpdate },
      courseVisualImageSlot: {
        findMany: vi.fn(async () => [
          { id: "cover-slot", slotType: "visual_cover", characterIds: ["character-1"] },
          { id: "other-slot", slotType: "lesson_shot", characterIds: ["other"] },
        ]),
        updateMany: slotUpdate,
      },
    };

    await updateVisualCharacterAppearance(db as never, "course-1", "character-1", {
      appearanceDescription: "一名戴银色铃铛的原创探险家。",
      courseAppearance: "深蓝色野外夹克和棕色短靴。",
    });

    expect(planUpdate).toHaveBeenCalledWith({
      where: { courseId: "course-1" },
      data: { coverBrief: expect.objectContaining({ characterDesigns: [expect.objectContaining({
        characterId: "character-1",
        appearanceDescription: "一名戴银色铃铛的原创探险家。",
        courseAppearance: "深蓝色野外夹克和棕色短靴。",
      })] }) },
    });
    expect(slotUpdate).not.toHaveBeenCalled();
    expect(confirmationUpdate).not.toHaveBeenCalled();
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
    const slotUpdateMany = vi.fn(async () => ({ count: 1 }));
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
      courseVisualImageSlot: {
        findMany: vi.fn(async () => [
          { id: "cover-slot", characterIds: ["character-1"] },
          { id: "other-slot", characterIds: ["character-2"] },
        ]),
        updateMany: slotUpdateMany,
      },
      courseVisualResourcePlan: { updateMany: vi.fn(async () => ({ count: 1 })) },
    };

    await adoptLatestPersonVisual(db as never, "course-1", "character-1");

    expect(characterUpdate).toHaveBeenCalledWith({ where: { id: "character-1" }, data: { sourcePersonId: "student-1" } });
    expect(personSnapshotUpdate).toHaveBeenCalledWith({ where: { courseId_personId: { courseId: "course-1", personId: "student-1" } }, data: { visualAssetIdSnapshot: "person-asset-1" } });
    expect(visualUpsert).toHaveBeenCalled();
    expect(slotUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ["cover-slot"] } }, data: { activeImageId: null } });
  });

  test("图片槽已有服务端生成任务时不再创建或调用第二次生图", async () => {
    const runningAsset = { id: "asset-running", courseId: "course-1", slotId: "slot-1", status: "submitting" };
    const upsert = vi.fn();
    const edit = vi.fn();
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseVisualImageSlot: { findFirst: vi.fn(async () => ({ id: "slot-1", courseId: "course-1", slotType: "lesson_shot", paragraphId: "p1", prompt: "scene", characterIds: ["character-1"] })) },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => currentPlan) },
      courseCharacter: { findFirst: vi.fn(async () => ({ id: "character-1", sourceType: "original", displayName: "角色", englishName: "Character" })) },
      courseCharacterVisual: { findUnique: vi.fn(async () => ({ activeImage: { id: "reference-1", storagePath: "reference.webp" } })) },
      courseImage: { findFirst: vi.fn(async () => runningAsset), updateMany: vi.fn(async () => ({ count: 0 })), upsert },
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
    const generate = vi.fn(async (input: { prompt: string; quality: "low" | "medium" | "high"; portrait?: boolean }) => {
      void input;
      return { imageUrl: "data:image/png;base64,aGVsbG8=", model: "gpt-image-2-c", quality: "high" as const };
    });
    const edit = vi.fn();
    const asset = { id: "asset-1", courseId: "course-1", slotId: "slot-1", characterVisualId: null, prompt: "English scene prompt", quality: "medium", planRevision: 1, status: "pending", providerImageUrl: null, temporarySourcePath: null };
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseVisualImageSlot: { findFirst: vi.fn(async () => ({ id: "slot-1", courseId: "course-1", slotType: "lesson_shot", paragraphId: "p1", prompt: asset.prompt, characterIds: ["character-1"] })), update: slotUpdate },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => currentPlan), update: vi.fn() },
      courseCharacter: { findFirst: vi.fn(async () => ({ id: "character-1", sourceType: "original", displayName: "原创角色", englishName: "Original Character" })) },
      courseCharacterVisual: { findUnique: vi.fn(async () => null), update: vi.fn() },
      courseImage: {
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => ({ ...asset, status: "succeeded" })),
        upsert: vi.fn(async ({ create }) => ({ ...asset, ...create })),
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

    expect(generate.mock.calls[0]?.[0].prompt).toContain("一名身形小巧的原创探险家");
    expect(generate.mock.calls[0]?.[0].prompt).toContain("原创角色 / Original Character");
    expect(generate.mock.calls[0]?.[0].prompt).toContain("never crop a head or face");
    expect(edit).not.toHaveBeenCalled();
    expect(db.courseImage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "succeeded", quality: "high", sourceHash: expect.any(String) }),
    }));
    expect(slotUpdate).toHaveBeenCalledWith({ where: { id: "slot-1" }, data: { activeImageId: "asset-1" } });
  });

  test("远端图片已生成但保存失败时，重新生成只恢复旧 URL 而不再次调用 AI", async () => {
    const recoveredAsset = {
      id: "asset-recoverable",
      courseId: "course-1",
      slotId: "slot-1",
      characterVisualId: null,
      prompt: "",
      quality: "medium",
      referenceAssetIds: [],
      planRevision: 1,
      status: "failed",
      failureCode: "storage_recoverable",
      providerImageUrl: "https://media.example.com/generated.png",
      temporarySourcePath: null,
    };
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async ({ where }) => ({ ...recoveredAsset, sourceHash: where.sourceHash }));
    const findUnique = vi.fn(async () => ({ ...recoveredAsset, status: "succeeded", storagePath: "course-images/course-1/asset-recoverable.webp", publicUrl: "/api/course-images/course-1/asset-recoverable.webp" }));
    const generate = vi.fn();
    const edit = vi.fn();
    const persist = vi.fn(async ({ sourceUrl }) => {
      expect(sourceUrl).toBe(recoveredAsset.providerImageUrl);
      return { storagePath: "course-images/course-1/asset-recoverable.webp", publicUrl: "/api/course-images/course-1/asset-recoverable.webp" };
    });
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseVisualImageSlot: { findFirst: vi.fn(async () => ({ id: "slot-1", courseId: "course-1", slotType: "visual_cover", paragraphId: null, characterIds: [] })), update: vi.fn(async () => ({})) },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => currentPlan), update: vi.fn() },
      courseImage: { findFirst, findUnique, updateMany: vi.fn(async () => ({ count: 1 })), upsert: vi.fn() },
    };

    const result = await generateVisualSlot(db as never, "course-1", "slot-1", "new-retry-key", {
      generate,
      edit,
      persist,
      composeReferences: vi.fn(),
      removeTemporarySource: vi.fn(),
    });

    expect(result?.id).toBe(recoveredAsset.id);
    expect(persist).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
    expect(db.courseImage.upsert).not.toHaveBeenCalled();
  });

  test("历史可恢复失败之后已有更新版本时，重新生成不会恢复旧图片", async () => {
    const latestSucceeded = { id: "asset-latest", status: "succeeded", failureCode: null, providerImageUrl: "https://media.example.com/latest.png" };
    const pending = { id: "asset-new", courseId: "course-1", slotId: "slot-1", characterVisualId: null, prompt: "", quality: "medium", referenceAssetIds: [], planRevision: 1, status: "pending", providerImageUrl: null, temporarySourcePath: null };
    const generate = vi.fn(async () => ({ imageUrl: "data:image/png;base64,aGVsbG8=", quality: "medium" as const }));
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseVisualImageSlot: { findFirst: vi.fn(async () => ({ id: "slot-1", courseId: "course-1", slotType: "visual_cover", paragraphId: null, characterIds: [] })), update: vi.fn(async () => ({})) },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => currentPlan), update: vi.fn() },
      courseImage: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(latestSucceeded),
        findUnique: vi.fn(async () => ({ ...pending, status: "succeeded" })),
        upsert: vi.fn(async ({ create }) => ({ ...pending, ...create })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    await generateVisualSlot(db as never, "course-1", "slot-1", "new-generation-key", {
      generate,
      edit: vi.fn(),
      persist: vi.fn(async () => ({ storagePath: "new.webp", publicUrl: "/new.webp" })),
      composeReferences: vi.fn(),
      removeTemporarySource: vi.fn(),
    });

    expect(generate).toHaveBeenCalledOnce();
    expect(db.courseImage.upsert).toHaveBeenCalledOnce();
  });

  test("AI 已返回远端 URL 但下载超时时，向前端说明图片已生成且可以恢复保存", async () => {
    const pending = { id: "asset-remote", courseId: "course-1", slotId: "slot-1", characterVisualId: null, prompt: "", quality: "medium", referenceAssetIds: [], planRevision: 1, status: "pending", providerImageUrl: null, temporarySourcePath: null };
    const failedUpdate = vi.fn(async () => ({ count: 1 }));
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseVisualImageSlot: { findFirst: vi.fn(async () => ({ id: "slot-1", courseId: "course-1", slotType: "visual_cover", paragraphId: null, characterIds: [] })), update: vi.fn() },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => currentPlan), update: vi.fn() },
      courseImage: {
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async ({ create }) => ({ ...pending, ...create })),
        updateMany: failedUpdate,
      },
    };

    await expect(generateVisualSlot(db as never, "course-1", "slot-1", "remote-timeout", {
      generate: vi.fn(async () => ({ imageUrl: "https://media.example.com/generated.png", quality: "medium" as const })),
      edit: vi.fn(),
      persist: vi.fn(async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }),
      composeReferences: vi.fn(),
      removeTemporarySource: vi.fn(),
    })).rejects.toThrow("图片已生成，但下载或保存失败：下载远端图片超时");

    expect(failedUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        providerImageUrl: "https://media.example.com/generated.png",
        failureCode: "storage_recoverable",
        failureReason: "图片已生成，但下载或保存失败：下载远端图片超时",
      }),
    }));
  });

  test("原创化引用角色不再向图片模型传入旧 IP 参考图或原作名称", async () => {
    const originalPlan = {
      ...currentPlan,
      mode: "originalized",
      coverBrief: {
        ...currentPlan.coverBrief,
        characterDesigns: [{ characterId: "character-1", visualAnchor: { mode: "description" as const, label: "Sky Runner", context: null }, appearanceDescription: "银白短发，佩戴青色护目镜。", courseAppearance: "青色夹克、深灰长裤和白色短靴。" }],
        shots: [{ paragraphId: "p1", focus: "Open the path", characterIds: ["character-1"], sceneDescription: "Sky Runner opens an air path." }],
      },
    };
    const generatedAsset = { id: "asset-originalized", courseId: "course-1", slotId: "slot-1", characterVisualId: null, prompt: "", quality: "medium", planRevision: 1, status: "pending", providerImageUrl: null, temporarySourcePath: null };
    const generate = vi.fn(async (input: { prompt: string; quality: "low" | "medium" | "high"; portrait?: boolean }) => {
      void input;
      return { imageUrl: "data:image/png;base64,aGVsbG8=", quality: "high" as const };
    });
    const edit = vi.fn();
    const composeReferences = vi.fn();
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseVisualImageSlot: { findFirst: vi.fn(async () => ({ id: "slot-1", courseId: "course-1", slotType: "lesson_shot", paragraphId: "p1", characterIds: ["character-1"] })), update: vi.fn(async () => ({})) },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => originalPlan), update: vi.fn() },
      courseCharacter: { findFirst: vi.fn(async () => ({ id: "character-1", sourceType: "referenced", displayName: "捷特", englishName: "Jett" })) },
      courseCharacterVisual: { findUnique: vi.fn(async () => ({ activeImage: { id: "old-ip-reference", storagePath: "jett.webp" } })), update: vi.fn() },
      courseImage: {
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => ({ ...generatedAsset, status: "succeeded" })),
        upsert: vi.fn(async ({ create }) => ({ ...generatedAsset, ...create })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    await generateVisualSlot(db as never, "course-1", "slot-1", "originalized-key", {
      generate,
      edit,
      persist: vi.fn(async () => ({ storagePath: "originalized.webp", publicUrl: "/originalized.webp" })),
      composeReferences,
      removeTemporarySource: vi.fn(),
    });

    expect(generate).toHaveBeenCalledOnce();
    expect(edit).not.toHaveBeenCalled();
    expect(composeReferences).not.toHaveBeenCalled();
    expect(generate.mock.calls[0]?.[0].prompt).toContain("C01 — Sky Runner");
    expect(generate.mock.calls[0]?.[0].prompt).not.toContain("Jett");
    expect(generate.mock.calls[0]?.[0].prompt).not.toContain("捷特");
  });

  test("原创化方案页面预览与实际生图都使用新视觉名称", async () => {
    const originalPlan = {
      ...currentPlan,
      mode: "originalized",
      coverBrief: {
        ...currentPlan.coverBrief,
        mainCharacterIds: ["character-1"],
        characterDesigns: [{ characterId: "character-1", visualAnchor: { mode: "description" as const, label: "Sky Runner", context: null }, appearanceDescription: "银白短发，佩戴青色护目镜。", courseAppearance: "青色夹克、深灰长裤和白色短靴。" }],
        cover: { focus: "Open the path", characterIds: ["character-1"], sceneDescription: "Sky Runner opens an air path." },
      },
    };
    const db = {
      course: { findUnique: vi.fn(async () => ({ id: "course-1", title: "Story", currentStage: "visual_resources", visualQuality: "medium", imageGenerationConcurrency: 3 })) },
      courseImage: { updateMany: vi.fn(async () => ({ count: 0 })) },
      courseCharacter: { findMany: vi.fn(async () => [{ id: "character-1", displayName: "捷特", englishName: "Jett", sourceType: "referenced", sourcePersonId: null, shouldAppearInImages: true, roleInStory: "hero", sourceReference: { name: "VALORANT", type: "game_character" } }]) },
      courseCharacterVisual: { findMany: vi.fn(async () => [{ characterId: "character-1", activeImageId: null, activeImage: null, images: [], intent: "originalize", source: null, status: "ready" }]) },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => originalPlan) },
      courseVisualImageSlot: { findMany: vi.fn(async () => [{ id: "cover-slot", stableKey: "visual-cover", slotType: "visual_cover", chapterId: null, paragraphId: null, sourceText: "Story", characterIds: ["character-1"], focus: "Open the path", sceneDescription: "Sky Runner opens an air path.", prompt: "stored", activeImageId: null, activeImage: null, images: [] }]) },
      coursePerson: { findMany: vi.fn(async () => []) },
      courseLessonContent: { findUnique: vi.fn(async () => ({ chapters: [] })) },
    };

    const state = await getCourseVisualResources(db as never, "course-1");

    expect(state.imageGenerationConcurrency).toBe(3);
    expect(state.slots[0]?.prompt).toContain("C01 — Sky Runner");
    expect(state.slots[0]?.prompt).not.toContain("Jett");
    expect(state.slots[0]?.prompt).not.toContain("捷特");
  });

  test("封面未确认时服务端阻断章节图片生成", async () => {
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseVisualImageSlot: { findFirst: vi.fn(async () => ({ id: "slot-1", courseId: "course-1", slotType: "lesson_shot", paragraphId: "p1", characterIds: [] })) },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => ({ ...currentPlan, confirmedCoverAssetId: null })) },
    };
    await expect(generateVisualSlot(db as never, "course-1", "slot-1", "key", {
      generate: vi.fn(), edit: vi.fn(), persist: vi.fn(), composeReferences: vi.fn(), removeTemporarySource: vi.fn(),
    })).rejects.toThrow("请先确认视觉封面");
  });

  test("安全策略拦截写入结构化失败码且不原样吞掉", async () => {
    const failedUpdate = vi.fn(async () => ({ count: 1 }));
    const pending = { id: "cover-asset", courseId: "course-1", slotId: "cover-slot", characterVisualId: null, prompt: "", quality: "medium", planRevision: 1, status: "pending", providerImageUrl: null, temporarySourcePath: null };
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseVisualImageSlot: { findFirst: vi.fn(async () => ({ id: "cover-slot", courseId: "course-1", slotType: "visual_cover", paragraphId: null, characterIds: [] })), update: vi.fn() },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => currentPlan), update: vi.fn() },
      courseImage: {
        findFirst: vi.fn(async () => null),
        upsert: vi.fn(async ({ create }) => ({ ...pending, ...create })),
        updateMany: failedUpdate,
      },
    };
    await expect(generateVisualSlot(db as never, "course-1", "cover-slot", "key", {
      generate: vi.fn(async () => { throw new Error("blocked by content policy"); }), edit: vi.fn(), persist: vi.fn(), composeReferences: vi.fn(), removeTemporarySource: vi.fn(),
    })).rejects.toThrow("blocked by content policy");
    expect(failedUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ failureCode: "policy_blocked", status: "failed" }) }));
  });

  test("上传外形参考只持久化原图，不调用图片模型，并自动设为当前参考", async () => {
    const visualUpdate = vi.fn(async () => ({}));
    const asset = { id: "asset-ref", courseId: "course-1", slotId: null, characterVisualId: "visual-1", prompt: "Identity appearance reference", quality: "low", status: "pending", providerImageUrl: null, temporarySourcePath: "tmp.webp" };
    const imageUpsert = vi.fn(async ({ create }) => ({ ...asset, ...create }));
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "high" })) },
      courseCharacter: { findFirst: vi.fn(async () => ({ id: "character-1", sourceType: "referenced", displayName: "外部人物" })) },
      courseCharacterVisual: {
        upsert: vi.fn(async () => ({ id: "visual-1", intent: "preserve_identity" })),
        update: visualUpdate,
      },
      courseImage: {
        upsert: imageUpsert,
        update: vi.fn(async ({ data }) => ({ ...asset, ...data })),
      },
      courseVisualImageSlot: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) },
      courseVisualResourcePlan: { updateMany: vi.fn(async () => ({ count: 1 })) },
    };
    const persist = vi.fn(async () => ({ storagePath: "reference.webp", publicUrl: "/reference.webp" }));

    await saveUploadedCharacterReference(db as never, "course-1", "character-1", "key-1", {
      temporarySourcePath: "tmp.webp",
      sourceDataUrl: "data:image/webp;base64,aGVsbG8=",
    }, { persist });

    expect(persist).toHaveBeenCalled();
    expect(imageUpsert.mock.calls[0]?.[0].create.quality).toBe("low");
    expect(visualUpdate).toHaveBeenCalledWith({ where: { id: "visual-1" }, data: { activeImageId: "asset-ref", source: "uploaded_reference", status: "ready" } });
  });

  test("人物外形版本修改固定使用 low，不读取课程画面质量", async () => {
    const parent = { id: "person-shape", courseId: "course-1", slotId: null, characterVisualId: "visual-1", prompt: "character prompt", quality: "low", planRevision: 1, status: "succeeded", storagePath: "person.webp", providerImageUrl: null, temporarySourcePath: null };
    const revision = { ...parent, id: "person-revision", parentAssetId: parent.id, status: "pending" };
    const edit = vi.fn(async (input: { prompt: string; quality: "low" | "medium" | "high"; imageDataUrl: string; portrait?: boolean }) => {
      void input;
      return { imageUrl: "data:image/png;base64,aGVsbG8=" };
    });
    const imageUpsert = vi.fn(async ({ create }) => ({ ...revision, ...create }));
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "high" })) },
      courseImage: { findFirst: vi.fn(async () => parent), findUnique: vi.fn(async () => revision), upsert: imageUpsert, updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async ({ data }) => ({ ...revision, ...data })) },
      courseVisualImageSlot: { findUnique: vi.fn(), update: vi.fn() },
      courseCharacterVisual: { update: vi.fn(async () => ({})) },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => null) },
    };

    await refineCourseVisualAsset(db as never, "course-1", parent.id, "change hairstyle", "key-person-refine", {
      generate: vi.fn(), edit,
      persist: vi.fn(async () => ({ storagePath: "person-new.webp", publicUrl: "/person-new.webp" })),
      composeReferences: vi.fn(async () => "data:image/webp;base64,aGVsbG8=",
      ),
      removeTemporarySource: vi.fn(),
    });

    expect(imageUpsert.mock.calls[0]?.[0].create.quality).toBe("low");
    expect(edit.mock.calls[0]?.[0].quality).toBe("low");
  });

  test("编辑图片只提交原图和本次修改要求，不混入完整旧 Prompt 或角色参考图", async () => {
    const parent = { id: "old-cover", courseId: "course-1", slotId: "slot-1", characterVisualId: null, prompt: "旧中文提示词", quality: "medium", planRevision: 1, status: "succeeded", storagePath: "old.webp", providerImageUrl: null, temporarySourcePath: null };
    const revision = { ...parent, id: "revision-1", parentAssetId: parent.id, prompt: "new prompt", status: "pending" };
    const edit = vi.fn(async (input: { prompt: string; quality: "low" | "medium" | "high"; imageDataUrl: string; portrait?: boolean }) => {
      void input;
      return { imageUrl: "data:image/png;base64,aGVsbG8=" };
    });
    const composeReferences = vi.fn(async () => "data:image/webp;base64,aGVsbG8=");
    const imageUpsert = vi.fn(async ({ create }) => ({ ...revision, ...create }));
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseImage: { findFirst: vi.fn(async () => parent), findUnique: vi.fn(async () => revision), upsert: imageUpsert, updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async ({ data }) => ({ ...revision, ...data })) },
      courseVisualImageSlot: { findUnique: vi.fn(async () => ({ id: "slot-1", slotType: "visual_cover", paragraphId: null, prompt: "legacy prompt", characterIds: [] })), update: vi.fn(async () => ({ slotType: "visual_cover" })) },
      courseCharacterVisual: { update: vi.fn(async () => ({})) },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => currentPlan), update: vi.fn(async () => ({})) },
    };

    await refineCourseVisualAsset(db as never, "course-1", parent.id, "make the scene brighter", "key-refine", {
      generate: vi.fn(), edit,
      persist: vi.fn(async () => ({ storagePath: "new.webp", publicUrl: "/new.webp" })),
      composeReferences,
      removeTemporarySource: vi.fn(),
    });

    const submittedPrompt = edit.mock.calls[0]![0].prompt;
    expect(submittedPrompt).toContain("make the scene brighter");
    expect(submittedPrompt).toContain("除本次要求必然影响的内容外");
    expect(submittedPrompt).not.toContain("Bright picture-book art");
    expect(submittedPrompt).not.toContain("旧中文提示词");
    expect(composeReferences).toHaveBeenCalledWith(["old.webp"]);
    expect(imageUpsert.mock.calls[0]?.[0].create.referenceAssetIds).toEqual(["old-cover"]);
  });

  test("修改图片已经成功但采用状态丢失时，同一请求会修复当前图片而不再次生图", async () => {
    const parent = { id: "cover-old", courseId: "course-1", slotId: "slot-1", characterVisualId: null, prompt: "old prompt", quality: "medium", planRevision: 1, status: "succeeded", storagePath: "old.webp", providerImageUrl: null, temporarySourcePath: null };
    const succeeded = { ...parent, id: "cover-new", parentAssetId: parent.id, operation: "revision", status: "succeeded", storagePath: "new.webp" };
    const slotUpdate = vi.fn(async () => ({ slotType: "visual_cover" }));
    const planUpdate = vi.fn(async () => ({}));
    const db = {
      course: { findUnique: vi.fn(async () => ({ visualQuality: "medium" })) },
      courseImage: { findFirst: vi.fn(async () => parent), upsert: vi.fn(async () => succeeded) },
      courseVisualImageSlot: { findUnique: vi.fn(async () => ({ id: "slot-1", slotType: "visual_cover", paragraphId: null, characterIds: [] })), update: slotUpdate },
      courseVisualResourcePlan: { findUnique: vi.fn(async () => currentPlan), update: planUpdate },
      courseCharacterVisual: { update: vi.fn() },
    };
    const edit = vi.fn();

    await refineCourseVisualAsset(db as never, "course-1", parent.id, "make it brighter", "same-success-key", {
      generate: vi.fn(), edit, persist: vi.fn(), composeReferences: vi.fn(), removeTemporarySource: vi.fn(),
    });

    expect(edit).not.toHaveBeenCalled();
    expect(slotUpdate).toHaveBeenCalledWith({ where: { id: "slot-1" }, data: { activeImageId: "cover-new" } });
    expect(planUpdate).toHaveBeenCalledWith({ where: { courseId: "course-1" }, data: { confirmedCoverAssetId: null } });
  });
});
