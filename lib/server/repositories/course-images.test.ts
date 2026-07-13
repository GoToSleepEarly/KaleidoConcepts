import { describe, expect, test } from "vitest";

import type { CourseResourcePlan, LessonDraft } from "@/lib/contracts/api";

import {
  advanceCourseImageQueue,
  assertResourcePlanValid,
  deriveResourceImageSlots,
  summarizeResourceProgress,
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
    visualProfile: {
      style: "hand-drawn comic picture-book style",
      palette: "warm green and silver",
      world: "a glowing forest classroom world",
      mood: "curious and safe",
      characters: [
        {
          alias: "SummerStudent",
          appearance: "an eight-year-old student with bright eyes",
          hairstyle: "short black hair",
          clothing: "yellow raincoat",
          accessories: ["green backpack"],
          signatureColor: "yellow",
        },
      ],
    },
    coverBrief: {
      description: "Summer stands with the class at the glowing forest gate.",
      characters: ["SummerStudent"],
      setting: "glowing forest gate",
      storyElements: ["silver gate", "river trail"],
    },
    shots: [
      {
        chapterId: "chapter-1",
        shotId: "chapter-1-shot-1",
        shotOrder: 1,
        sourceParagraphId: "chapter-1-paragraph-1",
        sourceSentenceIds: ["c1s1", "c1s2"],
        heroMomentSentenceId: "c1s2",
        sourceExcerpt: "Summer walked into the forest. A silver gate shone near the river.",
        focus: "Summer discovers the silver gate.",
        characters: ["SummerStudent"],
        keyObjects: ["silver gate"],
        composition: "wide classroom storybook scene with Summer centered",
        continuityNotes: "Keep Summer's yellow raincoat and green backpack.",
      },
      {
        chapterId: "chapter-1",
        shotId: "chapter-1-shot-2",
        shotOrder: 2,
        sourceParagraphId: "chapter-1-paragraph-2",
        sourceSentenceIds: ["c1s3", "c1s4"],
        heroMomentSentenceId: "c1s3",
        sourceExcerpt: "Summer found a clue under the gate. The class followed the safe trail.",
        focus: "Summer picks up the clue.",
        characters: ["SummerStudent"],
        keyObjects: ["clue", "safe trail"],
        composition: "medium shot with the clue in the safe center area",
        continuityNotes: "Continue the forest gate scene.",
      },
    ],
    version: 1,
    confirmedCoverImageId: null,
    ...overrides,
  };
}

