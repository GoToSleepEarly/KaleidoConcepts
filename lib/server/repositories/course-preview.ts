import type {
  CourseResourcePlan,
  CoursePreviewCourse,
  CoursePreviewPage,
  CoursePreviewResponse,
  LessonDraft,
} from "@/lib/contracts/api";
import {
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

function paragraphForShot(chapter: LessonDraft["chapters"][number], sourceParagraphId: string) {
  return chapter.paragraphs.find((paragraph) => paragraph.id === sourceParagraphId) ?? null;
}

function textForParagraph(paragraph: LessonDraft["chapters"][number]["paragraphs"][number] | null) {
  return paragraph?.sentences.map((sentence) => sentence.text).join(" ") ?? "";
}

function exercisesForParagraph(chapter: LessonDraft["chapters"][number], paragraph: LessonDraft["chapters"][number]["paragraphs"][number] | null) {
  const sentenceSet = new Set(paragraph?.sentences.map((sentence) => sentence.id) ?? []);
  return chapter.exercises.filter((exercise) => sentenceSet.has(exercise.sentenceId));
}

export function toPreviewPages(courseId: string, draft: LessonDraft, records: CourseImageRecord[], plan: CourseResourcePlan | null = null): CoursePreviewPage[] {
  const slots = plan ? deriveResourceImageSlots(courseId, draft, plan) : [];
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
      const paragraph = paragraphForShot(chapter, shot.sourceParagraphId);
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
        text: textForParagraph(paragraph),
        exercises: exercisesForParagraph(chapter, paragraph),
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
  const slots = course.resourcePlan ? deriveResourceImageSlots(courseId, course.lessonDraft.content, course.resourcePlan.plan) : [];
  const images = mergeImageSlotsWithRecords(slots, records);

  return {
    course: toCoursePreviewCourse(course),
    resourceProgress: summarizeResourceProgress(images),
    pages: toPreviewPages(courseId, course.lessonDraft.content, records, course.resourcePlan?.plan ?? null),
  };
}
