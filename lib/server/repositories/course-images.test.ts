import { describe, expect, test } from "vitest";

import type { CourseResourcePlan, LessonDraft } from "@/lib/contracts/api";

import {
  assertResourcePlanValid,
  createCoverImage,
  CourseImageInvalidStateError,
  createMissingCourseImages,
  deriveResourceImageSlots,
  generateCourseImage,
  getCourseResources,
  summarizeResourceProgress,
  type CourseImageGenerationDeps,
  type CourseImageRecord,
  type CourseImagesDb,
} from "./course-images";

const draft: LessonDraft = {
  schemaVersion: "lesson_content_v1",
  sourceStoryOptionId: "option-1",
  generationMode: "ai",
  title: "The Forest Gate",
  language: "en",
  castAliases: [{ alias: "SummerStudent", displayName: "Summer" }],
  closingReading: {
    title: "After the Forest Gate",
    sentences: ["Summer remembered the clues."],
    vocabularyTerms: ["gate"],
  },
  chapters: [
    {
      id: "chapter-1",
      sourceOutlineChapterIndex: 1,
      title: "The Gate Opens",
      paragraphs: [
        {
          id: "chapter-1-paragraph-1",
          order: 1,
          sentences: [
            { id: "c1s1", text: "Summer walked into the forest.", segments: [{ type: "text", text: "Summer walked into the forest." }] },
            { id: "c1s2", text: "A silver gate shone near the river.", segments: [{ type: "text", text: "A silver gate shone near the river." }] },
          ],
        },
        {
          id: "chapter-1-paragraph-2",
          order: 2,
          sentences: [
            { id: "c1s3", text: "Summer found a clue under the gate.", segments: [{ type: "text", text: "Summer found a clue under the gate." }] },
            { id: "c1s4", text: "The class followed the safe trail.", segments: [{ type: "text", text: "The class followed the safe trail." }] },
          ],
        },
      ],
      exercises: [],
    },
  ],
};

function plan(overrides: Partial<CourseResourcePlan> = {}): CourseResourcePlan {
  return {
    schemaVersion: "course_resource_plan_v1",
    coverBrief: {
      description: "Summer stands with the class at the glowing forest gate.",
      storyElements: ["silver gate", "river trail"],
      imagePrompt:
        "Horizontal 16:9 hand-drawn children's picture-book cover. SummerStudent is an eight-year-old student with bright eyes, short black hair, a yellow raincoat, and a green backpack, standing at a glowing silver forest gate near a river trail. Warm green and silver palette, soft watercolor texture, no readable text.",
    },
    shots: [
      {
        chapterId: "chapter-1",
        shotId: "chapter-1-shot-1",
        shotOrder: 1,
        sourceParagraphId: "chapter-1-paragraph-1",
        focus: "Summer discovers the silver gate.",
        keyObjects: ["silver gate"],
        imagePrompt:
          "Horizontal 16:9 hand-drawn children's picture-book illustration. SummerStudent is an eight-year-old student with bright eyes, short black hair, a yellow raincoat, and a green backpack, walking into the glowing forest as a silver gate shines near the river. Warm green and silver palette, soft watercolor texture, no readable text.",
      },
      {
        chapterId: "chapter-1",
        shotId: "chapter-1-shot-2",
        shotOrder: 2,
        sourceParagraphId: "chapter-1-paragraph-2",
        focus: "Summer picks up the clue.",
        keyObjects: ["clue", "safe trail"],
        imagePrompt:
          "Horizontal 16:9 hand-drawn children's picture-book illustration. SummerStudent is the same eight-year-old student with bright eyes, short black hair, a yellow raincoat, and a green backpack, picking up a small clue under the silver gate while the safe forest trail continues behind. Warm green and silver palette, no readable text.",
      },
    ],
    version: 1,
    ...overrides,
  };
}

