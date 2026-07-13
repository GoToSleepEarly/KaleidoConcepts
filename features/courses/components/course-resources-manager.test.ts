import { describe, expect, test } from "vitest";

import type { CourseResourceImage, CourseResourcesResponse } from "@/lib/contracts/api";

import { getResourceStage, splitResourceImages } from "./course-resources-manager";

function image(overrides: Partial<CourseResourceImage>): CourseResourceImage {
  return {
    id: null,
    courseId: "course-1",
    chapterId: "",
    chapterTitle: "视觉封面",
    shotId: "visual-cover",
    shotOrder: 1,
    slotId: "visual-cover",
    slotType: "visual_cover",
    slotIndex: 0,
    sourceParagraphId: null,
    sourceExcerpt: "",
    prompt: "",
    sourceHash: null,
    currentSourceHash: "hash",
    stale: false,
    status: "missing",
    provider: "tencent_hunyuan",
    providerTaskId: null,
    providerImageUrl: null,
    publicUrl: null,
    failureReason: null,
    action: "",
    scenePrompt: "",
    sourceText: "",
    focus: null,
    keyObjects: [],
    referenceImageIds: [],
    width: 1280,
    height: 720,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function response(overrides: Partial<CourseResourcesResponse>): CourseResourcesResponse {
  return {
    plan: null,
    progress: { total: 0, succeeded: 0, generating: 0, failed: 0, missing: 0, stale: 0 },
    images: [],
    ...overrides,
  };
}

const resourcePlan: CourseResourcesResponse["plan"] = {
  schemaVersion: "course_resource_plan_v1",
  coverBrief: {
    description: "cover",
    characters: ["SummerStudent"],
    setting: "forest",
    storyElements: ["gate"],
    imagePrompt: "GPT Image 2 prompt: Horizontal 16:9 cover.",
  },
  shots: [],
  version: 1,
};

describe("course resource UI state", () => {
  test("splits cover image from chapter images", () => {
    const cover = image({ slotType: "visual_cover", slotId: "visual-cover" });
    const shot = image({ slotType: "lesson_shot", slotId: "chapter-1-shot-1", chapterTitle: "Chapter 1" });

    expect(splitResourceImages([shot, cover])).toEqual({
      cover,
      chapterImages: [shot],
    });
  });

  test("uses a linear stage model instead of exposing old task states", () => {
    expect(getResourceStage(response({ plan: null }))).toBe("needs_plan");
    expect(getResourceStage(response({ plan: resourcePlan }))).toBe("needs_cover");
    expect(
      getResourceStage(
        response({
          plan: resourcePlan,
          images: [image({ slotType: "visual_cover", status: "succeeded", id: "cover-1" })],
        }),
      ),
    ).toBe("needs_chapter_images");
    expect(
      getResourceStage(
        response({
          plan: resourcePlan,
          images: [
            image({ slotType: "visual_cover", status: "succeeded", id: "cover-1" }),
            image({ slotType: "lesson_shot", status: "succeeded", id: "shot-1", slotId: "chapter-1-shot-1" }),
          ],
        }),
      ),
    ).toBe("ready");
  });
});
