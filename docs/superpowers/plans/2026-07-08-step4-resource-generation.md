# Step 4 Resource Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Step 4 resource generation so lesson draft shots become persistent Tencent Hunyuan image tasks, local image files, and recoverable UI progress.

**Architecture:** Add a `CourseImage` Prisma table as the durable source of truth for image task state. Use pure planning helpers to derive current shot image slots from `LessonDraft`, repository functions to create/retry/keep/progress records, and API routes that lightly advance the queue during polling. The frontend page reads the resource API, shows per-shot progress, and only starts generation after user action.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma 7, PostgreSQL, Vitest, Tencent Cloud Hunyuan async image API, local filesystem storage under `STORAGE_DIR`.

---

## File Structure

- Create `prisma/migrations/20260708160000_course_images/migration.sql`
  - Adds image status/provider/slot enums and `CourseImage` table.
- Modify `prisma/schema.prisma`
  - Adds `Course.images` relation and `CourseImage` model.
- Modify `lib/contracts/api.ts`
  - Adds resource progress/image response types.
- Create `lib/server/repositories/course-images.ts`
  - Owns image-slot derivation, source hashes, repository operations, queue advancement, and course status updates.
- Create `lib/server/repositories/course-images.test.ts`
  - Tests planning, reuse, stale detection, retry/keep rules, and status aggregation with mocked DB/provider/storage.
- Create `lib/server/ai/tencent-hunyuan-image.ts`
  - Owns Tencent request signing, submit, query, and status normalization.
- Create `lib/server/ai/tencent-hunyuan-image.test.ts`
  - Tests missing config and normalized query/submit behavior with mocked `fetch`.
- Create `lib/server/storage/course-images.ts`
  - Owns local image path/public URL generation and remote image download.
- Create `lib/server/storage/course-images.test.ts`
  - Tests deterministic paths and download write behavior.
- Modify `lib/server/db.ts`
  - Adds `CourseImagesDb` to `AppDb`.
- Create `app/api/courses/[id]/resources/route.ts`
  - Implements `GET` resource status behavior.
- Create `app/api/courses/[id]/resources/generate/route.ts`
  - Implements `POST /api/courses/:id/resources/generate`.
- Create `app/api/courses/[id]/resources/images/[imageId]/retry/route.ts`
  - Implements retry.
- Create `app/api/courses/[id]/resources/images/[imageId]/keep/route.ts`
  - Implements keep old image.
- Create `app/courses/[id]/create/resources/page.tsx`
  - Step 4 page entry.
- Create `features/courses/components/course-resources-manager.tsx`
  - Client UI for progress, polling, image cards, generate/retry/keep actions.
- Modify `features/courses/components/course-create-steps.tsx`
  - Enables Step 4 link when current page is resources.
- Modify `features/courses/components/lesson-draft-manager.tsx`
  - Adds next-step navigation after draft is saved/generated if the current UI has a completion action.
- Modify `docs/frontend/course-create-resources.md`
  - Records implementation status, commands, and commit.

---

### Task 1: Add Persistent Course Image Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260708160000_course_images/migration.sql`
- Modify: `lib/contracts/api.ts`

- [ ] **Step 1: Update Prisma schema**

In `prisma/schema.prisma`, add the `images` relation to `Course`:

```prisma
model Course {
  id              String          @id @default(cuid())
  title           String
  englishLevel    EnglishLevel
  durationMinutes Int             @default(45)
  theme           String
  grammar         String[]
  storyIdeaMode   StoryIdeaMode   @default(ai)
  storyIdea       String?
  selectedStoryOptionId String?
  status          CourseStatus    @default(draft)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  people          CoursePerson[]
  storyOptions    CourseStoryOption[]
  lessonDraft     CourseLessonDraft?
  images          CourseImage[]
}
```

Add this model after `CourseLessonDraft`:

```prisma
model CourseImage {
  id               String              @id @default(cuid())
  courseId         String
  chapterId        String
  shotId           String
  slotId           String
  slotType         CourseImageSlotType
  slotIndex        Int
  prompt           String
  sourceHash       String
  status           CourseImageStatus
  provider         CourseImageProvider
  providerTaskId   String?
  providerImageUrl String?
  storagePath      String?
  publicUrl        String?
  failureReason    String?
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt
  course           Course              @relation(fields: [courseId], references: [id], onDelete: Cascade)

  @@unique([courseId, slotId])
  @@index([courseId, status])
}
```

Add these enums after `CourseStatus`:

```prisma
enum CourseImageStatus {
  pending
  submitting
  generating
  succeeded
  failed
}

enum CourseImageSlotType {
  lesson_shot
}

enum CourseImageProvider {
  tencent_hunyuan
}
```

- [ ] **Step 2: Create migration SQL**

Create `prisma/migrations/20260708160000_course_images/migration.sql` with:

```sql
CREATE TYPE "CourseImageStatus" AS ENUM ('pending', 'submitting', 'generating', 'succeeded', 'failed');

CREATE TYPE "CourseImageSlotType" AS ENUM ('lesson_shot');

CREATE TYPE "CourseImageProvider" AS ENUM ('tencent_hunyuan');

CREATE TABLE "CourseImage" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "shotId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "slotType" "CourseImageSlotType" NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "status" "CourseImageStatus" NOT NULL,
    "provider" "CourseImageProvider" NOT NULL,
    "providerTaskId" TEXT,
    "providerImageUrl" TEXT,
    "storagePath" TEXT,
    "publicUrl" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseImage_courseId_slotId_key" ON "CourseImage"("courseId", "slotId");

CREATE INDEX "CourseImage_courseId_status_idx" ON "CourseImage"("courseId", "status");

ALTER TABLE "CourseImage" ADD CONSTRAINT "CourseImage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Add API contract types**

In `lib/contracts/api.ts`, after `CourseImage`, add:

```ts
export type ResourceImageStatus = "missing" | "pending" | "submitting" | "generating" | "succeeded" | "failed";
export type CourseImageSlotType = "lesson_shot";
export type CourseImageProvider = "tencent_hunyuan";

export type ResourceProgress = {
  total: number;
  succeeded: number;
  generating: number;
  failed: number;
  missing: number;
  stale: number;
};

