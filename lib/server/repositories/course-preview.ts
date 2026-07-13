import type {
  CourseResourcePlan,
  CoursePreviewCourse,
  CoursePreviewPage,
  CoursePreviewResponse,
  LessonDraft,
} from "@/lib/contracts/api";
import {
  deriveLessonShotImageSlots,
  deriveResourceImageSlots,
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
  resourcePlan: {
    plan: CourseResourcePlan;
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
        resourcePlan: true;
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

function textForSentenceIds(chapter: LessonDraft["chapters"][number], sentenceIds: string[]) {
  const byId = new Map(chapter.paragraphs.flatMap((paragraph) => paragraph.sentences.map((sentence) => [sentence.id, sentence.text] as const)));
  return sentenceIds.map((sentenceId) => byId.get(sentenceId)).filter(Boolean).join(" ");
}

function exercisesForSentenceIds(chapter: LessonDraft["chapters"][number], sentenceIds: string[]) {
  const sentenceSet = new Set(sentenceIds);
  return chapter.exercises.filter((exercise) => sentenceSet.has(exercise.sentenceId));
}

function paragraphText(chapter: LessonDraft["chapters"][number], paragraphIndex: number) {
  return chapter.paragraphs[paragraphIndex]?.sentences.map((sentence) => sentence.text).join(" ") ?? "";
}

function paragraphExercises(chapter: LessonDraft["chapters"][number], paragraphIndex: number) {
  const sentenceIds = new Set(chapter.paragraphs[paragraphIndex]?.sentences.map((sentence) => sentence.id) ?? []);
  return chapter.exercises.filter((exercise) => sentenceIds.has(exercise.sentenceId));
}

export function toPreviewPages(courseId: string, draft: LessonDraft, records: CourseImageRecord[], plan: CourseResourcePlan | null = null): CoursePreviewPage[] {
  const slots = plan ? deriveResourceImageSlots(courseId, draft, plan) : deriveLessonShotImageSlots(courseId, draft);
  const images = mergeImageSlotsWithRecords(slots, records);
  const pages: CoursePreviewPage[] = [{ id: "cover", type: "cover", title: draft.title }];
  if (plan) {
    const shots = plan.shots.slice().sort((left, right) => {
      const leftChapter = draft.chapters.find((chapter) => chapter.id === left.chapterId)?.sourceOutlineChapterIndex ?? 0;
      const rightChapter = draft.chapters.find((chapter) => chapter.id === right.chapterId)?.sourceOutlineChapterIndex ?? 0;
      return leftChapter - rightChapter || left.shotOrder - right.shotOrder;
    });
    shots.forEach((shot) => {
      const chapter = draft.chapters.find((item) => item.id === shot.chapterId);
      if (!chapter) {
        return;
      }
      const image = images.find((item) => item.slotId === shot.shotId);
      pages.push({
        id: shot.shotId,
        type: "lesson_shot",
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterIndex: chapter.sourceOutlineChapterIndex,
        shotId: shot.shotId,
        shotOrder: shot.shotOrder,
        title: `${chapter.title} · Page ${shot.shotOrder}`,
        image: {
          status: image?.status ?? "missing",
          publicUrl: image?.publicUrl ?? null,
          stale: image?.stale ?? false,
          failureReason: image?.failureReason ?? null,
        },
        text: textForSentenceIds(chapter, shot.sourceSentenceIds),
        exercises: exercisesForSentenceIds(chapter, shot.sourceSentenceIds),
      });
    });
    pages.push({
      id: "closing-reading",
      type: "closing_reading",
      title: draft.closingReading.title,
      text: draft.closingReading.sentences.join(" "),
      vocabularyTerms: draft.closingReading.vocabularyTerms,
    });
    return pages;
  }

  draft.chapters.forEach((chapter, chapterIndex) => {
    chapter.paragraphs.forEach((paragraph, paragraphIndex) => {
      const shotOrder = (paragraphIndex + 1) as 1 | 2;
      const shotId = `${chapter.id}-shot-${shotOrder}`;
      const slotId = `${chapter.id}-image-${shotOrder}`;
      const image = images.find((item) => item.slotId === slotId);

      pages.push({
        id: `${chapter.id}-${paragraph.id}`,
        type: "lesson_shot",
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        chapterIndex: chapterIndex + 1,
        shotId,
        shotOrder,
        title: `${chapter.title} · Page ${shotOrder}`,
        image: {
          status: image?.status ?? "missing",
          publicUrl: image?.publicUrl ?? null,
          stale: image?.stale ?? false,
          failureReason: image?.failureReason ?? null,
        },
        text: paragraphText(chapter, paragraphIndex),
        exercises: paragraphExercises(chapter, paragraphIndex),
      });
    });
  });

  pages.push({
    id: "closing-reading",
    type: "closing_reading",
    title: draft.closingReading.title,
    text: draft.closingReading.sentences.join(" "),
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
      resourcePlan: true,
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
  const slots = course.resourcePlan ? deriveResourceImageSlots(courseId, course.lessonDraft.content, course.resourcePlan.plan) : deriveLessonShotImageSlots(courseId, course.lessonDraft.content);
  const images = mergeImageSlotsWithRecords(slots, records);

  return {
    course: toCoursePreviewCourse(course),
    resourceProgress: summarizeResourceProgress(images),
    pages: toPreviewPages(courseId, course.lessonDraft.content, records, course.resourcePlan?.plan ?? null),
  };
}
