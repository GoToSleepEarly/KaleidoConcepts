# Course Preview And PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Step 5 HTML preview and student PDF preview from real `LessonDraft + course_images` data without generating or storing HTML/PDF files.

**Architecture:** Add a read-only preview repository and API that page-izes course content into cover, lesson shot, and closing reading pages. Replace the current mock `CoursePlayer` with shared preview document components used by `/courses/:id`, `/courses/:id/create/preview`, and `/courses/:id/pdf`.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma repository pattern, Vitest, Testing Library, Tailwind CSS.

---

## File Structure

- Modify: `lib/contracts/api.ts`
  - Add preview response/page/image types.
- Modify: `lib/api-contract.ts`
  - Re-export preview contract types.
- Create: `lib/server/repositories/course-preview.ts`
  - Read course, people, lesson draft, and image records.
  - Build preview pages and resource progress without advancing image queue.
- Create: `lib/server/repositories/course-preview.test.ts`
  - Unit-test page generation, image status mapping, stale handling, and missing draft errors.
- Create: `app/api/courses/[id]/preview/route.ts`
  - Thin route wrapper around `getCoursePreview`.
- Create: `features/courses/components/course-preview.tsx`
  - Shared `CoursePreviewDocument`, HTML preview shell, PDF preview shell, image frame, answer tools.
- Create: `features/courses/components/course-preview.test.tsx`
  - Component tests for HTML/PDF visibility, blank rendering, answers, and missing images.
- Modify: `features/courses/components/course-create-steps.tsx`
  - Add Step 5 href.
- Modify: `features/courses/components/course-resources-manager.tsx`
  - Add entry to Step 5 when preview data can be opened.
- Modify: `features/courses/components/course-player.tsx`
  - Either delete after replacing imports, or reduce to a compatibility wrapper around new preview components.
- Modify: `app/courses/[id]/page.tsx`
  - Use `CourseHtmlPreview`.
- Create: `app/courses/[id]/create/preview/page.tsx`
  - Use `CourseHtmlPreview` with creation step navigation enabled.
- Modify: `app/courses/[id]/pdf/page.tsx`
  - Use `CoursePdfPreview`.
- Modify: `app/globals.css`
  - Add print page rules used by preview pages.
- Modify: `docs/frontend/course-preview-and-pdf.md`
  - Fill implementation status, validation commands, and commit hash after implementation.
- Modify: `docs/frontend/README.md`
  - Move Step 5 status to implemented after verification.

Do not add a Prisma migration. Do not generate HTML or PDF files.

---

### Task 1: Preview Contract Types

**Files:**
- Modify: `lib/contracts/api.ts`
- Modify: `lib/api-contract.ts`

- [ ] **Step 1: Add preview types to `lib/contracts/api.ts`**

Append these types after `CourseResourcesResponse` so preview contracts live near resource contracts:

```ts
export type CoursePreviewCourse = {
  id: string;
  title: string;
  teacherName: string | null;
  studentNames: string[];
  englishLevel: EnglishLevel;
  durationMinutes: number;
  theme: string;
  grammar: string[];
};

export type CoursePreviewResourceProgress = ResourceProgress;

export type CoursePreviewImage = {
  status: ResourceImageStatus;
  publicUrl: string | null;
  stale: boolean;
  failureReason: string | null;
};

export type CoursePreviewBlock = LessonBlock;

export type CoursePreviewExercise = LessonExercise;

export type CoursePreviewPage =
  | {
      id: string;
      type: "cover";
      title: string;
    }
  | {
      id: string;
      type: "lesson_shot";
      chapterId: string;
      chapterTitle: string;
      chapterIndex: number;
      shotId: string;
      shotOrder: 1 | 2;
      title: string;
      image: CoursePreviewImage;
      blocks: CoursePreviewBlock[];
      exercises: CoursePreviewExercise[];
    }
  | {
      id: string;
      type: "closing_reading";
      title: string;
      text: string;
      vocabularyTerms: string[];
    };

export type CoursePreviewResponse = {
  course: CoursePreviewCourse;
  resourceProgress: CoursePreviewResourceProgress;
  pages: CoursePreviewPage[];
};
```

- [ ] **Step 2: Re-export preview types from `lib/api-contract.ts`**

Add these names to the existing export list:

```ts
  CoursePreviewBlock,
  CoursePreviewCourse,
  CoursePreviewExercise,
  CoursePreviewImage,
  CoursePreviewPage,
  CoursePreviewResourceProgress,
  CoursePreviewResponse,
```

- [ ] **Step 3: Run type-aware tests**

Run:

```bash
pnpm test lib/server/repositories/course-images.test.ts
```

Expected: PASS. This is a narrow smoke check that existing contracts still compile.

- [ ] **Step 4: Commit only contract files**