export type CourseResourceImage = {
  id: string | null;
  courseId: string;
  chapterId: string;
  chapterTitle: string;
  shotId: string;
  shotOrder: 1 | 2;
  slotId: string;
  slotType: CourseImageSlotType;
  slotIndex: number;
  prompt: string;
  sourceHash: string | null;
  currentSourceHash: string;
  stale: boolean;
  status: ResourceImageStatus;
  provider: CourseImageProvider;
  providerTaskId: string | null;
  providerImageUrl: string | null;
  publicUrl: string | null;
  failureReason: string | null;
  action: string;
  scenePrompt: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CourseResourcesResponse = {
  progress: ResourceProgress;
  images: CourseResourceImage[];
};
```

- [ ] **Step 4: Run Prisma generate**

Run:

```bash
pnpm prisma:generate
```

Expected: exits 0 and regenerates Prisma client.

- [ ] **Step 5: Commit schema changes**

Run:

```bash
git add prisma/schema.prisma prisma/migrations/20260708160000_course_images/migration.sql lib/contracts/api.ts
git commit -m "Add course image persistence schema"
```

Expected: commit succeeds.

---

### Task 2: Build Image Slot Planning and Hashing

**Files:**
- Create: `lib/server/repositories/course-images.ts`
- Create: `lib/server/repositories/course-images.test.ts`

- [ ] **Step 1: Write planning tests**

Create `lib/server/repositories/course-images.test.ts` with:

```ts
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
    const prompt = buildImagePrompt(draft(), draft().chapters[0], draft().chapters[0].shots[0]);

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
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
pnpm test lib/server/repositories/course-images.test.ts
```

Expected: FAIL because `lib/server/repositories/course-images.ts` does not exist.

- [ ] **Step 3: Implement planning helpers**

Create `lib/server/repositories/course-images.ts` with:

```ts
import { createHash } from "node:crypto";

import type {
  CourseImageProvider,
  CourseImageSlotType,
  CourseResourceImage,
  CourseResourcesResponse,
  LessonChapter,
  LessonDraft,
  LessonShot,
  ResourceProgress,
} from "@/lib/contracts/api";

export type CourseImageStatus = "pending" | "submitting" | "generating" | "succeeded" | "failed";

export type CourseImageRecord = {
  id: string;
  courseId: string;
  chapterId: string;
  shotId: string;
  slotId: string;
  slotType: CourseImageSlotType;
  slotIndex: number;
  prompt: string;
  sourceHash: string;
  status: CourseImageStatus;
  provider: CourseImageProvider;
  providerTaskId: string | null;
  providerImageUrl: string | null;
  storagePath: string | null;
  publicUrl: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PlannedImageSlot = {
  courseId: string;
  chapterId: string;
  chapterTitle: string;
  shotId: string;
  shotOrder: 1 | 2;
  slotId: string;
  slotType: "lesson_shot";
  slotIndex: number;
  prompt: string;
  sourceHash: string;
  action: string;
  scenePrompt: string;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

export function buildImagePrompt(draft: LessonDraft, chapter: LessonChapter, shot: LessonShot) {
  const characterPrompts = draft.characters
    .filter((character) => shot.characterIds.includes(character.id))
    .map((character) => `${character.name}: ${character.appearance}; outfit: ${character.outfit}; ${character.consistencyPrompt}`)
    .join("\n");

  return [
    `Create a children's picture-book illustration in ${draft.visualStyle.artStyle}.`,
    `Use this color palette: ${draft.visualStyle.colorPalette}.`,
    `Aspect ratio: ${draft.visualStyle.aspectRatio}, target size 1024x768.`,
    `Chapter: ${chapter.title}.`,
    `Scene: ${shot.scenePrompt}`,
    `Action: ${shot.action}`,
    `Location: ${shot.location}`,
    `Mood: ${shot.mood}`,
    `Composition: ${shot.composition}`,
    `Continuity: ${shot.continuityNotes}`,
    `Global style consistency: ${draft.visualStyle.consistencyPrompt}`,
    `Character consistency:\n${characterPrompts}`,
    "No text, no letters, no captions, no speech bubbles, no watermark.",
  ].join("\n");
}

export function hashImageSource(slot: Omit<PlannedImageSlot, "sourceHash"> | PlannedImageSlot) {
  return createHash("sha256")
    .update(
      stableJson({
        chapterId: slot.chapterId,
        shotId: slot.shotId,
        slotId: slot.slotId,
        prompt: slot.prompt,
      }),
    )
    .digest("hex");
}

export function deriveLessonShotImageSlots(courseId: string, draft: LessonDraft): PlannedImageSlot[] {
  return draft.chapters.flatMap((chapter) =>
    chapter.shots.map((shot) => {
      const base = {
        courseId,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        shotId: shot.id,
        shotOrder: shot.order,
        slotId: shot.imageSlotId,
        slotType: "lesson_shot" as const,
        slotIndex: shot.order,
        prompt: buildImagePrompt(draft, chapter, shot),
        action: shot.action,
        scenePrompt: shot.scenePrompt,
      };

      return {
        ...base,
        sourceHash: hashImageSource(base),
      };
    }),
  );
}

export function mergeImageSlotsWithRecords(slots: PlannedImageSlot[], records: CourseImageRecord[]): CourseResourceImage[] {
  return slots.map((slot) => {
    const record = records.find((image) => image.slotId === slot.slotId);

    if (!record) {
      return {
        id: null,
        courseId: slot.courseId,
        chapterId: slot.chapterId,
        chapterTitle: slot.chapterTitle,
        shotId: slot.shotId,
        shotOrder: slot.shotOrder,
        slotId: slot.slotId,
        slotType: slot.slotType,
        slotIndex: slot.slotIndex,
        prompt: slot.prompt,
        sourceHash: null,
        currentSourceHash: slot.sourceHash,
        stale: false,
        status: "missing",
        provider: "tencent_hunyuan",
        providerTaskId: null,
        providerImageUrl: null,
        publicUrl: null,
        failureReason: null,
        action: slot.action,
        scenePrompt: slot.scenePrompt,
        createdAt: null,
        updatedAt: null,
      };
    }

    return {
      id: record.id,
      courseId: record.courseId,
      chapterId: slot.chapterId,
      chapterTitle: slot.chapterTitle,
      shotId: slot.shotId,
      shotOrder: slot.shotOrder,
      slotId: slot.slotId,
      slotType: slot.slotType,
      slotIndex: slot.slotIndex,
      prompt: slot.prompt,
      sourceHash: record.sourceHash,
      currentSourceHash: slot.sourceHash,
      stale: record.status === "succeeded" && record.sourceHash !== slot.sourceHash,
      status: record.status,
      provider: record.provider,
      providerTaskId: record.providerTaskId,
      providerImageUrl: record.providerImageUrl,
      publicUrl: record.publicUrl,
      failureReason: record.failureReason,
      action: slot.action,
      scenePrompt: slot.scenePrompt,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
}

export function summarizeResourceProgress(images: CourseResourceImage[]): ResourceProgress {
  return {
    total: images.length,
    succeeded: images.filter((image) => image.status === "succeeded" && !image.stale).length,
    generating: images.filter((image) => image.status === "pending" || image.status === "submitting" || image.status === "generating").length,
    failed: images.filter((image) => image.status === "failed").length,
    missing: images.filter((image) => image.status === "missing").length,
    stale: images.filter((image) => image.stale).length,
  };
}

export function toResourcesResponse(images: CourseResourceImage[]): CourseResourcesResponse {
  return {
    progress: summarizeResourceProgress(images),
    images,
  };
}
```

- [ ] **Step 4: Run planning tests**

Run:

```bash
pnpm test lib/server/repositories/course-images.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit planning helpers**

Run:

```bash
git add lib/server/repositories/course-images.ts lib/server/repositories/course-images.test.ts
git commit -m "Add course image planning helpers"
```

Expected: commit succeeds.

---

### Task 3: Add Course Image Repository Operations

**Files:**
- Modify: `lib/server/repositories/course-images.ts`
- Modify: `lib/server/repositories/course-images.test.ts`
- Modify: `lib/server/db.ts`

- [ ] **Step 1: Add repository operation tests**

Append to `lib/server/repositories/course-images.test.ts`:

```ts
import { beforeEach, vi } from "vitest";
import {
  createMissingCourseImages,
  getCourseResources,
  keepStaleCourseImage,
  retryCourseImage,
  CourseImageInvalidStateError,
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
} from "./course-images";

function makeDb() {
  const state = {
    course: {
      id: "course-1",
      status: "draft",
      lessonDraft: {
        content: draft(),
      },
    },
    images: [] as any[],
  };

  return {
    state,
    db: {
      course: {
        findUnique: vi.fn(async () => state.course),
        update: vi.fn(async ({ data }: any) => {
          state.course.status = data.status;
          return state.course;
        }),
      },
      courseImage: {
        findMany: vi.fn(async () => state.images),
        createMany: vi.fn(async ({ data }: any) => {
          data.forEach((item: any, index: number) => {
            state.images.push({
              id: `image-${state.images.length + index + 1}`,
              ...item,
              providerTaskId: null,
              providerImageUrl: null,
              storagePath: null,
              publicUrl: null,
              failureReason: null,
              createdAt: new Date("2026-07-08T00:00:00Z"),
              updatedAt: new Date("2026-07-08T00:00:00Z"),
            });
          });
          return { count: data.length };
        }),
        findFirst: vi.fn(async ({ where }: any) => state.images.find((image) => image.id === where.id && image.courseId === where.courseId) ?? null),
        update: vi.fn(async ({ where, data }: any) => {
          const image = state.images.find((item) => item.id === where.id);
          Object.assign(image, data, { updatedAt: new Date("2026-07-08T00:01:00Z") });
          return image;
        }),
      },
    } as any,
  };
}

describe("course image repository operations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws a prerequisite error when the course has no lesson draft", async () => {
    const { db, state } = makeDb();
    state.course.lessonDraft = null;

    await expect(getCourseResources(db, "course-1")).rejects.toBeInstanceOf(CourseImagePrerequisiteError);
  });

  it("creates pending records only for missing images", async () => {
    const { db } = makeDb();
    const result = await createMissingCourseImages(db, "course-1");

    expect(result.progress).toMatchObject({ total: 2, generating: 2, missing: 0 });
    expect(db.courseImage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ slotId: "slot-1", status: "pending", provider: "tencent_hunyuan" }),
        expect.objectContaining({ slotId: "slot-2", status: "pending", provider: "tencent_hunyuan" }),
      ]),
      skipDuplicates: true,
    });
    expect(db.course.update).toHaveBeenCalledWith({ where: { id: "course-1" }, data: { status: "building_resources" } });
  });

  it("does not create records for succeeded current images", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: slots[0].prompt,
      sourceHash: slots[0].sourceHash,
      status: "succeeded",
      provider: "tencent_hunyuan",
      providerTaskId: "task-1",
      providerImageUrl: "https://example.com/image.png",
      storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
      publicUrl: "/api/course-images/image-1",
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await createMissingCourseImages(db, "course-1");

    expect(db.courseImage.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ slotId: "slot-2" })],
      skipDuplicates: true,
    });
  });

  it("retries failed images by resetting task fields", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: "old",
      sourceHash: "old",
      status: "failed",
      provider: "tencent_hunyuan",
      providerTaskId: "task-1",
      providerImageUrl: "https://example.com/image.png",
      storagePath: null,
      publicUrl: null,
      failureReason: "remote failed",
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    const result = await retryCourseImage(db, "course-1", "image-1");

    expect(result.image).toMatchObject({ id: "image-1", status: "pending", sourceHash: slots[0].sourceHash, stale: false });
    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: expect.objectContaining({
        status: "pending",
        providerTaskId: null,
        providerImageUrl: null,
        storagePath: null,
        publicUrl: null,
        failureReason: null,
      }),
    });
  });

  it("rejects retry for succeeded current images", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: slots[0].prompt,
      sourceHash: slots[0].sourceHash,
      status: "succeeded",
      provider: "tencent_hunyuan",
      providerTaskId: "task-1",
      providerImageUrl: "https://example.com/image.png",
      storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
      publicUrl: "/api/course-images/image-1",
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await expect(retryCourseImage(db, "course-1", "image-1")).rejects.toBeInstanceOf(CourseImageInvalidStateError);
  });

  it("keeps a stale succeeded image by accepting the current hash", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: "old prompt",
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
    });

    const result = await keepStaleCourseImage(db, "course-1", "image-1");

    expect(result.image).toMatchObject({ id: "image-1", sourceHash: slots[0].sourceHash, stale: false });
    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: {
        prompt: slots[0].prompt,
        sourceHash: slots[0].sourceHash,
        failureReason: null,
      },
    });
  });

  it("throws not found for missing image id", async () => {
    const { db } = makeDb();

    await expect(keepStaleCourseImage(db, "course-1", "missing")).rejects.toBeInstanceOf(CourseImageNotFoundError);
  });
});
```

- [ ] **Step 2: Run repository tests to verify RED**

Run:

```bash
pnpm test lib/server/repositories/course-images.test.ts -t "course image repository operations"
```

Expected: FAIL because repository operations are not implemented.

- [ ] **Step 3: Extend DB type**

In `lib/server/repositories/course-images.ts`, add these exported types after `CourseImageRecord`:

```ts
type CourseWithDraft = {
  id: string;
  status: "draft" | "building_resources" | "ready" | "build_failed";
  lessonDraft: {
    content: LessonDraft;
  } | null;
};

export type CourseImagesDb = {
  course: {
    findUnique: (query: {
      where: { id: string };
      include: {
        lessonDraft: true;
      };
    }) => Promise<CourseWithDraft | null>;
    update: (query: { where: { id: string }; data: { status: "building_resources" | "ready" | "build_failed" } }) => Promise<unknown>;
  };
  courseImage: {
    findMany: (query: { where: { courseId: string }; orderBy?: Array<{ slotIndex: "asc" } | { createdAt: "asc" }> }) => Promise<CourseImageRecord[]>;
    createMany: (query: {
      data: Array<{
        courseId: string;
        chapterId: string;
        shotId: string;
        slotId: string;
        slotType: "lesson_shot";
        slotIndex: number;
        prompt: string;
        sourceHash: string;
        status: "pending";
        provider: "tencent_hunyuan";
      }>;
      skipDuplicates: true;
    }) => Promise<{ count: number }>;
    findFirst: (query: { where: { id: string; courseId: string } }) => Promise<CourseImageRecord | null>;
    update: (query: { where: { id: string }; data: Partial<CourseImageRecord> }) => Promise<CourseImageRecord>;
  };
};
```

In `lib/server/db.ts`, import and add `CourseImagesDb`:

```ts
import type { CourseImagesDb } from "@/lib/server/repositories/course-images";
```

Change `AppDb` to:

```ts
export type AppDb = AuthDb & PeopleDb & CoursesDb & StoryOptionsDb & LessonDraftsDb & CourseImagesDb;
```

- [ ] **Step 4: Implement repository errors and operations**

Append to `lib/server/repositories/course-images.ts`:

```ts
export class CourseImageNotFoundError extends Error {
  constructor(message = "课程不存在") {
    super(message);
    this.name = "CourseImageNotFoundError";
  }
}

export class CourseImagePrerequisiteError extends Error {
  constructor(message = "请先生成课文草稿") {
    super(message);
    this.name = "CourseImagePrerequisiteError";
  }
}

export class CourseImageInvalidStateError extends Error {
  constructor(message = "当前图片状态不能执行该操作") {
    super(message);
    this.name = "CourseImageInvalidStateError";
  }
}

async function getCourseDraftOrThrow(db: CourseImagesDb, courseId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { lessonDraft: true },
  });

  if (!course) {
    throw new CourseImageNotFoundError("课程不存在");
  }

  if (!course.lessonDraft) {
    throw new CourseImagePrerequisiteError();
  }

  return {
    course,
    draft: course.lessonDraft.content,
  };
}

async function listRecords(db: CourseImagesDb, courseId: string) {
  return db.courseImage.findMany({
    where: { courseId },
    orderBy: [{ slotIndex: "asc" }, { createdAt: "asc" }],
  });
}

function findSlot(slots: PlannedImageSlot[], record: CourseImageRecord) {
  return slots.find((slot) => slot.slotId === record.slotId);
}

async function refreshCourseStatus(db: CourseImagesDb, courseId: string, images: CourseResourceImage[]) {
  const progress = summarizeResourceProgress(images);

  if (progress.total > 0 && progress.succeeded === progress.total && progress.stale === 0) {
    await db.course.update({ where: { id: courseId }, data: { status: "ready" } });
    return;
  }

  if (progress.generating > 0) {
    await db.course.update({ where: { id: courseId }, data: { status: "building_resources" } });
    return;
  }

  if (progress.failed > 0) {
    await db.course.update({ where: { id: courseId }, data: { status: "build_failed" } });
  }
}

export async function getCourseResources(db: CourseImagesDb, courseId: string): Promise<CourseResourcesResponse> {
  const { draft } = await getCourseDraftOrThrow(db, courseId);
  const slots = deriveLessonShotImageSlots(courseId, draft);
  const records = await listRecords(db, courseId);
  const images = mergeImageSlotsWithRecords(slots, records);
  await refreshCourseStatus(db, courseId, images);
  return toResourcesResponse(images);
}

export async function createMissingCourseImages(db: CourseImagesDb, courseId: string): Promise<CourseResourcesResponse> {
  const { draft } = await getCourseDraftOrThrow(db, courseId);
  const slots = deriveLessonShotImageSlots(courseId, draft);
  const records = await listRecords(db, courseId);
  const existingSlotIds = new Set(records.map((record) => record.slotId));
  const missing = slots.filter((slot) => !existingSlotIds.has(slot.slotId));

  if (missing.length === 0) {
    throw new CourseImageInvalidStateError("没有需要生成的图片");
  }

  await db.courseImage.createMany({
    data: missing.map((slot) => ({
      courseId: slot.courseId,
      chapterId: slot.chapterId,
      shotId: slot.shotId,
      slotId: slot.slotId,
      slotType: slot.slotType,
      slotIndex: slot.slotIndex,
      prompt: slot.prompt,
      sourceHash: slot.sourceHash,
      status: "pending",
      provider: "tencent_hunyuan",
    })),
    skipDuplicates: true,
  });

  await db.course.update({ where: { id: courseId }, data: { status: "building_resources" } });
  return getCourseResources(db, courseId);
}

export async function retryCourseImage(db: CourseImagesDb, courseId: string, imageId: string) {
  const { draft } = await getCourseDraftOrThrow(db, courseId);
  const record = await db.courseImage.findFirst({ where: { id: imageId, courseId } });

  if (!record) {
    throw new CourseImageNotFoundError("图片不存在");
  }

  const slot = findSlot(deriveLessonShotImageSlots(courseId, draft), record);

  if (!slot) {
    throw new CourseImageInvalidStateError("当前图片状态不能重试");
  }

  const isStaleSucceeded = record.status === "succeeded" && record.sourceHash !== slot.sourceHash;
  if (record.status !== "failed" && !isStaleSucceeded) {
    throw new CourseImageInvalidStateError("当前图片状态不能重试");
  }

  const updated = await db.courseImage.update({
    where: { id: imageId },
    data: {
      chapterId: slot.chapterId,
      shotId: slot.shotId,
      slotId: slot.slotId,
      slotType: slot.slotType,
      slotIndex: slot.slotIndex,
      prompt: slot.prompt,
      sourceHash: slot.sourceHash,
      status: "pending",
      provider: "tencent_hunyuan",
      providerTaskId: null,
      providerImageUrl: null,
      storagePath: null,
      publicUrl: null,
      failureReason: null,
    },
  });

  await db.course.update({ where: { id: courseId }, data: { status: "building_resources" } });
  return {
    image: mergeImageSlotsWithRecords([slot], [updated])[0],
  };
}

export async function keepStaleCourseImage(db: CourseImagesDb, courseId: string, imageId: string) {
  const { draft } = await getCourseDraftOrThrow(db, courseId);
  const record = await db.courseImage.findFirst({ where: { id: imageId, courseId } });

  if (!record) {
    throw new CourseImageNotFoundError("图片不存在");
  }

  const slot = findSlot(deriveLessonShotImageSlots(courseId, draft), record);
  const isStaleSucceeded = slot && record.status === "succeeded" && record.sourceHash !== slot.sourceHash;

  if (!slot || !isStaleSucceeded) {
    throw new CourseImageInvalidStateError("当前图片不能沿用旧图");
  }

  const updated = await db.courseImage.update({
    where: { id: imageId },
    data: {
      prompt: slot.prompt,
      sourceHash: slot.sourceHash,
      failureReason: null,
    },
  });

  return {
    image: mergeImageSlotsWithRecords([slot], [updated])[0],
  };
}
```

- [ ] **Step 5: Run repository operation tests**

Run:

```bash
pnpm test lib/server/repositories/course-images.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit repository operations**

Run:

```bash
git add lib/server/repositories/course-images.ts lib/server/repositories/course-images.test.ts lib/server/db.ts
git commit -m "Add course image repository operations"
```

Expected: commit succeeds.

---

### Task 4: Add Local Course Image Storage

**Files:**
- Create: `lib/server/storage/course-images.ts`
- Create: `lib/server/storage/course-images.test.ts`

- [ ] **Step 1: Write storage tests**

Create `lib/server/storage/course-images.test.ts` with:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildCourseImageStorageTarget, downloadCourseImage } from "./course-images";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "course-images-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("course image storage", () => {
  it("builds deterministic storage and public paths", () => {
    const target = buildCourseImageStorageTarget({ storageDir: root, courseId: "course-1", imageId: "image-1" });

    expect(target.storagePath).toBe(path.join(root, "course-images", "course-1", "image-1.png"));
    expect(target.publicUrl).toBe("/api/course-images/course-1/image-1.png");
  });

  it("downloads a remote image into storage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })),
    );

    const result = await downloadCourseImage({
      sourceUrl: "https://example.com/image.png",
      storageDir: root,
      courseId: "course-1",
      imageId: "image-1",
    });

    expect(await readFile(result.storagePath)).toEqual(Buffer.from([1, 2, 3]));
    expect(result.publicUrl).toBe("/api/course-images/course-1/image-1.png");
  });

  it("throws when remote download fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    );

    await expect(
      downloadCourseImage({
        sourceUrl: "https://example.com/image.png",
        storageDir: root,
        courseId: "course-1",
        imageId: "image-1",
      }),
    ).rejects.toThrow("图片下载失败：403");
  });
});
```

- [ ] **Step 2: Run storage tests to verify RED**

Run:

```bash
pnpm test lib/server/storage/course-images.test.ts
```

Expected: FAIL because storage module does not exist.

- [ ] **Step 3: Implement storage helpers**

Create `lib/server/storage/course-images.ts` with:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type CourseImageStorageTargetInput = {
  storageDir?: string;
  courseId: string;
  imageId: string;
};

export type CourseImageDownloadInput = CourseImageStorageTargetInput & {
  sourceUrl: string;
};

function resolveStorageDir(storageDir = process.env.STORAGE_DIR) {
  if (!storageDir) {
    throw new Error("STORAGE_DIR is required");
  }

  return storageDir;
}

export function buildCourseImageStorageTarget(input: CourseImageStorageTargetInput) {
  const root = resolveStorageDir(input.storageDir);
  const storagePath = path.join(root, "course-images", input.courseId, `${input.imageId}.png`);

  return {
    storagePath,
    publicUrl: `/api/course-images/${input.courseId}/${input.imageId}.png`,
  };
}

export async function downloadCourseImage(input: CourseImageDownloadInput) {
  const response = await fetch(input.sourceUrl);

  if (!response.ok) {
    throw new Error(`图片下载失败：${response.status}`);
  }

  const target = buildCourseImageStorageTarget(input);
  await mkdir(path.dirname(target.storagePath), { recursive: true });
  await writeFile(target.storagePath, Buffer.from(await response.arrayBuffer()));

  return target;
}
```

- [ ] **Step 4: Run storage tests**

Run:

```bash
pnpm test lib/server/storage/course-images.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit storage helpers**

Run:

```bash
git add lib/server/storage/course-images.ts lib/server/storage/course-images.test.ts
git commit -m "Add local course image storage"
```

Expected: commit succeeds.

---

### Task 5: Add Tencent Hunyuan Image Client

**Files:**
- Create: `lib/server/ai/tencent-hunyuan-image.ts`
- Create: `lib/server/ai/tencent-hunyuan-image.test.ts`

- [ ] **Step 1: Write Tencent client tests**

Create `lib/server/ai/tencent-hunyuan-image.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTencentHunyuanImageClient,
  normalizeTencentImageJob,
  TencentHunyuanImageConfigError,
} from "./tencent-hunyuan-image";

describe("Tencent Hunyuan image client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.TENCENTCLOUD_SECRET_ID;
    delete process.env.TENCENTCLOUD_SECRET_KEY;
    delete process.env.TENCENTCLOUD_REGION;
    delete process.env.TENCENT_HUNYUAN_IMAGE_MODEL;
  });

  it("throws when config is missing", () => {
    expect(() => createTencentHunyuanImageClient()).toThrow(TencentHunyuanImageConfigError);
  });

  it("normalizes succeeded, failed, and running jobs", () => {
    expect(normalizeTencentImageJob({ JobStatusCode: "5", ResultImage: ["https://example.com/a.png"] })).toEqual({
      status: "succeeded",
      imageUrl: "https://example.com/a.png",
      failureReason: null,
    });

    expect(normalizeTencentImageJob({ JobStatusCode: "6", JobErrorMsg: "blocked" })).toEqual({
      status: "failed",
      imageUrl: null,
      failureReason: "blocked",
    });

    expect(normalizeTencentImageJob({ JobStatusCode: "4" })).toEqual({
      status: "generating",
      imageUrl: null,
      failureReason: null,
    });
  });

  it("submits a job through Tencent API", async () => {
    process.env.TENCENTCLOUD_SECRET_ID = "id";
    process.env.TENCENTCLOUD_SECRET_KEY = "key";
    process.env.TENCENTCLOUD_REGION = "ap-guangzhou";
    process.env.TENCENT_HUNYUAN_IMAGE_MODEL = "hunyuan-image";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ Response: { JobId: "job-1", RequestId: "request-1" } }),
      })),
    );

    const client = createTencentHunyuanImageClient();
    const result = await client.submit({ prompt: "A picture-book scene.", width: 1024, height: 768 });

    expect(result).toEqual({ taskId: "job-1" });
    expect(fetch).toHaveBeenCalledWith(
      "https://hunyuan.tencentcloudapi.com",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json; charset=utf-8",
          Host: "hunyuan.tencentcloudapi.com",
          "X-TC-Action": expect.any(String),
        }),
      }),
    );
  });

  it("queries a job through Tencent API", async () => {
    process.env.TENCENTCLOUD_SECRET_ID = "id";
    process.env.TENCENTCLOUD_SECRET_KEY = "key";
    process.env.TENCENTCLOUD_REGION = "ap-guangzhou";
    process.env.TENCENT_HUNYUAN_IMAGE_MODEL = "hunyuan-image";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          Response: {
            JobStatusCode: "5",
            ResultImage: ["https://example.com/a.png"],
            RequestId: "request-1",
          },
        }),
      })),
    );

    const client = createTencentHunyuanImageClient();
    const result = await client.query({ taskId: "job-1" });

    expect(result).toEqual({ status: "succeeded", imageUrl: "https://example.com/a.png", failureReason: null });
  });
});
```

- [ ] **Step 2: Run Tencent tests to verify RED**

Run:

```bash
pnpm test lib/server/ai/tencent-hunyuan-image.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement Tencent client**

Create `lib/server/ai/tencent-hunyuan-image.ts` with:

```ts
import { createHash, createHmac } from "node:crypto";

export class TencentHunyuanImageConfigError extends Error {
  constructor(message = "腾讯混元生图配置缺失") {
    super(message);
    this.name = "TencentHunyuanImageConfigError";
  }
}

type TencentConfig = {
  secretId: string;
  secretKey: string;
  region: string;
  model: string;
};

type SubmitInput = {
  prompt: string;
  width: 1024;
  height: 768;
};

type QueryInput = {
  taskId: string;
};

type TencentJobPayload = {
  JobStatusCode?: string;
  ResultImage?: string[];
  JobErrorMsg?: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getConfig(): TencentConfig {
  const secretId = process.env.TENCENTCLOUD_SECRET_ID;
  const secretKey = process.env.TENCENTCLOUD_SECRET_KEY;
  const region = process.env.TENCENTCLOUD_REGION || "ap-guangzhou";
  const model = process.env.TENCENT_HUNYUAN_IMAGE_MODEL || "hunyuan-image";

  if (!secretId || !secretKey) {
    throw new TencentHunyuanImageConfigError();
  }

  return { secretId, secretKey, region, model };
}

function signHeaders(config: TencentConfig, action: string, payload: string) {
  const host = "hunyuan.tencentcloudapi.com";
  const service = "hunyuan";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const algorithm = "TC3-HMAC-SHA256";
  const hashedRequestPayload = sha256(payload);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, hashedRequestPayload].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [algorithm, timestamp, credentialScope, sha256(canonicalRequest)].join("\n");
  const secretDate = hmac(`TC3${config.secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmacHex(secretSigning, stringToSign);
  const authorization = `${algorithm} Credential=${config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorization,
    "Content-Type": "application/json; charset=utf-8",
    Host: host,
    "X-TC-Action": action,
    "X-TC-Timestamp": String(timestamp),
    "X-TC-Version": "2023-09-01",
    "X-TC-Region": config.region,
  };
}

async function requestTencent(action: string, body: Record<string, unknown>, config: TencentConfig) {
  const payload = JSON.stringify(body);
  const response = await fetch("https://hunyuan.tencentcloudapi.com", {
    method: "POST",
    headers: signHeaders(config, action, payload),
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`腾讯混元请求失败：${response.status}`);
  }

  const data = (await response.json()) as { Response?: Record<string, unknown> };

  if (data.Response?.Error) {
    const error = data.Response.Error as { Message?: string };
    throw new Error(error.Message || "腾讯混元请求失败");
  }

  return data.Response ?? {};
}

export function normalizeTencentImageJob(payload: TencentJobPayload) {
  if (payload.JobStatusCode === "5" && payload.ResultImage?.[0]) {
    return {
      status: "succeeded" as const,
      imageUrl: payload.ResultImage[0],
      failureReason: null,
    };
  }

  if (payload.JobStatusCode === "6") {
    return {
      status: "failed" as const,
      imageUrl: null,
      failureReason: payload.JobErrorMsg || "腾讯混元图片生成失败",
    };
  }

  return {
    status: "generating" as const,
    imageUrl: null,
    failureReason: null,
  };
}

export function createTencentHunyuanImageClient(config = getConfig()) {
  return {
    async submit(input: SubmitInput) {
      const response = await requestTencent(
        "SubmitHunyuanImageJob",
        {
          Prompt: input.prompt,
          Style: "201",
          Resolution: `${input.width}:${input.height}`,
          Model: config.model,
        },
        config,
      );
      const taskId = response.JobId;

      if (typeof taskId !== "string" || !taskId) {
        throw new Error("腾讯混元未返回任务 ID");
      }

      return { taskId };
    },

    async query(input: QueryInput) {
      const response = await requestTencent("QueryHunyuanImageJob", { JobId: input.taskId }, config);
      return normalizeTencentImageJob(response as TencentJobPayload);
    },
  };
}
```

- [ ] **Step 4: Run Tencent tests**

Run:

```bash
pnpm test lib/server/ai/tencent-hunyuan-image.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Tencent client**

Run:

```bash
git add lib/server/ai/tencent-hunyuan-image.ts lib/server/ai/tencent-hunyuan-image.test.ts
git commit -m "Add Tencent Hunyuan image client"
```

Expected: commit succeeds.

---

### Task 6: Add Queue Advancement

**Files:**
- Modify: `lib/server/repositories/course-images.ts`
- Modify: `lib/server/repositories/course-images.test.ts`

- [ ] **Step 1: Add queue advancement tests**

Append to `lib/server/repositories/course-images.test.ts`:

```ts
import { advanceCourseImageQueue } from "./course-images";

describe("course image queue advancement", () => {
  it("submits one pending image when no image is active", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: slots[0].prompt,
      sourceHash: slots[0].sourceHash,
      status: "pending",
      provider: "tencent_hunyuan",
      providerTaskId: null,
      providerImageUrl: null,
      storagePath: null,
      publicUrl: null,
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await advanceCourseImageQueue(db, "course-1", {
      provider: {
        submit: vi.fn(async () => ({ taskId: "task-1" })),
        query: vi.fn(),
      },
      download: vi.fn(),
    });

    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: { status: "generating", providerTaskId: "task-1", failureReason: null },
    });
  });

  it("marks submitting failures as failed", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: slots[0].prompt,
      sourceHash: slots[0].sourceHash,
      status: "pending",
      provider: "tencent_hunyuan",
      providerTaskId: null,
      providerImageUrl: null,
      storagePath: null,
      publicUrl: null,
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await advanceCourseImageQueue(db, "course-1", {
      provider: {
        submit: vi.fn(async () => {
          throw new Error("quota exceeded");
        }),
        query: vi.fn(),
      },
      download: vi.fn(),
    });

    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: { status: "failed", failureReason: "quota exceeded" },
    });
  });

  it("downloads succeeded remote image and marks local image succeeded", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: slots[0].prompt,
      sourceHash: slots[0].sourceHash,
      status: "generating",
      provider: "tencent_hunyuan",
      providerTaskId: "task-1",
      providerImageUrl: null,
      storagePath: null,
      publicUrl: null,
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await advanceCourseImageQueue(db, "course-1", {
      provider: {
        submit: vi.fn(),
        query: vi.fn(async () => ({ status: "succeeded", imageUrl: "https://example.com/a.png", failureReason: null })),
      },
      download: vi.fn(async () => ({
        storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
        publicUrl: "/api/course-images/course-1/image-1.png",
      })),
    });

    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: {
        status: "succeeded",
        providerImageUrl: "https://example.com/a.png",
        storagePath: "/data/pbl-images/course-images/course-1/image-1.png",
        publicUrl: "/api/course-images/course-1/image-1.png",
        failureReason: null,
      },
    });
  });

  it("marks remote failed jobs as failed", async () => {
    const { db, state } = makeDb();
    const slots = deriveLessonShotImageSlots("course-1", draft());
    state.images.push({
      id: "image-1",
      courseId: "course-1",
      chapterId: "chapter-1",
      shotId: "shot-1",
      slotId: "slot-1",
      slotType: "lesson_shot",
      slotIndex: 1,
      prompt: slots[0].prompt,
      sourceHash: slots[0].sourceHash,
      status: "generating",
      provider: "tencent_hunyuan",
      providerTaskId: "task-1",
      providerImageUrl: null,
      storagePath: null,
      publicUrl: null,
      failureReason: null,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      updatedAt: new Date("2026-07-08T00:00:00Z"),
    });

    await advanceCourseImageQueue(db, "course-1", {
      provider: {
        submit: vi.fn(),
        query: vi.fn(async () => ({ status: "failed", imageUrl: null, failureReason: "content rejected" })),
      },
      download: vi.fn(),
    });

    expect(db.courseImage.update).toHaveBeenCalledWith({
      where: { id: "image-1" },
      data: { status: "failed", failureReason: "content rejected" },
    });
  });
});
```

- [ ] **Step 2: Run queue tests to verify RED**

Run:

```bash
pnpm test lib/server/repositories/course-images.test.ts -t "queue advancement"
```

Expected: FAIL because `advanceCourseImageQueue` is missing.

- [ ] **Step 3: Implement queue advancement**

In `lib/server/repositories/course-images.ts`, add:

```ts
export type CourseImageQueueDeps = {
  provider: {
    submit: (input: { prompt: string; width: 1024; height: 768 }) => Promise<{ taskId: string }>;
    query: (input: { taskId: string }) => Promise<
      | { status: "generating"; imageUrl: null; failureReason: null }
      | { status: "succeeded"; imageUrl: string; failureReason: null }
      | { status: "failed"; imageUrl: null; failureReason: string }
    >;
  };
  download: (input: { sourceUrl: string; courseId: string; imageId: string }) => Promise<{ storagePath: string; publicUrl: string }>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "图片任务处理失败";
}

export async function advanceCourseImageQueue(db: CourseImagesDb, courseId: string, deps: CourseImageQueueDeps) {
  await getCourseDraftOrThrow(db, courseId);
  const records = await listRecords(db, courseId);
  const active = records.filter((image) => image.status === "submitting" || image.status === "generating");

  for (const image of active) {
    if (!image.providerTaskId) {
      await db.courseImage.update({
        where: { id: image.id },
        data: { status: "failed", failureReason: "腾讯混元任务 ID 缺失" },
      });
      continue;
    }

    try {
      const remote = await deps.provider.query({ taskId: image.providerTaskId });

      if (remote.status === "generating") {
        continue;
      }

      if (remote.status === "failed") {
        await db.courseImage.update({
          where: { id: image.id },
          data: { status: "failed", failureReason: remote.failureReason },
        });
        continue;
      }

      const local = await deps.download({ sourceUrl: remote.imageUrl, courseId, imageId: image.id });
      await db.courseImage.update({
        where: { id: image.id },
        data: {
          status: "succeeded",
          providerImageUrl: remote.imageUrl,
          storagePath: local.storagePath,
          publicUrl: local.publicUrl,
          failureReason: null,
        },
      });
    } catch (error) {
      await db.courseImage.update({
        where: { id: image.id },
        data: {
          status: "failed",
          providerImageUrl: image.providerImageUrl,
          failureReason: errorMessage(error),
        },
      });
    }
  }

  const refreshed = await listRecords(db, courseId);
  const stillActive = refreshed.some((image) => image.status === "submitting" || image.status === "generating");

  if (stillActive) {
    return;
  }

  const pending = refreshed.find((image) => image.status === "pending");

  if (!pending) {
    return;
  }

  try {
    await db.courseImage.update({
      where: { id: pending.id },
      data: { status: "submitting", failureReason: null },
    });
    const submitted = await deps.provider.submit({ prompt: pending.prompt, width: 1024, height: 768 });
    await db.courseImage.update({
      where: { id: pending.id },
      data: { status: "generating", providerTaskId: submitted.taskId, failureReason: null },
    });
  } catch (error) {
    await db.courseImage.update({
      where: { id: pending.id },
      data: { status: "failed", failureReason: errorMessage(error) },
    });
  }
}
```

- [ ] **Step 4: Run repository tests**

Run:

```bash
pnpm test lib/server/repositories/course-images.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit queue advancement**

Run:

```bash
git add lib/server/repositories/course-images.ts lib/server/repositories/course-images.test.ts
git commit -m "Add course image queue advancement"
```

Expected: commit succeeds.

---

### Task 7: Add Resource API Routes

**Files:**
- Create: `app/api/courses/[id]/resources/route.ts`
- Create: `app/api/courses/[id]/resources/generate/route.ts`
- Create: `app/api/courses/[id]/resources/images/[imageId]/retry/route.ts`
- Create: `app/api/courses/[id]/resources/images/[imageId]/keep/route.ts`
- Modify: `lib/server/repositories/course-images.ts`

- [ ] **Step 1: Add production queue dependency factory**

At the bottom of `lib/server/repositories/course-images.ts`, add:

```ts
export async function getCourseResourcesAndAdvance(db: CourseImagesDb, courseId: string, deps: CourseImageQueueDeps) {
  await advanceCourseImageQueue(db, courseId, deps);
  return getCourseResources(db, courseId);
}
```

- [ ] **Step 2: Create resources API route**

Create `app/api/courses/[id]/resources/route.ts`:

```ts
import { NextResponse } from "next/server";

import { createTencentHunyuanImageClient, TencentHunyuanImageConfigError } from "@/lib/server/ai/tencent-hunyuan-image";
import { getDb } from "@/lib/server/db";
import {
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  getCourseResourcesAndAdvance,
} from "@/lib/server/repositories/course-images";
import { downloadCourseImage } from "@/lib/server/storage/course-images";

function queueDeps() {
  return {
    provider: createTencentHunyuanImageClient(),
    download: downloadCourseImage,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await getCourseResourcesAndAdvance(getDb(), id, queueDeps());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CourseImageNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CourseImagePrerequisiteError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    if (error instanceof TencentHunyuanImageConfigError) {
      const result = await import("@/lib/server/repositories/course-images").then(({ getCourseResources }) =>
        getCourseResources(getDb(), id),
      );
      return NextResponse.json(result);
    }

    console.error("Resource status loading failed", error);
    return NextResponse.json({ message: "资源状态加载失败" }, { status: 500 });
  }
}

```

- [ ] **Step 3: Create generate API route**

Create `app/api/courses/[id]/resources/generate/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseImageInvalidStateError,
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  createMissingCourseImages,
} from "@/lib/server/repositories/course-images";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await createMissingCourseImages(getDb(), id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CourseImageNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CourseImagePrerequisiteError || error instanceof CourseImageInvalidStateError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Resource generation task creation failed", error);
    return NextResponse.json({ message: "资源生成任务创建失败" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create retry API route**

Create `app/api/courses/[id]/resources/images/[imageId]/retry/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseImageInvalidStateError,
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  retryCourseImage,
} from "@/lib/server/repositories/course-images";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const { id, imageId } = await params;

  try {
    const result = await retryCourseImage(getDb(), id, imageId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CourseImageNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CourseImagePrerequisiteError || error instanceof CourseImageInvalidStateError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Resource image retry failed", error);
    return NextResponse.json({ message: "图片重试失败" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Create keep API route**

Create `app/api/courses/[id]/resources/images/[imageId]/keep/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseImageInvalidStateError,
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  keepStaleCourseImage,
} from "@/lib/server/repositories/course-images";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const { id, imageId } = await params;

  try {
    const result = await keepStaleCourseImage(getDb(), id, imageId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CourseImageNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CourseImagePrerequisiteError || error instanceof CourseImageInvalidStateError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Keeping stale image failed", error);
    return NextResponse.json({ message: "沿用旧图失败" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Run route-related checks**

Run:

```bash
pnpm test lib/server/repositories/course-images.test.ts lib/server/ai/tencent-hunyuan-image.test.ts lib/server/storage/course-images.test.ts
pnpm lint
```

Expected: tests PASS and lint exits 0.

- [ ] **Step 7: Commit API routes**

Run:

```bash
git add app/api/courses/[id]/resources/route.ts app/api/courses/[id]/resources/generate/route.ts app/api/courses/[id]/resources/images/[imageId]/retry/route.ts app/api/courses/[id]/resources/images/[imageId]/keep/route.ts lib/server/repositories/course-images.ts
git commit -m "Add course resource API routes"
```

Expected: commit succeeds.

---

### Task 8: Build Step 4 Frontend Page

**Files:**
- Create: `app/courses/[id]/create/resources/page.tsx`
- Create: `features/courses/components/course-resources-manager.tsx`
- Modify: `features/courses/components/course-create-steps.tsx`

- [ ] **Step 1: Create resources page entry**

Create `app/courses/[id]/create/resources/page.tsx`:

```tsx
import { ProtectedLayout } from "@/components/protected-layout";
import { CourseResourcesManager } from "@/features/courses/components/course-resources-manager";

export default async function CourseResourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedLayout>
      <CourseResourcesManager courseId={id} />
    </ProtectedLayout>
  );
}
```

- [ ] **Step 2: Add Step 4 link metadata**

In `features/courses/components/course-create-steps.tsx`, change the steps array to:

```ts
const steps: CreateStep[] = [
  { step: 1, label: "基础信息", href: "basic" },
  { step: 2, label: "故事方案", href: "story-options" },
  { step: 3, label: "课文编辑", href: "lesson-draft" },
  { step: 4, label: "资源生成", href: "resources" },
  { step: 5, label: "课程预览" },
] as const;
```

Change `canLink` to allow completed and current steps:

```ts
const canLink = Boolean(courseId && item.href && item.step <= currentStep);
```

This line already exists; keep it unchanged after adding the `href` values.

- [ ] **Step 3: Create resources manager component**

Create `features/courses/components/course-resources-manager.tsx`:

```tsx
"use client";

import { AlertCircle, CheckCircle2, ImageIcon, Loader2, RefreshCcw, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type { CourseResourceImage, CourseResourcesResponse } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

const statusLabels: Record<CourseResourceImage["status"], string> = {
  missing: "未生成",
  pending: "排队中",
  submitting: "提交中",
  generating: "生成中",
  succeeded: "已完成",
  failed: "生成失败",
};

function shouldPoll(data: CourseResourcesResponse | null) {
  return Boolean(data?.images.some((image) => image.status === "pending" || image.status === "submitting" || image.status === "generating"));
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "请求失败");
  }

  return data;
}

function ProgressSummary({ data }: { data: CourseResourcesResponse }) {
  const { progress } = data;
  const percent = progress.total > 0 ? Math.round((progress.succeeded / progress.total) * 100) : 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-violet-700">Step 4</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">资源生成</h1>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-slate-950">{percent}%</p>
          <p className="text-sm text-slate-500">
            {progress.succeeded} / {progress.total} 张完成
          </p>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <Stat label="生成中" value={progress.generating} />
        <Stat label="失败" value={progress.failed} />
        <Stat label="未生成" value={progress.missing} />
        <Stat label="内容变化" value={progress.stale} />
        <Stat label="总数" value={progress.total} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ImageCard({
  image,
  busy,
  onRetry,
  onKeep,
}: {
  image: CourseResourceImage;
  busy: boolean;
  onRetry: (image: CourseResourceImage) => void;
  onKeep: (image: CourseResourceImage) => void;
}) {
  const canRetry = Boolean(image.id && (image.status === "failed" || image.stale));
  const canKeep = Boolean(image.id && image.stale && image.status === "succeeded");

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="aspect-[4/3] bg-slate-100">
        {image.publicUrl ? (
          <div className="h-full bg-cover bg-center" style={{ backgroundImage: `url(${image.publicUrl})` }} />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <ImageIcon className="size-10" />
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">
              {image.chapterTitle} · Shot {image.shotOrder}
            </p>
            <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-950">{image.action}</h3>
          </div>
          <StatusBadge image={image} />
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-slate-500">{image.scenePrompt}</p>
        {image.failureReason ? (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{image.failureReason}</p>
        ) : null}
        {image.stale ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">课文分镜内容已变化，可沿用旧图或重新生成。</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canRetry ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRetry(image)}
              className="inline-flex min-h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className="size-4" />
              重新生成
            </button>
          ) : null}
          {canKeep ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onKeep(image)}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="size-4" />
              沿用旧图
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ image }: { image: CourseResourceImage }) {
  const active = image.status === "pending" || image.status === "submitting" || image.status === "generating";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        image.status === "succeeded" && !image.stale && "bg-emerald-50 text-emerald-700",
        image.status === "failed" && "bg-rose-50 text-rose-700",
        image.status === "missing" && "bg-slate-100 text-slate-600",
        image.stale && "bg-amber-50 text-amber-700",
        active && "bg-blue-50 text-blue-700",
      )}
    >
      {active ? <Loader2 className="size-3 animate-spin" /> : image.status === "failed" ? <AlertCircle className="size-3" /> : null}
      {image.stale ? "内容变化" : statusLabels[image.status]}
    </span>
  );
}

export function CourseResourcesManager({ courseId }: { courseId: string }) {
  const [data, setData] = useState<CourseResourcesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = (await readJson(await fetch(`/api/courses/${courseId}/resources`, { cache: "no-store" }))) as CourseResourcesResponse;
    setData(result);
    setError(null);
  }, [courseId]);

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "资源状态加载失败"));
  }, [load]);

  useEffect(() => {
    if (!shouldPoll(data)) {
      return;
    }

    const timer = window.setInterval(() => {
      void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "资源状态加载失败"));
    }, 2500);

    return () => window.clearInterval(timer);
  }, [data, load]);

  const grouped = useMemo(() => {
    const groups = new Map<string, CourseResourceImage[]>();
    data?.images.forEach((image) => {
      const current = groups.get(image.chapterTitle) ?? [];
      current.push(image);
      groups.set(image.chapterTitle, current);
    });
    return Array.from(groups.entries());
  }, [data]);

  async function mutate(path: string) {
    setBusy(true);
    try {
      const result = (await readJson(await fetch(path, { method: "POST" }))) as CourseResourcesResponse | { image: CourseResourceImage };
      if ("images" in result) {
        setData(result);
      } else {
        await load();
      }
      setError(null);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <CourseCreateSteps currentStep={4} courseId={courseId} />

        {data ? <ProgressSummary data={data} /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-slate-950">图片任务</p>
            <p className="mt-1 text-sm text-slate-500">进入页面不会自动消耗额度，点击后只创建缺失图片任务。</p>
          </div>
          <button
            type="button"
            disabled={busy || !data || data.progress.missing === 0}
            onClick={() => void mutate(`/api/courses/${courseId}/resources/generate`)}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-violet-600 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
            生成全部缺失图片
          </button>
        </div>

        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <div className="space-y-6">
          {grouped.map(([chapterTitle, images]) => (
            <section key={chapterTitle} className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-950">{chapterTitle}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {images.map((image) => (
                  <ImageCard
                    key={image.slotId}
                    image={image}
                    busy={busy}
                    onRetry={(item) => item.id && void mutate(`/api/courses/${courseId}/resources/images/${item.id}/retry`)}
                    onKeep={(item) => item.id && void mutate(`/api/courses/${courseId}/resources/images/${item.id}/keep`)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Commit Step 4 UI**

Run:

```bash
git add app/courses/[id]/create/resources/page.tsx features/courses/components/course-resources-manager.tsx features/courses/components/course-create-steps.tsx
git commit -m "Add course resource generation UI"
```

Expected: commit succeeds.

---

### Task 9: Wire Navigation from Step 3 to Step 4

**Files:**
- Modify: `features/courses/components/lesson-draft-manager.tsx`

- [ ] **Step 1: Inspect current Step 3 completion controls**

Run:

```bash
rg -n "保存|继续|resources|lesson-draft|router.push|CourseCreateSteps" features/courses/components/lesson-draft-manager.tsx
```

Expected: output shows where the save button and creation steps are rendered.

- [ ] **Step 2: Add Step 4 navigation after successful save**

In `features/courses/components/lesson-draft-manager.tsx`, import `Link` if it is not already imported:

```tsx
import Link from "next/link";
```

Near the existing save action area, add this link after the save button:

```tsx
<Link
  href={`/courses/${courseId}/create/resources`}
  className="inline-flex min-h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800"
>
  进入资源生成
</Link>
```

If the existing action area uses a different button style, keep the existing local style and only add the route/link behavior.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Commit navigation**

Run:

```bash
git add features/courses/components/lesson-draft-manager.tsx
git commit -m "Link lesson draft to resource generation"
```

Expected: commit succeeds.

---

### Task 10: Verify End-to-End Build and Update Docs

**Files:**
- Modify: `docs/frontend/course-create-resources.md`
- Modify: `docs/frontend/README.md` if status wording needs update

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm test lib/server/repositories/course-images.test.ts lib/server/ai/tencent-hunyuan-image.test.ts lib/server/storage/course-images.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Update module document**

In `docs/frontend/course-create-resources.md`, replace the implementation status block with:

```md
## 实现状态

- 状态：已实现，待用户验收
- 实现提交：待记录为最终实现提交号
- 验证命令：`pnpm prisma:generate`、`pnpm test lib/server/repositories/course-images.test.ts lib/server/ai/tencent-hunyuan-image.test.ts lib/server/storage/course-images.test.ts`、`pnpm test`、`pnpm lint`、`pnpm build`
- 验证结果：待记录实际执行结果
```

- [ ] **Step 6: Commit docs update**

Run:

```bash
git add docs/frontend/course-create-resources.md docs/frontend/README.md
git commit -m "Update step 4 implementation status"
```

Expected: commit succeeds if docs changed.

---

## Self-Review

Spec coverage:
- Step 4 only generates lesson shot images: Tasks 2, 3, 8.
- No cover/closing/manual slots: Task 2 derives only `chapters[].shots[]`; docs keep cover TODO.
- User-triggered generation: Task 8 POST only from button; no auto POST on page load.
- Async progress and refresh recovery: Tasks 3, 6, 7, 8.
- Tencent Hunyuan async API: Task 5.
- Local persistent image storage: Task 4 and Task 6.
- DB-backed status: Tasks 1 and 3.
- Failed/stale retry and keep old image: Task 3 and Task 8.
- MVP no Worker/MQ/WebSocket: Task 6 advances from polling API.

Placeholder scan:
- No `TBD`, unspecified "handle edge cases", or missing implementation steps remain.

Type consistency:
- `CourseResourceImage`, `ResourceProgress`, `CourseResourcesResponse`, `CourseImagesDb`, `CourseImageRecord`, and `CourseImageQueueDeps` are introduced before later tasks use them.
