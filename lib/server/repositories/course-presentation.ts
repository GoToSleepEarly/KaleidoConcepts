import type {
  CoursePresentationConfig,
  CoursePresentationUpdate,
  PublishCourseResponse,
} from "@/lib/contracts/api";
import {
  CoursePreviewNotFoundError,
  CoursePreviewPrerequisiteError,
  type CoursePreviewDb,
} from "@/lib/server/repositories/course-preview";

export function defaultPresentation(): CoursePresentationConfig {
  return {
    coverTheme: "dark",
    coverTitleFontSize: 1.0,
    chapterTheme: "blue-purple",
    slideOverrides: {},
  };
}

export function normalizePresentationUpdate(
  input: Partial<CoursePresentationUpdate>,
): CoursePresentationUpdate {
  return {
    coverTheme: input.coverTheme ?? defaultPresentation().coverTheme,
    coverTitleFontSize: input.coverTitleFontSize ?? defaultPresentation().coverTitleFontSize,
    chapterTheme: input.chapterTheme ?? defaultPresentation().chapterTheme,
    slideOverrides: input.slideOverrides ?? {},
  };
}

export async function upsertPresentation(
  db: CoursePreviewDb,
  courseId: string,
  update: Partial<CoursePresentationUpdate>,
): Promise<CoursePresentationConfig> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { lessonDraft: true, people: { include: { person: true } }, resourcePlan: true, presentation: true },
  });
  if (!course) throw new CoursePreviewNotFoundError();

  const normalized = normalizePresentationUpdate(update);

  await db.coursePresentation.upsert({
    where: { courseId },
    create: {
      courseId,
      coverTheme: normalized.coverTheme,
      coverTitleFontSize: normalized.coverTitleFontSize,
      chapterTheme: normalized.chapterTheme,
      slideOverrides: normalized.slideOverrides as unknown as Record<string, unknown>,
    },
    update: {
      coverTheme: normalized.coverTheme,
      coverTitleFontSize: normalized.coverTitleFontSize,
      chapterTheme: normalized.chapterTheme,
      slideOverrides: normalized.slideOverrides as unknown as Record<string, unknown>,
    },
  });

  return {
    coverTheme: normalized.coverTheme,
    coverTitleFontSize: normalized.coverTitleFontSize,
    chapterTheme: normalized.chapterTheme,
    slideOverrides: normalized.slideOverrides,
  };
}

export async function publishCourse(
  db: CoursePreviewDb,
  courseId: string,
  presentationUpdate?: Partial<CoursePresentationUpdate>,
): Promise<PublishCourseResponse> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { lessonDraft: true, people: { include: { person: true } }, resourcePlan: true, presentation: true },
  });
  if (!course) throw new CoursePreviewNotFoundError();
  if (!course.lessonDraft) throw new CoursePreviewPrerequisiteError("请先生成课文草稿");

  if (presentationUpdate) {
    await upsertPresentation(db, courseId, presentationUpdate);
  }

  // 已发布课程重复发布视为幂等：仅确保状态为 published 并返回授课页地址。
  if (course.status !== "published") {
    await db.course.update({
      where: { id: courseId },
      data: { status: "published" },
    });
  }

  return { redirectUrl: `/courses/${courseId}` };
}