describe("resource plan validation", () => {
  test("accepts exactly two non-overlapping ordered shots per chapter", () => {
    expect(assertResourcePlanValid(plan(), draft)).toEqual(plan());
  });

  test("rejects shots that are not bound to the matching paragraph order", () => {
    const invalid = plan({
      shots: [
        plan().shots[0],
        {
          ...plan().shots[1],
          sourceParagraphId: "chapter-1-paragraph-1",
        },
      ],
    });

    expect(() => assertResourcePlanValid(invalid, draft)).toThrow("第 1 章分镜必须按段落顺序绑定");
  });
});

function imageRecord(overrides: Partial<CourseImageRecord> = {}): CourseImageRecord {
  return {
    id: "image-1",
    courseId: "course-1",
    chapterId: null,
    shotId: "visual-cover",
    slotId: "visual-cover",
    slotType: "visual_cover",
    slotIndex: 0,
    sourceParagraphId: null,
    sourceExcerpt: "cover",
    prompt: "cover prompt",
    promptVersion: "step4-gpt-image-2-v1",
    referenceImageIds: [],
    width: 1280,
    height: 720,
    format: "webp",
    sourceHash: "old-hash",
    status: "pending",
    provider: "tencent_hunyuan",
    providerTaskId: null,
    providerImageUrl: null,
    storagePath: null,
    publicUrl: null,
    failureReason: null,
    createdAt: new Date("2026-07-13T00:00:00.000Z"),
    updatedAt: new Date("2026-07-13T00:00:00.000Z"),
    ...overrides,
  };
}

function coverSlot() {
  return deriveResourceImageSlots("course-1", draft, plan())[0];
}

const stubDeps: CourseImageGenerationDeps = {
  provider: { submit: async () => ({ imageUrl: "https://example.com/image.webp" }) },
  download: async () => ({ storagePath: "/tmp/image.webp", publicUrl: "/api/course-images/course-1/image-1.webp" }),
};

