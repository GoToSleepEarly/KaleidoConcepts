import type {
  CoursePresentationConfig,
  CoursePresentationUpdate,
  CourseStatus,
  PublishCourseResponse,
} from "@/lib/contracts/api";
import {
  CoursePreviewNotFoundError,
  CoursePreviewPrerequisiteError,
  CoursePublishStatusError,
  type CoursePreviewDb,
} from "@/lib/server/repositories/course-preview";

export { CoursePublishStatusError };

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

export function assertEditable(status: CourseStatus) {
  if (status === "published") {
    throw new CoursePublishStatusError();
  }
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
  assertEditable(course.status);

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
  if (course.status === "published") throw new CoursePublishStatusError("课程已发布");

  if (presentationUpdate) {
    await upsertPresentation(db, courseId, presentationUpdate);
  }

  await db.course.update({
    where: { id: courseId },
    data: { status: "published" },
  });

  return { redirectUrl: `/courses/${courseId}` };
}
