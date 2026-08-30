import { isDeepStrictEqual } from "node:util";

import type { PrismaClient } from "@prisma/client";

import type {
  CourseContentChapter,
  CoursePresentationConfig,
  CoursePresentationUpdate,
  CoursePreviewResponse,
  CourseVocabularyMatchingItem,
  CourseGrammarQuestion,
  PublishCourseResponse,
} from "@/lib/contracts/api";
import { compilePreviewPages, DEFAULT_COURSE_PRESENTATION } from "@/lib/domain/course-preview";
import { furthestCourseStage, staleStageAfterConfirming } from "@/lib/domain/course-stage";

export type CoursePreviewDb = Pick<PrismaClient, "$transaction" | "course" | "coursePresentation" | "presetOption" | "knowledgePoint">;

export class CoursePreviewNotFoundError extends Error {}
export class CoursePreviewPrerequisiteError extends Error {}

type PreviewVisualSlot = {
  activeImage?: { status: string; publicUrl?: string | null } | null;
  images?: Array<{ status: string; leaseExpiresAt?: Date | null; updatedAt?: Date; startedAt?: Date | null }>;
};

function assertVisualResourcesReady(slots: PreviewVisualSlot[]) {
  const now = Date.now();
  const hardDeadline = now - 12 * 60 * 1000;
  const inFlight = slots.filter((slot) => slot.images?.some((image) => {
    if (!["pending", "submitting", "generating"].includes(image.status)) return false;
    if (image.startedAt && image.startedAt.getTime() <= hardDeadline) return false;
    return image.leaseExpiresAt ? image.leaseExpiresAt.getTime() > now : true;
  })).length;
  if (inFlight) throw new CoursePreviewPrerequisiteError(`还有 ${inFlight} 张图片正在生成，请等待全部完成后再进入预览发布`);
}

export function defaultPresentation(): CoursePresentationConfig {
  return { ...DEFAULT_COURSE_PRESENTATION, slideOverrides: {} };
}

function normalizedPresentation(input?: Partial<CoursePresentationUpdate> | null): CoursePresentationConfig {
  const defaults = defaultPresentation();
  return {
    coverTheme: input?.coverTheme ?? defaults.coverTheme,
    coverTitleFontSize: input?.coverTitleFontSize ?? defaults.coverTitleFontSize,
    chapterTheme: input?.chapterTheme ?? defaults.chapterTheme,
    slideOverrides: input?.slideOverrides ?? {},
  };
}

export async function getCoursePreview(db: CoursePreviewDb, courseId: string): Promise<CoursePreviewResponse> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      people: true,
      lessonContent: true,
      storyOutline: { include: { chapters: true } },
      visualImageSlots: { include: { activeImage: { select: { publicUrl: true, status: true } }, images: { select: { status: true, leaseExpiresAt: true, updatedAt: true, startedAt: true } } } },
      presentation: true,
      teachingPlan: true,
    },
  });
  if (!course) throw new CoursePreviewNotFoundError("课程不存在");
  if (!course.lessonContent) throw new CoursePreviewPrerequisiteError("请先完成文案与练习");
  assertVisualResourcesReady(course.visualImageSlots);
  const planChapters = Array.isArray(course.teachingPlan?.chapters) ? course.teachingPlan.chapters as Array<{ outlineChapterId?: string; knowledgePointIds?: string[] }> : [];
  const afterClassPractice = course.teachingPlan?.afterClassPractice as { knowledgePointIds?: string[] } | null;
  const planKnowledgePointIds = [...new Set([
    ...planChapters.flatMap((chapter) => Array.isArray(chapter.knowledgePointIds) ? chapter.knowledgePointIds : []),
    ...(Array.isArray(afterClassPractice?.knowledgePointIds) ? afterClassPractice.knowledgePointIds : []),
  ])];
  const selectedIds = planKnowledgePointIds.length
    ? planKnowledgePointIds
    : Array.isArray(course.knowledgePointIds) ? course.knowledgePointIds.filter((id): id is string => typeof id === "string") : [];
  const knowledgePoints = course.grammarBookEditionId
    ? await db.knowledgePoint.findMany({ where: { id: { in: selectedIds }, bookEditionId: course.grammarBookEditionId, source: "grammar_in_use" }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true } }).then((points) => points.map((point) => ({ id: point.id, label: point.title })))
    : await db.presetOption.findMany({ where: { id: { in: selectedIds }, kind: "grammar" }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { id: true, label: true } });

  const teacher = course.people.find((person) => person.role === "teacher");
  const students = course.people.filter((person) => person.role === "student");
  const presentation = course.presentation ? normalizedPresentation({
    coverTheme: course.presentation.coverTheme,
    coverTitleFontSize: course.presentation.coverTitleFontSize,
    chapterTheme: course.presentation.chapterTheme,
    slideOverrides: course.presentation.slideOverrides as CoursePresentationConfig["slideOverrides"],
  }) : defaultPresentation();

  const slots = course.visualImageSlots.map((slot) => ({
    id: slot.id,
    slotType: slot.slotType,
    chapterId: slot.chapterId,
    paragraphId: slot.paragraphId,
    publicUrl: slot.activeImage?.status === "succeeded" ? slot.activeImage.publicUrl : null,
  }));
  const mainIdea = course.lessonContent.mainIdea as { id: string; title: string; text: string } | null;
  const homework = course.lessonContent.homework as { grammar: CourseGrammarQuestion[]; vocabularyMatching: CourseVocabularyMatchingItem[] } | null;
  const outlineChapterTitles = new Map(course.storyOutline?.chapters.map((chapter) => [chapter.id, chapter.title]) ?? []);
  const chapters = (course.lessonContent.chapters as unknown as CourseContentChapter[]).map((chapter) => ({
    ...chapter,
    title: outlineChapterTitles.get(chapter.outlineChapterId) ?? chapter.title,
  }));

  return {
    course: {
      id: course.id,
      title: course.title,
      lifecycleStatus: course.lifecycleStatus,
      staleFromStage: course.staleFromStage ?? null,
      teacherName: teacher?.englishNameSnapshot || teacher?.chineseNameSnapshot || null,
      studentNames: students.map((student) => student.englishNameSnapshot || student.chineseNameSnapshot),
    },
    presentation,
    pages: compilePreviewPages({
      title: course.storyOutline?.title || course.title,
      teacherName: teacher?.englishNameSnapshot || teacher?.chineseNameSnapshot || null,
      studentNames: students.map((student) => student.englishNameSnapshot || student.chineseNameSnapshot),
      knowledgePoints,
      chapterKnowledgePointIds: Object.fromEntries(planChapters.filter((chapter) => typeof chapter.outlineChapterId === "string").map((chapter) => [chapter.outlineChapterId!, Array.isArray(chapter.knowledgePointIds) ? chapter.knowledgePointIds : []])),
      homeworkKnowledgePointIds: Array.isArray(afterClassPractice?.knowledgePointIds) ? afterClassPractice.knowledgePointIds : [],
      chapters,
      mainIdea,
      homework,
      slots,
    }),
  };
}