```bash
git add lib/contracts/api.ts lib/api-contract.ts
git commit -m "Add course preview API contracts"
```

If the user does not want commits, skip this step and keep the files unstaged.

---

### Task 2: Preview Repository

**Files:**
- Create: `lib/server/repositories/course-preview.ts`
- Create: `lib/server/repositories/course-preview.test.ts`

- [ ] **Step 1: Write failing repository tests**

Create `lib/server/repositories/course-preview.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { CourseImageRecord } from "@/lib/server/repositories/course-images";
import type { LessonDraft } from "@/lib/contracts/api";
import {
  CoursePreviewNotFoundError,
  CoursePreviewPrerequisiteError,
  getCoursePreview,
  toPreviewPages,
} from "./course-preview";

function draft(): LessonDraft {
  return {
    schemaVersion: "lesson_draft_v1",
    sourceStoryOptionId: "story-1",
    generationMode: "ai",
    title: "The Moon Gate",
    language: "en",
    visualStyle: {
      artStyle: "warm watercolor",
      colorPalette: "mint and gold",
      aspectRatio: "4:3",
      consistencyPrompt: "Use the same picture-book style.",
    },
    characters: [],
    chapters: [
      {
        id: "chapter-1",
        sourceOutlineChapterIndex: 1,
        title: "The First Gate",
        wordTarget: { min: 110, max: 130 },
        exerciseTarget: { verbBlankCount: 7, vocabularyHintCount: 3 },
        blocks: [
          { id: "block-1", order: 1, type: "text", text: "Summer opens the gate." },
          {
            id: "block-2",
            order: 2,
            type: "exercise",
            exerciseId: "exercise-1",
            display: { kind: "verb_blank", placeholder: "________", prompt: "open" },
          },
          { id: "block-3", order: 3, type: "text", text: "The moon path shines." },
        ],
        exercises: [{ id: "exercise-1", type: "verb_blank", answer: "opens", baseVerb: "open" }],
        shots: [
          {
            id: "shot-1",
            order: 1,
            imageSlotId: "slot-1",
            coveredBlockIds: ["block-1", "block-2"],
            characterIds: [],
            location: "garden gate",
            action: "Summer opens a gate.",
            mood: "curious",
            scenePrompt: "A gate glows.",
            composition: "Wide 4:3 page.",
            continuityNotes: "Keep style consistent.",
          },
          {
            id: "shot-2",
            order: 2,
            imageSlotId: "slot-2",
            coveredBlockIds: ["block-3"],
            characterIds: [],
            location: "moon path",
            action: "Summer follows the moon path.",
            mood: "brave",
            scenePrompt: "A moon path shines.",
            composition: "Wide 4:3 page.",
            continuityNotes: "Keep style consistent.",
          },
        ],
      },
    ],
    closingReading: {
      title: "After the Gate",
      text: "Summer remembers the moon gate.",
      vocabularyTerms: ["gate", "path"],
    },
  };
}

function imageRecord(slotId: string, patch: Partial<CourseImageRecord> = {}): CourseImageRecord {
  return {
    id: `image-${slotId}`,
    courseId: "course-1",
    chapterId: "chapter-1",
    shotId: slotId === "slot-1" ? "shot-1" : "shot-2",
    slotId,
    slotType: "lesson_shot",
    slotIndex: slotId === "slot-1" ? 1 : 2,
    prompt: "prompt",
    sourceHash: "hash",
    status: "succeeded",
    provider: "tencent_hunyuan",
    providerTaskId: null,
    providerImageUrl: null,
    storagePath: "/data/image.png",
    publicUrl: `/api/course-images/course-1/${slotId}.png`,
    failureReason: null,
    createdAt: new Date("2026-07-09T00:00:00Z"),
    updatedAt: new Date("2026-07-09T00:00:00Z"),
    ...patch,
  };
}

describe("course preview pages", () => {
  it("builds cover, shot, and closing pages from a lesson draft", () => {
    const sampleDraft = draft();
    const pages = toPreviewPages("course-1", sampleDraft, []);

    expect(pages.map((page) => page.type)).toEqual(["cover", "lesson_shot", "lesson_shot", "closing_reading"]);
    expect(pages[1]).toMatchObject({
      type: "lesson_shot",
      chapterTitle: "The First Gate",
      shotOrder: 1,
      blocks: [
        { id: "block-1", type: "text" },
        { id: "block-2", type: "exercise" },
      ],
      exercises: [{ id: "exercise-1", answer: "opens" }],
      image: { status: "missing", publicUrl: null, stale: false },
    });
  });

  it("keeps shot blocks in draft order and only includes covered ids", () => {
    const pages = toPreviewPages("course-1", draft(), []);
    const secondShot = pages[2];

    expect(secondShot).toMatchObject({
      type: "lesson_shot",
      blocks: [{ id: "block-3", order: 3 }],
      exercises: [],
    });
  });

  it("binds successful, failed, and stale image status", () => {
    const sampleDraft = draft();
    const pages = toPreviewPages("course-1", sampleDraft, [
      imageRecord("slot-1"),
      imageRecord("slot-2", {
        status: "failed",
        publicUrl: null,
        failureReason: "remote failed",
      }),
    ]);

    expect(pages[1]).toMatchObject({
      type: "lesson_shot",
      image: {
        status: "succeeded",
        publicUrl: "/api/course-images/course-1/slot-1.png",
      },
    });
    expect(pages[2]).toMatchObject({
      type: "lesson_shot",
      image: {
        status: "failed",
        failureReason: "remote failed",
      },
    });

    const stalePages = toPreviewPages("course-1", sampleDraft, [imageRecord("slot-1", { sourceHash: "old-hash" })]);
    expect(stalePages[1]).toMatchObject({ type: "lesson_shot", image: { stale: true } });
  });
});

describe("course preview repository", () => {
  function makeDb(lessonDraft: { content: LessonDraft } | null = { content: draft() }) {
    return {
      course: {
        findUnique: vi.fn(async () => ({
          id: "course-1",
          title: "The Moon Gate Course",
          englishLevel: "A1",
          durationMinutes: 45,
          theme: "Nature",
          grammar: ["Past Simple"],
          people: [
            { person: { role: "teacher", name: "Ms. Lin", englishName: null, chineseName: null } },
            { person: { role: "student", name: "Summer", englishName: "Summer", chineseName: "夏天" } },
          ],
          lessonDraft,
        })),
      },
      courseImage: {
        findMany: vi.fn(async () => [imageRecord("slot-1")]),
      },
    };
  }

  it("returns course metadata, progress, and preview pages", async () => {
    const db = makeDb();
    const result = await getCoursePreview(db, "course-1");

    expect(result.course).toMatchObject({
      id: "course-1",
      title: "The Moon Gate Course",
      teacherName: "Ms. Lin",
      studentNames: ["Summer"],
      englishLevel: "A1",
      durationMinutes: 45,
      theme: "Nature",
      grammar: ["Past Simple"],
    });
    expect(result.resourceProgress).toMatchObject({ total: 2, succeeded: 1, missing: 1 });
    expect(result.pages).toHaveLength(4);
  });

  it("throws a prerequisite error when lesson draft is missing", async () => {
    await expect(getCoursePreview(makeDb(null), "course-1")).rejects.toBeInstanceOf(CoursePreviewPrerequisiteError);
  });

  it("throws a not found error when the course does not exist", async () => {
    const db = {
      course: {
        findUnique: vi.fn(async () => null),
      },
      courseImage: {
        findMany: vi.fn(),
      },
    };

    await expect(getCoursePreview(db, "missing")).rejects.toBeInstanceOf(CoursePreviewNotFoundError);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm test lib/server/repositories/course-preview.test.ts
```