describe("resource plan validation", () => {
  test("accepts exactly two non-overlapping ordered shots per chapter", () => {
    expect(assertResourcePlanValid(plan(), draft)).toEqual(plan());
  });

  test("rejects overlapping source sentence ids inside a chapter", () => {
    const invalid = plan({
      shots: [
        plan().shots[0],
        {
          ...plan().shots[1],
          sourceParagraphId: "chapter-1-paragraph-1",
          sourceSentenceIds: ["c1s2"],
          heroMomentSentenceId: "c1s2",
        },
      ],
    });

    expect(() => assertResourcePlanValid(invalid, draft)).toThrow("第 1 章分镜来源句子重复");
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
    sourceSentenceIds: [],
    heroMomentSentenceId: null,
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

describe("resource image queue", () => {
  test("claims a pending image as submitting before calling the synchronous image provider", async () => {
    const updates: Array<Partial<CourseImageRecord>> = [];
    const record = imageRecord();
    const db = {
      course: {
        findUnique: async () => ({ id: "course-1", status: "draft", lessonDraft: { content: draft }, resourcePlan: { plan: plan(), confirmedCoverImageId: null } }),
      },
      courseImage: {
        findMany: async () => [record],
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
    const provider = {
      submit: async () => ({ imageUrl: "https://example.com/image.webp" }),
      query: async () => ({ status: "failed" as const, imageUrl: null, failureReason: "unused" }),
    };

    await advanceCourseImageQueue(db, "course-1", {
      provider,
      download: async () => ({ storagePath: "/tmp/image.webp", publicUrl: "/api/course-images/course-1/image-1.webp" }),
    });

    expect(updates[0]).toMatchObject({ status: "submitting" });
    expect(updates.at(-1)).toMatchObject({ status: "succeeded", publicUrl: "/api/course-images/course-1/image-1.webp" });
  });

  test("does not call the image provider when another request already claimed the pending image", async () => {
    const record = imageRecord();
    const db = {
      course: {
        findUnique: async () => ({ id: "course-1", status: "draft", lessonDraft: { content: draft }, resourcePlan: { plan: plan(), confirmedCoverImageId: null } }),
      },
      courseImage: {
        findMany: async () => [record],
        updateMany: async () => ({ count: 0 }),
        update: async ({ data }: { data: Partial<CourseImageRecord> }) => {
          Object.assign(record, data);
          return record;
        },
      },
    } as unknown as CourseImagesDb;
    let submitCount = 0;

    await advanceCourseImageQueue(db, "course-1", {
      provider: {
        submit: async () => {
          submitCount += 1;
          return { imageUrl: "https://example.com/image.webp" };
        },
        query: async () => ({ status: "failed" as const, imageUrl: null, failureReason: "unused" }),
      },
      download: async () => ({ storagePath: "/tmp/image.webp", publicUrl: "/api/course-images/course-1/image-1.webp" }),
    });

    expect(submitCount).toBe(0);
  });

  test("does not persist inline base64 image data in providerImageUrl", async () => {
    const updates: Array<Partial<CourseImageRecord>> = [];
    const record = imageRecord();
    const db = {
      course: {
        findUnique: async () => ({ id: "course-1", status: "draft", lessonDraft: { content: draft }, resourcePlan: { plan: plan(), confirmedCoverImageId: null } }),
      },
      courseImage: {
        findMany: async () => [record],
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

    await advanceCourseImageQueue(db, "course-1", {
      provider: {
        submit: async () => ({ imageUrl: "data:image/webp;base64,abc" }),
        query: async () => ({ status: "failed" as const, imageUrl: null, failureReason: "unused" }),
      },
      download: async () => ({ storagePath: "/tmp/image.webp", publicUrl: "/api/course-images/course-1/image-1.webp" }),
    });

    expect(updates.at(-1)).toMatchObject({
      status: "succeeded",
      providerImageUrl: null,
      publicUrl: "/api/course-images/course-1/image-1.webp",
    });
  });
});

describe("resource image slot derivation", () => {
  test("includes one visual cover and two lesson shots per chapter from the same resource plan", () => {
    const slots = deriveResourceImageSlots("course-1", draft, plan());

    expect(slots.map((slot) => slot.slotType)).toEqual(["visual_cover", "lesson_shot", "lesson_shot"]);
    expect(slots[0].width).toBe(1280);
    expect(slots[0].height).toBe(720);
    expect(slots[0].prompt).toContain("warm Japanese animation film feeling");
    expect(slots[0].prompt.length).toBeLessThanOrEqual(1000);
    expect(slots[1].sourceSentenceIds).toEqual(["c1s1", "c1s2"]);
    expect(slots[2].referenceSlotIds).toContain("visual-cover");
  });

  test("locks generated image prompts to the named cast only", () => {
    const slots = deriveResourceImageSlots("course-1", draft, plan());

    expect(slots[0].prompt).toContain("EXACT CAST ONLY");
    expect(slots[0].prompt).toContain("Do not add any extra students");
    expect(slots[0].prompt).toContain("Story poster key art");
    expect(slots[1].prompt).toContain("EXACT CAST ONLY");
    expect(slots[1].prompt).toContain("Do not add any extra students");
    expect(slots[1].prompt).not.toContain("classroom slide");
  });

  test("marks chapter images missing until a fresh cover is confirmed", () => {
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