describe("synchronous image generation", () => {
  test("claims a pending image as submitting before calling the synchronous image provider", async () => {
    const updates: Array<Partial<CourseImageRecord>> = [];
    const record = imageRecord();
    const db = {
      courseImage: {
        updateMany: async ({ data }: { data: Partial<CourseImageRecord> }) => {
          updates.push(data);
          Object.assign(record, data);
          return { count: 1 };
        },
        update: async ({ data }: { data: Partial<CourseImageRecord> }) => {
          updates.push(data);
          Object.assign(record, data);
          return record;
        },
      },
    } as unknown as CourseImagesDb;
    const deps: CourseImageGenerationDeps = {
      provider: { submit: async () => ({ imageUrl: "https://example.com/image.webp" }) },
      download: async () => ({ storagePath: "/tmp/image.webp", publicUrl: "/api/course-images/course-1/image-1.webp" }),
    };

    await generateCourseImage(db, "course-1", record, coverSlot(), deps);

    expect(updates[0]).toMatchObject({ status: "submitting" });
    expect(updates.at(-1)).toMatchObject({ status: "succeeded", publicUrl: "/api/course-images/course-1/image-1.webp" });
  });

  test("does not call the image provider when another request already claimed the pending image", async () => {
    const record = imageRecord();
    const db = {
      courseImage: {
        updateMany: async () => ({ count: 0 }),
        update: async ({ data }: { data: Partial<CourseImageRecord> }) => {
          Object.assign(record, data);
          return record;
        },
      },
    } as unknown as CourseImagesDb;
    let submitCount = 0;

    await generateCourseImage(db, "course-1", record, coverSlot(), {
      provider: {
        submit: async () => {
          submitCount += 1;
          return { imageUrl: "https://example.com/image.webp" };
        },
      },
      download: async () => ({ storagePath: "/tmp/image.webp", publicUrl: "/api/course-images/course-1/image-1.webp" }),
    });

    expect(submitCount).toBe(0);
  });

  test("does not persist inline base64 image data in providerImageUrl", async () => {
    const updates: Array<Partial<CourseImageRecord>> = [];
    const record = imageRecord();
    const db = {
      courseImage: {
        updateMany: async ({ data }: { data: Partial<CourseImageRecord> }) => {
          Object.assign(record, data);
          return { count: 1 };
        },
        update: async ({ data }: { data: Partial<CourseImageRecord> }) => {
          updates.push(data);
          Object.assign(record, data);
          return record;
        },
      },
    } as unknown as CourseImagesDb;

    await generateCourseImage(db, "course-1", record, coverSlot(), {
      provider: { submit: async () => ({ imageUrl: "data:image/webp;base64,abc" }) },
      download: async () => ({ storagePath: "/tmp/image.webp", publicUrl: "/api/course-images/course-1/image-1.webp" }),
    });

    expect(updates.at(-1)).toMatchObject({
      status: "succeeded",
      providerImageUrl: null,
      publicUrl: "/api/course-images/course-1/image-1.webp",
    });
  });

  test("keeps the remote url when a synchronous submit succeeds but the download fails", async () => {
    const updates: Array<Partial<CourseImageRecord>> = [];
    const record = imageRecord();
    let submitCount = 0;
    const db = {
      courseImage: {
        updateMany: async ({ data }: { data: Partial<CourseImageRecord> }) => {
          Object.assign(record, data);
          return { count: 1 };
        },
        update: async ({ data }: { data: Partial<CourseImageRecord> }) => {
          updates.push(data);
          Object.assign(record, data);
          return record;
        },
      },
    } as unknown as CourseImagesDb;

    await generateCourseImage(db, "course-1", record, coverSlot(), {
      provider: {
        submit: async () => {
          submitCount += 1;
          return { imageUrl: "https://example.com/image.webp" };
        },
      },
      download: async () => {
        throw new Error("disk full");
      },
    });

    expect(submitCount).toBe(1);
    expect(updates.at(-1)).toMatchObject({
      status: "failed",
      providerImageUrl: "https://example.com/image.webp",
    });
    expect(String(updates.at(-1)?.failureReason)).toContain("下载失败");
  });

  test("recovers a kept remote url by downloading without paying for a new generation", async () => {
    const updates: Array<Partial<CourseImageRecord>> = [];
    const record = imageRecord({ status: "pending", providerImageUrl: "https://example.com/kept.webp" });
    let submitCount = 0;
    const db = {
      courseImage: {
        updateMany: async ({ data }: { data: Partial<CourseImageRecord> }) => {
          Object.assign(record, data);
          return { count: 1 };
        },
        update: async ({ data }: { data: Partial<CourseImageRecord> }) => {
          updates.push(data);
          Object.assign(record, data);
          return record;
        },
      },
    } as unknown as CourseImagesDb;

    await generateCourseImage(db, "course-1", record, coverSlot(), {
      provider: {
        submit: async () => {
          submitCount += 1;
          return { imageUrl: "https://example.com/new.webp" };
        },
      },
      download: async ({ sourceUrl }: { sourceUrl: string }) => ({ storagePath: `/tmp/${sourceUrl}`, publicUrl: "/api/course-images/course-1/image-1.webp" }),
    });

    expect(submitCount).toBe(0);
    expect(updates.at(-1)).toMatchObject({
      status: "succeeded",
      providerImageUrl: "https://example.com/kept.webp",
      publicUrl: "/api/course-images/course-1/image-1.webp",
    });
  });
});

describe("stuck image recovery on read", () => {
  function readOnlyDb(record: CourseImageRecord) {
    return {
      course: {
        findUnique: async () => ({ id: "course-1", status: "draft", lessonDraft: { content: draft }, resourcePlan: { plan: plan() } }),
        update: async () => ({}),
      },
      courseImage: {
        findMany: async () => [record],
        update: async ({ data }: { data: Partial<CourseImageRecord> }) => {
          Object.assign(record, data);
          return record;
        },
      },
    } as unknown as CourseImagesDb;
  }

  test("releases a stuck submitting record after the timeout so it can be retried", async () => {
    const record = imageRecord({
      status: "submitting",
      updatedAt: new Date(Date.now() - 20 * 60 * 1000),
    });

    await getCourseResources(readOnlyDb(record), "course-1");

    expect(record.status).toBe("failed");
  });

  test("keeps a slow submitting record active within the timeout window", async () => {
    const record = imageRecord({
      status: "submitting",
      updatedAt: new Date(Date.now() - 10 * 60 * 1000),
    });

    await getCourseResources(readOnlyDb(record), "course-1");

    expect(record.status).toBe("submitting");
  });
});