Expected: FAIL because `lib/server/repositories/course-preview.ts` does not exist.

- [ ] **Step 3: Implement `lib/server/repositories/course-preview.ts`**

Create:

```ts
import type {
  CoursePreviewCourse,
  CoursePreviewPage,
  CoursePreviewResponse,
  LessonBlock,
  LessonDraft,
} from "@/lib/contracts/api";
import {
  deriveLessonShotImageSlots,
  mergeImageSlotsWithRecords,
  summarizeResourceProgress,
  type CourseImageRecord,
} from "@/lib/server/repositories/course-images";

type CourseWithPreviewData = {
  id: string;
  title: string;
  englishLevel: CoursePreviewCourse["englishLevel"];
  durationMinutes: number;
  theme: string;
  grammar: string[];
  people: Array<{
    person: {
      role: "teacher" | "student";
      name: string;
      englishName: string | null;
      chineseName: string | null;
    };
  }>;
  lessonDraft: {
    content: LessonDraft;
  } | null;
};

export type CoursePreviewDb = {
  course: {
    findUnique: (query: {
      where: { id: string };
      include: {
        people: {
          include: {
            person: true;
          };
        };
        lessonDraft: true;
      };
    }) => Promise<CourseWithPreviewData | null>;
  };
  courseImage: {
    findMany: (query: { where: { courseId: string }; orderBy: Array<{ slotIndex: "asc" } | { createdAt: "asc" }> }) => Promise<CourseImageRecord[]>;
  };
};

export class CoursePreviewNotFoundError extends Error {
  constructor(message = "课程不存在") {
    super(message);
    this.name = "CoursePreviewNotFoundError";
  }
}

export class CoursePreviewPrerequisiteError extends Error {
  constructor(message = "请先生成课文草稿") {
    super(message);
    this.name = "CoursePreviewPrerequisiteError";
  }
}

function studentDisplayName(person: CourseWithPreviewData["people"][number]["person"]) {
  return person.englishName || person.chineseName || person.name;
}

function toCoursePreviewCourse(course: CourseWithPreviewData): CoursePreviewCourse {
  const teacher = course.people.find(({ person }) => person.role === "teacher")?.person;
  const students = course.people.filter(({ person }) => person.role === "student").map(({ person }) => studentDisplayName(person));

  return {
    id: course.id,
    title: course.title,
    teacherName: teacher?.name ?? null,
    studentNames: students,
    englishLevel: course.englishLevel,
    durationMinutes: course.durationMinutes,
    theme: course.theme,
    grammar: course.grammar,
  };
}

function coveredBlocks(blocks: LessonBlock[], blockIds: string[]) {
  const covered = new Set(blockIds);
  return blocks.filter((block) => covered.has(block.id)).sort((left, right) => left.order - right.order);
}

function coveredExercises(chapter: LessonDraft["chapters"][number], blocks: LessonBlock[]) {
  const exerciseIds = new Set(blocks.filter((block) => block.type === "exercise").map((block) => block.exerciseId));
  return chapter.exercises.filter((exercise) => exerciseIds.has(exercise.id));
}

export function toPreviewPages(courseId: string, draft: LessonDraft, records: CourseImageRecord[]): CoursePreviewPage[] {
  const images = mergeImageSlotsWithRecords(deriveLessonShotImageSlots(courseId, draft), records);
  const pages: CoursePreviewPage[] = [{ id: "cover", type: "cover", title: draft.title }];

  draft.chapters.forEach((chapter, chapterIndex) => {
    chapter.shots
      .slice()
      .sort((left, right) => left.order - right.order)
      .forEach((shot) => {
        const blocks = coveredBlocks(chapter.blocks, shot.coveredBlockIds);
        const image = images.find((item) => item.slotId === shot.imageSlotId);

        pages.push({
          id: `${chapter.id}-${shot.id}`,
          type: "lesson_shot",
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          chapterIndex: chapterIndex + 1,
          shotId: shot.id,
          shotOrder: shot.order,
          title: `${chapter.title} · Page ${shot.order}`,
          image: {
            status: image?.status ?? "missing",
            publicUrl: image?.publicUrl ?? null,
            stale: image?.stale ?? false,
            failureReason: image?.failureReason ?? null,
          },
          blocks,
          exercises: coveredExercises(chapter, blocks),
        });
      });
  });

  pages.push({
    id: "closing-reading",
    type: "closing_reading",
    title: draft.closingReading.title,
    text: draft.closingReading.text,
    vocabularyTerms: draft.closingReading.vocabularyTerms,
  });

  return pages;
}

export async function getCoursePreview(db: CoursePreviewDb, courseId: string): Promise<CoursePreviewResponse> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      people: {
        include: {
          person: true,
        },
      },
      lessonDraft: true,
    },
  });

  if (!course) {
    throw new CoursePreviewNotFoundError();
  }

  if (!course.lessonDraft) {
    throw new CoursePreviewPrerequisiteError();
  }

  const records = await db.courseImage.findMany({
    where: { courseId },
    orderBy: [{ slotIndex: "asc" }, { createdAt: "asc" }],
  });
  const slots = deriveLessonShotImageSlots(courseId, course.lessonDraft.content);
  const images = mergeImageSlotsWithRecords(slots, records);

  return {
    course: toCoursePreviewCourse(course),
    resourceProgress: summarizeResourceProgress(images),
    pages: toPreviewPages(courseId, course.lessonDraft.content, records),
  };
}
```

