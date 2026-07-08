import { describe, expect, it } from "vitest";

import type { LessonDraft } from "@/lib/contracts/api";
import { buildImagePrompt, deriveLessonShotImageSlots, hashImageSource, mergeImageSlotsWithRecords } from "./course-images";

function draft(): LessonDraft {
  return {
    schemaVersion: "lesson_draft_v1",
    sourceStoryOptionId: "story-1",
    generationMode: "ai",
    title: "The Moon Gate",
    language: "en",
    visualStyle: {
      artStyle: "warm watercolor",
      colorPalette: "mint, gold, and ink blue",
      aspectRatio: "4:3",
      consistencyPrompt: "Use the same soft watercolor style.",
    },
    characters: [
      {
        id: "teacher-1",
        name: "Ms. Lin",
        role: "teacher",
        appearance: "kind eyes and short black hair",
        outfit: "green cardigan",
        consistencyPrompt: "Ms. Lin always has short black hair and a green cardigan.",
      },
      {
        id: "student-1",
        name: "Summer",
        role: "student",
        appearance: "bright eyes and a ponytail",
        outfit: "yellow raincoat",
        consistencyPrompt: "Summer always has a ponytail and a yellow raincoat.",
      },
    ],
    chapters: [
      {
        id: "chapter-1",
        sourceOutlineChapterIndex: 1,
        title: "The First Gate",
        wordTarget: { min: 110, max: 130 },
        exerciseTarget: { verbBlankCount: 7, vocabularyHintCount: 3 },
        blocks: [{ id: "block-1", order: 1, type: "text", text: "Summer opens the gate." }],
        exercises: [],
        shots: [
          {
            id: "shot-1",
            order: 1,
            imageSlotId: "slot-1",
            coveredBlockIds: ["block-1"],
            characterIds: ["teacher-1", "student-1"],
            location: "garden gate",
            action: "Summer and Ms. Lin open a glowing gate.",
            mood: "curious",
            scenePrompt: "A child and teacher open a glowing garden gate.",
            composition: "Wide 4:3 picture-book spread with the gate centered.",
            continuityNotes: "Keep both characters consistent.",
          },
          {
            id: "shot-2",
            order: 2,
            imageSlotId: "slot-2",
            coveredBlockIds: ["block-1"],
            characterIds: ["student-1"],
            location: "moon path",
            action: "Summer steps onto a moonlit path.",
            mood: "brave",
            scenePrompt: "A child steps onto a silver moon path.",
            composition: "Wide 4:3 picture-book spread with path leading right.",
            continuityNotes: "Keep Summer consistent.",
          },
        ],
      },
    ],
    closingReading: {
      title: "After the Gate",
      text: "Summer remembers the moon gate and smiles at the quiet garden path.",
      vocabularyTerms: ["gate", "path"],
    },
  };
}

describe("course image planning", () => {
  it("derives one image slot for each lesson shot", () => {
    const slots = deriveLessonShotImageSlots("course-1", draft());

    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({
      courseId: "course-1",
      chapterId: "chapter-1",
      chapterTitle: "The First Gate",
      shotId: "shot-1",
      shotOrder: 1,
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      action: "Summer and Ms. Lin open a glowing gate.",
      scenePrompt: "A child and teacher open a glowing garden gate.",
    });
  });

  it("builds prompts from shot, style, and referenced character consistency", () => {
    const sampleDraft = draft();
    const prompt = buildImagePrompt(sampleDraft, sampleDraft.chapters[0], sampleDraft.chapters[0].shots[0]);

    expect(prompt).toContain("A child and teacher open a glowing garden gate.");
    expect(prompt).toContain("warm watercolor");
    expect(prompt).toContain("Wide 4:3 picture-book spread");
    expect(prompt).toContain("Ms. Lin always has short black hair");
    expect(prompt).toContain("Summer always has a ponytail");
    expect(prompt).toContain("No text, no letters, no captions, no speech bubbles");
  });

  it("keeps source hashes stable for identical input and different for changed prompt", () => {
    const first = deriveLessonShotImageSlots("course-1", draft())[0];
    const second = deriveLessonShotImageSlots("course-1", draft())[0];
    const changedDraft = draft();
    changedDraft.chapters[0].shots[0].scenePrompt = "A different scene.";
    const changed = deriveLessonShotImageSlots("course-1", changedDraft)[0];

    expect(hashImageSource(first)).toBe(hashImageSource(second));
    expect(hashImageSource(first)).not.toBe(hashImageSource(changed));
  });

  it("marks missing, reusable, and stale images", () => {
    const slots = deriveLessonShotImageSlots("course-1", draft());
    const currentHash = slots[0].sourceHash;
    const merged = mergeImageSlotsWithRecords(slots, [
      {
        id: "image-1",
        courseId: "course-1",
        chapterId: "chapter-1",
        shotId: "shot-1",
        slotId: "slot-1",
        slotType: "lesson_shot",
        slotIndex: 1,
        prompt: slots[0].prompt,
        sourceHash: "old-hash",
        status: "succeeded",
        provider: "tencent_hunyuan",
        providerTaskId: "task-1",
        providerImageUrl: "https://example.com/image.png",
        storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
        publicUrl: "/api/course-images/image-1",
        failureReason: null,
        createdAt: new Date("2026-07-08T00:00:00Z"),
        updatedAt: new Date("2026-07-08T00:00:00Z"),
      },
    ]);

    expect(merged[0]).toMatchObject({
      id: "image-1",
      status: "succeeded",
      sourceHash: "old-hash",
      currentSourceHash: currentHash,
      stale: true,
    });
    expect(merged[1]).toMatchObject({
      id: null,
      status: "missing",
      stale: false,
    });
  });
});