describe("resource image slot derivation", () => {
  test("includes one visual cover and two lesson shots per chapter from the same resource plan", () => {
    const slots = deriveResourceImageSlots("course-1", draft, plan());

    expect(slots.map((slot) => slot.slotType)).toEqual(["visual_cover", "lesson_shot", "lesson_shot"]);
    expect(slots[0].width).toBe(1280);
    expect(slots[0].height).toBe(720);
    expect(slots[0].prompt).toContain("Horizontal 16:9");
    expect(slots[0].prompt.length).toBeLessThanOrEqual(1200);
    expect(slots[1].sourceParagraphId).toBe("chapter-1-paragraph-1");
    expect(slots[1].sourceText).toBe("Summer walked into the forest. A silver gate shone near the river.");
    expect(slots[2].referenceSlotIds).toEqual([]);
  });

  test("uses self-contained image prompts from the resource plan", () => {
    const slots = deriveResourceImageSlots("course-1", draft, plan());

    expect(slots[0].prompt).toContain("standing at a glowing silver forest gate");
    expect(slots[1].prompt).toContain("walking into the glowing forest");
    expect(slots[1].prompt).toContain("Pure image only");
    expect(slots[1].prompt).not.toContain("EXACT CAST ONLY");
  });

  test("marks all planned images missing before paid image tasks are created", () => {
    const slots = deriveResourceImageSlots("course-1", draft, plan());
    const images = slots.map((slot) => ({
      ...slot,
      id: null,
      sourceHash: null,
      currentSourceHash: slot.sourceHash,
      stale: false,
      status: "missing" as const,
      provider: "tencent_hunyuan" as const,
      providerTaskId: null,
      providerImageUrl: null,
      publicUrl: null,
      failureReason: null,
      referenceImageIds: slot.referenceSlotIds,
      createdAt: null,
      updatedAt: null,
    }));

    expect(summarizeResourceProgress(images)).toMatchObject({
      total: 3,
      missing: 3,
      succeeded: 0,
    });
  });
});