- [ ] **Step 4: Run repository test**

Run:

```bash
pnpm test lib/server/repositories/course-preview.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit only repository files**

```bash
git add lib/server/repositories/course-preview.ts lib/server/repositories/course-preview.test.ts
git commit -m "Add course preview repository"
```

If commits are not desired, skip this step.

---

### Task 3: Preview API Route

**Files:**
- Create: `app/api/courses/[id]/preview/route.ts`

- [ ] **Step 1: Create API route**

Create:

```ts
import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CoursePreviewNotFoundError,
  CoursePreviewPrerequisiteError,
  getCoursePreview,
} from "@/lib/server/repositories/course-preview";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await getCoursePreview(getDb(), id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CoursePreviewNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CoursePreviewPrerequisiteError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Course preview loading failed", error);
    return NextResponse.json({ message: "课程预览加载失败" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run repository and type smoke tests**

Run:

```bash
pnpm test lib/server/repositories/course-preview.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit only route file**

```bash
git add app/api/courses/[id]/preview/route.ts
git commit -m "Add course preview API route"
```

If commits are not desired, skip this step.

---

### Task 4: Shared Preview Components

**Files:**
- Create: `features/courses/components/course-preview.tsx`
- Create: `features/courses/components/course-preview.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing component tests**

Create `features/courses/components/course-preview.test.tsx`:

```tsx
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CoursePreviewResponse } from "@/lib/contracts/api";
import { CourseHtmlPreview, CoursePdfPreview, CoursePreviewDocument } from "./course-preview";

const preview: CoursePreviewResponse = {
  course: {
    id: "course-1",
    title: "The Moon Gate Course",
    teacherName: "Ms. Lin",
    studentNames: ["Summer"],
    englishLevel: "A1",
    durationMinutes: 45,
    theme: "Nature",
    grammar: ["Past Simple"],
  },
  resourceProgress: {
    total: 2,
    succeeded: 1,
    generating: 0,
    failed: 0,
    missing: 1,
    stale: 0,
  },
  pages: [
    { id: "cover", type: "cover", title: "The Moon Gate" },
    {
      id: "chapter-1-shot-1",
      type: "lesson_shot",
      chapterId: "chapter-1",
      chapterTitle: "The First Gate",
      chapterIndex: 1,
      shotId: "shot-1",
      shotOrder: 1,
      title: "The First Gate · Page 1",
      image: {
        status: "missing",
        publicUrl: null,
        stale: false,
        failureReason: null,
      },
      blocks: [
        { id: "block-1", order: 1, type: "text", text: "Summer opens the gate." },
        {
          id: "block-2",
          order: 2,
          type: "exercise",
          exerciseId: "exercise-1",
          display: { kind: "verb_blank", placeholder: "________", prompt: "open" },
        },
      ],
      exercises: [{ id: "exercise-1", type: "verb_blank", answer: "opens", baseVerb: "open" }],
    },
    {
      id: "closing-reading",
      type: "closing_reading",
      title: "After the Gate",
      text: "Summer remembers the gate.",
      vocabularyTerms: ["gate"],
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CoursePreviewDocument", () => {
  it("renders blanks but not answers in student/pdf mode", () => {
    render(<CoursePreviewDocument data={preview} mode="pdf" audience="student" />);

    expect(screen.getByText("________")).toBeInTheDocument();
    expect(screen.queryByText("opens")).not.toBeInTheDocument();
    expect(screen.getByText("图片未生成")).toBeInTheDocument();
  });

  it("renders course cover and closing reading", () => {
    render(<CoursePreviewDocument data={preview} mode="html" audience="teacher" />);

    expect(screen.getByText("The Moon Gate")).toBeInTheDocument();
    expect(screen.getByText("The Moon Gate Course")).toBeInTheDocument();
    expect(screen.getByText("After the Gate")).toBeInTheDocument();
    expect(screen.getByText("gate")).toBeInTheDocument();
  });
});

describe("CourseHtmlPreview", () => {
  it("shows teacher tools and answers in HTML preview", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => preview,
    } as Response);

    render(<CourseHtmlPreview courseId="course-1" />);

    await waitFor(() => expect(screen.getByText("老师工具")).toBeInTheDocument());
    expect(screen.getByText("opens")).toBeInTheDocument();
    expect(screen.getByText("返回资源生成")).toBeInTheDocument();
  });
});

describe("CoursePdfPreview", () => {
  it("hides answers and action areas in PDF preview", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => preview,
    } as Response);

    render(<CoursePdfPreview courseId="course-1" />);

    await waitFor(() => expect(screen.getByText("打印 / 保存 PDF")).toBeInTheDocument());
    expect(screen.queryByText("老师工具")).not.toBeInTheDocument();
    expect(screen.queryByText("opens")).not.toBeInTheDocument();
    expect(screen.queryByText("返回资源生成")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run failing component tests**

Run:

```bash
pnpm test features/courses/components/course-preview.test.tsx
```

Expected: FAIL because `course-preview.tsx` does not exist.

- [ ] **Step 3: Implement `course-preview.tsx`**

Create the component with these exported functions and helpers:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, ImageIcon, Loader2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type {
  CoursePreviewBlock,
  CoursePreviewPage,
  CoursePreviewResponse,
  LessonBlankDisplay,
} from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

type DocumentMode = "html" | "pdf";
type Audience = "teacher" | "student";

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "课程预览加载失败");
  }

  return data;
}

function useCoursePreview(courseId: string) {
  const [data, setData] = useState<CoursePreviewResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      setError("");
      try {
        const result = (await readJson(await fetch(`/api/courses/${courseId}/preview`, { cache: "no-store" }))) as CoursePreviewResponse;
        if (active) {
          setData(result);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "课程预览加载失败");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [courseId]);

  return { data, error, isLoading };
}

function exerciseLabel(display: LessonBlankDisplay) {
  if (display.kind === "verb_blank") {
    return `verb: ${display.prompt}`;
  }

  return `${display.pattern} · ${display.letterCount} letters`;
}

function PreviewBlock({ block }: { block: CoursePreviewBlock }) {
  if (block.type === "text") {
    return <p className="text-[15px] leading-8 text-slate-700">{block.text}</p>;
  }

  return (
    <div className="inline-flex min-h-10 items-center gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700">
      <span className="font-semibold text-slate-950">________</span>
      <span className="text-xs text-slate-500">{exerciseLabel(block.display)}</span>
    </div>
  );
}

function CoursePreviewImageFrame({ page }: { page: Extract<CoursePreviewPage, { type: "lesson_shot" }> }) {
  const { image } = page;

  if (image.publicUrl) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
        <img src={image.publicUrl} alt={page.title} className="h-full w-full object-cover" />
        {image.stale ? (
          <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">内容已变化</span>
        ) : null}
      </div>
    );
  }

  const label = image.status === "failed" ? "图片生成失败" : image.status === "missing" ? "图片未生成" : "图片生成中";

  return (
    <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500">
      <ImageIcon className="mb-3 size-9" />
      <p className="text-sm font-medium">{label}</p>
      {image.failureReason ? <p className="mt-2 max-w-sm text-center text-xs leading-5 text-rose-600">{image.failureReason}</p> : null}
    </div>
  );
}

function CoverPage({ data }: { data: CoursePreviewResponse }) {
  return (
    <section id="cover" className="preview-page bg-white">
      <p className="text-sm font-semibold text-violet-700">Student Lesson</p>
      <h1 className="mt-4 text-4xl font-semibold text-slate-950">{data.pages[0]?.title}</h1>
      <p className="mt-3 text-lg text-slate-600">{data.course.title}</p>
      <dl className="mt-10 grid gap-4 sm:grid-cols-2">
        <Info label="Teacher" value={data.course.teacherName ?? "-"} />
        <Info label="Students" value={data.course.studentNames.join(" / ") || "-"} />
        <Info label="Level" value={data.course.englishLevel} />
        <Info label="Theme" value={data.course.theme} />
        <Info label="Grammar" value={data.course.grammar.join(" / ")} />
        <Info label="Duration" value={`${data.course.durationMinutes} min`} />
      </dl>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function LessonShotPage({ page }: { page: Extract<CoursePreviewPage, { type: "lesson_shot" }> }) {
  return (
    <section id={page.id} className="preview-page bg-white">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-violet-700">Chapter {page.chapterIndex} · Page {page.shotOrder}</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">{page.chapterTitle}</h2>
        </div>
      </div>
      <CoursePreviewImageFrame page={page} />
      <div className="mt-6 space-y-4">
        {page.blocks.map((block) => (
          <PreviewBlock key={block.id} block={block} />
        ))}
      </div>
    </section>
  );
}

function ClosingPage({ page }: { page: Extract<CoursePreviewPage, { type: "closing_reading" }> }) {
  return (
    <section id={page.id} className="preview-page bg-white">
      <p className="text-sm font-semibold text-violet-700">Closing Reading</p>
      <h2 className="mt-2 text-3xl font-semibold text-slate-950">{page.title}</h2>
      <p className="mt-6 text-[15px] leading-8 text-slate-700">{page.text}</p>
      <div className="mt-8 flex flex-wrap gap-2">
        {page.vocabularyTerms.map((term) => (
          <span key={term} className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700">{term}</span>
        ))}
      </div>
    </section>
  );
}

export function CoursePreviewDocument({ data, mode, audience }: { data: CoursePreviewResponse; mode: DocumentMode; audience: Audience }) {
  return (
    <article className={cn("mx-auto space-y-6", mode === "pdf" ? "max-w-[760px]" : "max-w-4xl")}>
      <CoverPage data={data} />
      {data.pages.slice(1).map((page) => {
        if (page.type === "lesson_shot") {
          return <LessonShotPage key={page.id} page={page} />;
        }

        if (page.type === "closing_reading") {
          return <ClosingPage key={page.id} page={page} />;
        }

        return null;
      })}
    </article>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      <Loader2 className="mr-2 size-5 animate-spin" />
      加载课程预览...
    </div>
  );
}

function ErrorState({ message, courseId }: { message: string; courseId: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</p>
      <div className="mt-4 flex gap-3">
        <Button asChild variant="outline"><Link href={`/courses/${courseId}/create/lesson-draft`}>返回文稿</Link></Button>
        <Button asChild><Link href={`/courses/${courseId}/create/resources`}>返回资源生成</Link></Button>
      </div>
    </div>
  );
}

function PreviewOutline({ pages }: { pages: CoursePreviewResponse["pages"] }) {
  return (
    <nav className="space-y-1 text-sm">
      {pages.map((page) => (
        <a key={page.id} href={`#${page.id}`} className="block rounded-md px-3 py-2 text-slate-600 hover:bg-slate-100">
          {page.type === "lesson_shot" ? `Chapter ${page.chapterIndex} Page ${page.shotOrder}` : page.title}
        </a>
      ))}
    </nav>
  );
}