export async function savePresentation(
  db: CoursePreviewDb,
  courseId: string,
  input: Partial<CoursePresentationUpdate>,
  options: { preservePublished?: boolean } = {},
) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      lifecycleStatus: true,
      presentation: { select: { coverTheme: true, coverTitleFontSize: true, chapterTheme: true, slideOverrides: true } },
    },
  });
  if (!course) throw new CoursePreviewNotFoundError("课程不存在");
  const value = normalizedPresentation(input);
  const currentValue = normalizedPresentation(course.presentation ? {
    coverTheme: course.presentation.coverTheme,
    coverTitleFontSize: course.presentation.coverTitleFontSize,
    chapterTheme: course.presentation.chapterTheme,
    slideOverrides: course.presentation.slideOverrides as CoursePresentationConfig["slideOverrides"],
  } : null);
  if (isDeepStrictEqual(currentValue, value)) return value;

  if (course.lifecycleStatus === "published" && !options.preservePublished) {
    await db.$transaction(async (tx) => {
      await tx.coursePresentation.upsert({ where: { courseId }, create: { courseId, ...value }, update: value });
      await tx.course.update({ where: { id: courseId }, data: { lifecycleStatus: "draft" } });
    });
  } else {
    await db.coursePresentation.upsert({ where: { courseId }, create: { courseId, ...value }, update: value });
  }
  return value;
}

export async function confirmVisualResources(db: Pick<PrismaClient, "course">, courseId: string) {
  const course = await db.course.findUnique({ where: { id: courseId }, include: { lessonContent: true, visualImageSlots: { include: { activeImage: { select: { status: true } }, images: { select: { status: true, leaseExpiresAt: true, updatedAt: true, startedAt: true } } } } } });
  if (!course) throw new CoursePreviewNotFoundError("课程不存在");
  if (!course.lessonContent) throw new CoursePreviewPrerequisiteError("请先完成文案与练习");
  assertVisualResourcesReady(course.visualImageSlots);
  await db.course.update({
    where: { id: courseId },
    data: {
      currentStage: furthestCourseStage(course.currentStage, "preview"),
      staleFromStage: staleStageAfterConfirming(course.staleFromStage, "visual_resources", course.currentStage),
    },
  });
  return { redirectUrl: `/courses/${courseId}/create/preview` };
}

export async function publishCourse(db: CoursePreviewDb, courseId: string, input?: Partial<CoursePresentationUpdate>): Promise<PublishCourseResponse> {
  const course = await db.course.findUnique({ where: { id: courseId }, include: { lessonContent: true, visualImageSlots: { include: { activeImage: { select: { status: true } }, images: { select: { status: true, leaseExpiresAt: true, updatedAt: true, startedAt: true } } } } } });
  if (!course) throw new CoursePreviewNotFoundError("课程不存在");
  if (!course.lessonContent) throw new CoursePreviewPrerequisiteError("请先完成文案与练习");
  if (course.staleFromStage && course.staleFromStage !== "preview") throw new CoursePreviewPrerequisiteError("前序内容仍是旧版本，请先从提示阶段开始重置并重新确认");
  assertVisualResourcesReady(course.visualImageSlots);
  if (input) await savePresentation(db, courseId, input, { preservePublished: true });
  if (course.lifecycleStatus !== "published" || course.staleFromStage) await db.course.update({ where: { id: courseId }, data: { lifecycleStatus: "published", currentStage: "preview", staleFromStage: null } });
  return { redirectUrl: `/courses/${courseId}` };
}