describe("chapter image task creation", () => {
  const secondChapterDraft: LessonDraft = {
    ...draft,
    chapters: [
      ...draft.chapters,
      {
        id: "chapter-2",
        sourceOutlineChapterIndex: 2,
        title: "The River Clue",
        paragraphs: [
          {
            id: "chapter-2-paragraph-1",
            order: 1,
            sentences: [
              { id: "c2s1", text: "Summer crossed the quiet river.", segments: [{ type: "text", text: "Summer crossed the quiet river." }] },
            ],
          },
          {
            id: "chapter-2-paragraph-2",
            order: 2,
            sentences: [
              { id: "c2s2", text: "A blue stone pointed to the next path.", segments: [{ type: "text", text: "A blue stone pointed to the next path." }] },
            ],
          },
        ],
        exercises: [],
      },
    ],
  };

  function twoChapterPlan(): CourseResourcePlan {
    return plan({
      shots: [
        ...plan().shots,
        {
          chapterId: "chapter-2",
          shotId: "chapter-2-shot-1",
          shotOrder: 1,
          sourceParagraphId: "chapter-2-paragraph-1",
          focus: "Summer crosses the quiet river.",
          keyObjects: ["river"],
          imagePrompt: "Self-contained image2 prompt for chapter 2 shot 1.",
        } as CourseResourcePlan["shots"][number],
        {
          chapterId: "chapter-2",
          shotId: "chapter-2-shot-2",
          shotOrder: 2,
          sourceParagraphId: "chapter-2-paragraph-2",
          focus: "The blue stone points to the next path.",
          keyObjects: ["blue stone"],
          imagePrompt: "Self-contained image2 prompt for chapter 2 shot 2.",
        } as CourseResourcePlan["shots"][number],
      ],
    });
  }

  test("creates pending image tasks only for the requested chapter without requiring cover confirmation", async () => {
    let created: Array<{ chapterId: string | null; slotId: string }> = [];
    const db = {
      course: {
        findUnique: async () => ({
          id: "course-1",
          status: "draft",
          lessonDraft: { content: secondChapterDraft },
          resourcePlan: { plan: twoChapterPlan() },
        }),
        update: async () => ({}),
      },
      courseImage: {
        findMany: async () => [],
        createMany: async ({ data }: { data: Array<{ chapterId: string | null; slotId: string }> }) => {
          created = data;
          return { count: data.length };
        },
      },
    } as unknown as CourseImagesDb;

    await createMissingCourseImages(db, "course-1", { scope: "chapter", chapterId: "chapter-2" }, stubDeps);

    expect(created.map((item) => item.slotId)).toEqual(["chapter-2-shot-1", "chapter-2-shot-2"]);
    expect(created.every((item) => item.chapterId === "chapter-2")).toBe(true);
  });

  test("creates a pending image task only for the requested slot", async () => {
    let created: Array<{ chapterId: string | null; slotId: string }> = [];
    const db = {
      course: {
        findUnique: async () => ({
          id: "course-1",
          status: "draft",
          lessonDraft: { content: secondChapterDraft },
          resourcePlan: { plan: twoChapterPlan() },
        }),
        update: async () => ({}),
      },
      courseImage: {
        findMany: async () => [],
        createMany: async ({ data }: { data: Array<{ chapterId: string | null; slotId: string }> }) => {
          created = data;
          return { count: data.length };
        },
      },
    } as unknown as CourseImagesDb;

    await createMissingCourseImages(db, "course-1", { scope: "slot", slotId: "chapter-2-shot-1" }, stubDeps);

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ chapterId: "chapter-2", slotId: "chapter-2-shot-1" });
  });

  test("creates all missing image tasks when requested", async () => {
    let created: Array<{ slotId: string }> = [];
    const db = {
      course: {
        findUnique: async () => ({
          id: "course-1",
          status: "draft",
          lessonDraft: { content: secondChapterDraft },
          resourcePlan: { plan: twoChapterPlan() },
        }),
        update: async () => ({}),
      },
      courseImage: {
        findMany: async () => [imageRecord({ slotId: "visual-cover", slotType: "visual_cover", status: "succeeded" })],
        createMany: async ({ data }: { data: Array<{ slotId: string }> }) => {
          created = data;
          return { count: data.length };
        },
      },
    } as unknown as CourseImagesDb;

    await createMissingCourseImages(db, "course-1", { scope: "all" }, stubDeps);

    expect(created.map((item) => item.slotId)).toEqual([
      "chapter-1-shot-1",
      "chapter-1-shot-2",
      "chapter-2-shot-1",
      "chapter-2-shot-2",
    ]);
  });
});

describe("cover image regeneration guard", () => {
  function coverDb(record: CourseImageRecord, onWrite: () => void) {
    return {
      course: {
        findUnique: async () => ({
          id: "course-1",
          status: "draft",
          lessonDraft: { content: draft },
          resourcePlan: { plan: plan() },
        }),
        update: async () => {
          onWrite();
          return {};
        },
      },
      courseImage: {
        findMany: async () => [record],
        update: async () => {
          onWrite();
          return record;
        },
        createMany: async () => {
          onWrite();
          return { count: 1 };
        },
      },
    } as unknown as CourseImagesDb;
  }

  for (const status of ["pending", "submitting", "generating"] as const) {
    test(`rejects regenerating the cover while it is ${status} instead of resubmitting`, async () => {
      let wrote = false;
      const record = imageRecord({ status });
      const db = coverDb(record, () => {
        wrote = true;
      });

      await expect(createCoverImage(db, "course-1", stubDeps)).rejects.toBeInstanceOf(CourseImageInvalidStateError);
      expect(wrote).toBe(false);
    });
  }

  test("allows regenerating the cover after it failed", async () => {
    let wrote = false;
    const record = imageRecord({ status: "failed" });
    const db = coverDb(record, () => {
      wrote = true;
    });

    await createCoverImage(db, "course-1", stubDeps);
    expect(wrote).toBe(true);
  });
});