function TeacherTools({ data, courseId }: { data: CoursePreviewResponse; courseId: string }) {
  const answers = useMemo(
    () => data.pages.flatMap((page) => (page.type === "lesson_shot" ? page.exercises.map((exercise) => ({ ...exercise, pageTitle: page.title })) : [])),
    [data.pages],
  );

  return (
    <aside className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-950">老师工具</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Info label="Done" value={`${data.resourceProgress.succeeded}/${data.resourceProgress.total}`} />
          <Info label="Missing" value={`${data.resourceProgress.missing}`} />
          <Info label="Failed" value={`${data.resourceProgress.failed}`} />
          <Info label="Changed" value={`${data.resourceProgress.stale}`} />
        </div>
        <div className="mt-4 space-y-2">
          <Button asChild className="w-full"><Link href={`/courses/${courseId}/pdf`}><FileText className="size-4" />打开 PDF 预览</Link></Button>
          <Button asChild className="w-full" variant="outline"><Link href={`/courses/${courseId}/create/resources`}>返回资源生成</Link></Button>
          <Button asChild className="w-full" variant="outline"><Link href={`/courses/${courseId}/create/lesson-draft`}>返回编辑文稿</Link></Button>
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-950">答案</h2>
        <div className="mt-3 space-y-2">
          {answers.map((exercise) => (
            <div key={exercise.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <p className="text-xs text-slate-500">{exercise.pageTitle}</p>
              <p className="font-medium text-slate-950">{exercise.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

export function CourseHtmlPreview({ courseId, inCreateFlow = false }: { courseId: string; inCreateFlow?: boolean }) {
  const { data, error, isLoading } = useCoursePreview(courseId);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !data) {
    return <ErrorState message={error || "课程预览加载失败"} courseId={courseId} />;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {inCreateFlow ? <CourseCreateSteps currentStep={5} courseId={courseId} /> : null}
        <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)_280px]">
          <aside className="print-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
              <ArrowLeft className="size-4" />
              课程大纲
            </div>
            <PreviewOutline pages={data.pages} />
          </aside>
          <CoursePreviewDocument data={data} mode="html" audience="teacher" />
          <div className="print-hidden"><TeacherTools data={data} courseId={courseId} /></div>
        </div>
      </div>
    </main>
  );
}

export function CoursePdfPreview({ courseId }: { courseId: string }) {
  const { data, error, isLoading } = useCoursePreview(courseId);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !data) {
    return <ErrorState message={error || "课程预览加载失败"} courseId={courseId} />;
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-6 print:bg-white print:p-0">
      <div className="print-hidden mx-auto mb-6 flex max-w-[760px] items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <Button type="button" onClick={() => window.print()}>
          <Printer className="size-4" />
          打印 / 保存 PDF
        </Button>
        <Button asChild variant="outline"><Link href={`/courses/${courseId}`}>返回 HTML 预览</Link></Button>
      </div>
      <CoursePreviewDocument data={data} mode="pdf" audience="student" />
    </main>
  );
}
```

The `audience` parameter is currently used to make the public API explicit; answers stay outside `CoursePreviewDocument`.

- [ ] **Step 4: Add print CSS**

Append to `app/globals.css`:

```css
.preview-page {
  min-height: 920px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 48px;
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.06);
}

@media print {
  .preview-page {
    min-height: auto;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    break-after: page;
    page-break-after: always;
    padding: 28mm 22mm;
  }

  .preview-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
}
```

- [ ] **Step 5: Run component tests**

Run:

```bash
pnpm test features/courses/components/course-preview.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit only preview component files**

```bash
git add features/courses/components/course-preview.tsx features/courses/components/course-preview.test.tsx app/globals.css
git commit -m "Add shared course preview components"
```

If commits are not desired, skip this step.

---

### Task 5: Route Integration And Documentation

**Files:**
- Modify: `app/courses/[id]/page.tsx`
- Create: `app/courses/[id]/create/preview/page.tsx`
- Modify: `app/courses/[id]/pdf/page.tsx`
- Modify: `features/courses/components/course-create-steps.tsx`
- Modify: `features/courses/components/course-resources-manager.tsx`
- Modify: `features/courses/components/course-player.tsx`
- Modify: `docs/frontend/course-preview-and-pdf.md`
- Modify: `docs/frontend/README.md`

- [ ] **Step 1: Replace `/courses/:id` page**

Modify `app/courses/[id]/page.tsx`:

```tsx
import { ProtectedLayout } from "@/components/protected-layout";
import { CourseHtmlPreview } from "@/features/courses/components/course-preview";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedLayout>
      <CourseHtmlPreview courseId={id} />
    </ProtectedLayout>
  );
}
```

- [ ] **Step 2: Add create-flow Step 5 page**

Create `app/courses/[id]/create/preview/page.tsx`:

```tsx
import { ProtectedLayout } from "@/components/protected-layout";
import { CourseHtmlPreview } from "@/features/courses/components/course-preview";

export default async function CourseCreatePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedLayout>
      <CourseHtmlPreview courseId={id} inCreateFlow />
    </ProtectedLayout>
  );
}
```

- [ ] **Step 3: Replace PDF page**

Modify `app/courses/[id]/pdf/page.tsx`:

```tsx
import { ProtectedLayout } from "@/components/protected-layout";
import { CoursePdfPreview } from "@/features/courses/components/course-preview";

export default async function CoursePdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedLayout>
      <CoursePdfPreview courseId={id} />
    </ProtectedLayout>
  );
}
```

- [ ] **Step 4: Enable Step 5 navigation**

Modify the last item in `features/courses/components/course-create-steps.tsx`:

```ts
  { step: 5, label: "课程预览", href: "preview" },
```

- [ ] **Step 5: Add Step 5 entry from resources**

In `features/courses/components/course-resources-manager.tsx`, import `Link` from `next/link` and add a secondary button next to “生成全部缺失图片”:

```tsx
<Link
  href={`/courses/${courseId}/create/preview`}
  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
>
  查看课程预览
</Link>
```

Keep this link enabled even when resources are incomplete.

- [ ] **Step 6: Remove mock player dependency**

If no imports remain, delete `features/courses/components/course-player.tsx`.

Run first:

```bash
rg -n "CoursePlayer|course-player" .
```

Expected after page replacements: no production imports. If deleting the file causes no references, remove it. If keeping it temporarily, replace its body with:

```tsx
export { CourseHtmlPreview as CoursePlayer } from "@/features/courses/components/course-preview";
```

Prefer deletion if `rg` confirms it is unused.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm test lib/server/repositories/course-preview.test.ts features/courses/components/course-preview.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Run full verification**

Run:

```bash
pnpm test
pnpm lint
pnpm build
```

Expected: all PASS. If `pnpm build` requires environment variables or database connectivity and fails for environment reasons, capture the exact failure and do not claim build passed.

- [ ] **Step 9: Update frontend docs after verification**

In `docs/frontend/course-preview-and-pdf.md`, replace implementation status with:

```md
- 2026-07-09：已实现 HTML 预览、学生版 PDF 预览、只读预览 API 和共用课程内容组件。
- 验证命令：`pnpm test`; `pnpm lint`; `pnpm build`
- 提交号：待补充
```

In `docs/frontend/README.md`, update:

```md
| 课程预览 Step 5 | `docs/frontend/course-preview-and-pdf.md` | 已实现，待用户验收 | - |
| PDF 预览 / 导出 | `docs/frontend/course-preview-and-pdf.md` | 已实现，待用户验收 | - |
```

- [ ] **Step 10: Commit route integration and docs**

```bash
git add app/courses/[id]/page.tsx app/courses/[id]/create/preview/page.tsx app/courses/[id]/pdf/page.tsx features/courses/components/course-create-steps.tsx features/courses/components/course-resources-manager.tsx docs/frontend/course-preview-and-pdf.md docs/frontend/README.md
git add -u features/courses/components/course-player.tsx
git commit -m "Integrate course preview routes"
```

If commits are not desired, skip this step.

---

## Final Verification Checklist

- [ ] `/courses/:id` renders real preview data from `/api/courses/:id/preview`.
- [ ] `/courses/:id/create/preview` renders the same preview with Step 5 navigation.
- [ ] `/courses/:id/pdf` renders the same course pages in student PDF mode.
- [ ] PDF mode does not render answers, teacher tools, edit links, or resource actions.
- [ ] HTML mode renders teacher answer tools.
- [ ] Missing, generating, failed, and stale image states render without blocking preview.
- [ ] No Prisma migration was added.
- [ ] No HTML/PDF file generation was added.
- [ ] `mockCourse` is no longer used by the real preview routes.

## Self-Review

- Spec coverage: The plan covers read-only aggregation, route/API contract, shared HTML/PDF rendering, student-only PDF, image placeholders, answer hiding, Step 5 entry, and documentation updates.
- Placeholder scan: No implementation step relies on TBD behavior. Optional commit steps are explicitly skippable when commits are not wanted.
- Type consistency: Preview types use existing `ResourceImageStatus`, `ResourceProgress`, `LessonBlock`, `LessonExercise`, and `LessonBlankDisplay`.
