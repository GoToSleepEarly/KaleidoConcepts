import type { CourseStage } from "@/lib/contracts/api";
import { earliestCourseStage, nextCourseStage } from "@/lib/domain/course-stage";
import { removeStoredCourseImage } from "@/lib/server/storage/course-images";

type DeleteDelegate = {
  deleteMany: (query: { where: { courseId: string } }) => Promise<{ count: number }>;
  findFirst?: (query: { where: { courseId: string }; select: { courseId: true } }) => Promise<{ courseId: string } | null>;
  findMany?: (query: { where: { courseId: string }; select: Record<string, boolean> }) => Promise<Array<{ storagePath?: string | null; temporarySourcePath?: string | null }>>;
  updateMany?: (query: { where: { courseId: string }; data: Record<string, unknown> }) => Promise<{ count: number }>;
};

type CourseDelegate = {
  findUnique: (query: { where: { id: string }; select: Record<string, boolean> }) => Promise<{ currentStage: CourseStage; staleFromStage?: CourseStage | null; lifecycleStatus?: "draft" | "published" | "archived" } | null>;
  update: (query: { where: { id: string }; data: { currentStage?: CourseStage; staleFromStage?: CourseStage | null; lifecycleStatus?: "draft" } }) => Promise<unknown>;
};

export type CourseDownstreamBoundary = "audience" | "story_outline" | "teaching_plan" | "content";
export type CoursePreservedStage = CourseDownstreamBoundary | "visual_resources";

export type CourseDownstreamDb = {
  course: CourseDelegate;
  courseStoryChatMessage: DeleteDelegate;
  courseStoryDirection: DeleteDelegate;
  courseSourceReference: DeleteDelegate;
  courseStoryOutline: DeleteDelegate;
  courseStorySetting: DeleteDelegate;
  courseCharacter: DeleteDelegate;
  courseTeachingPlan: DeleteDelegate;
  courseContentChatMessage: DeleteDelegate;
  courseContentGeneration: DeleteDelegate;
  courseLessonContent: DeleteDelegate;
  courseImage: DeleteDelegate;
  courseVisualImageSlot: DeleteDelegate;
  courseCharacterVisual: DeleteDelegate;
  courseVisualResourcePlan: DeleteDelegate;
  coursePresentation: DeleteDelegate;
  $transaction: <T>(callback: (tx: CourseDownstreamDb) => Promise<T>) => Promise<T>;
};

const stageOrder: Record<CourseStage, number> = {
  audience: 1,
  story_outline: 2,
  teaching_plan: 3,
  content: 4,
  visual_resources: 5,
  preview: 6,
};

const clearFromStage: Record<CoursePreservedStage, CourseStage> = {
  audience: "story_outline",
  story_outline: "teaching_plan",
  teaching_plan: "content",
  content: "visual_resources",
  visual_resources: "preview",
};

export async function clearCourseDataAfterStage(
  db: CourseDownstreamDb,
  courseId: string,
  preservedStage: CoursePreservedStage,
  currentStage: CourseStage = clearFromStage[preservedStage],
) {
  const preservedIndex = stageOrder[preservedStage];
  const imageRecords = preservedIndex < stageOrder.visual_resources && db.courseImage.findMany
    ? await db.courseImage.findMany({ where: { courseId }, select: { storagePath: true, temporarySourcePath: true } })
    : [];

  if (preservedIndex < stageOrder.preview) await db.coursePresentation.deleteMany({ where: { courseId } });
  if (preservedIndex < stageOrder.visual_resources) {
    await db.courseVisualImageSlot.updateMany?.({ where: { courseId }, data: { activeImageId: null } });
    await db.courseCharacterVisual.updateMany?.({ where: { courseId }, data: { activeImageId: null } });
    await db.courseImage.updateMany?.({ where: { courseId }, data: { parentAssetId: null } });
    await db.courseImage.deleteMany({ where: { courseId } });
    await db.courseVisualImageSlot.deleteMany({ where: { courseId } });
    await db.courseCharacterVisual.deleteMany({ where: { courseId } });
    await db.courseVisualResourcePlan.deleteMany({ where: { courseId } });
  }
  if (preservedIndex < stageOrder.content) {
    await db.courseContentChatMessage.deleteMany({ where: { courseId } });
    await db.courseContentGeneration.deleteMany({ where: { courseId } });
    await db.courseLessonContent.deleteMany({ where: { courseId } });
  }
  if (preservedIndex < stageOrder.teaching_plan) await db.courseTeachingPlan.deleteMany({ where: { courseId } });
  if (preservedIndex < stageOrder.story_outline) {
    await db.courseStoryChatMessage.deleteMany({ where: { courseId } });
    await db.courseStoryDirection.deleteMany({ where: { courseId } });
    await db.courseCharacter.deleteMany({ where: { courseId } });
    await db.courseSourceReference.deleteMany({ where: { courseId } });
    await db.courseStoryOutline.deleteMany({ where: { courseId } });
    await db.courseStorySetting.deleteMany({ where: { courseId } });
  }
  await db.course.update({ where: { id: courseId }, data: { currentStage, staleFromStage: null, lifecycleStatus: "draft" } });
  return [...new Set(imageRecords.flatMap((item) => [item.storagePath, item.temporarySourcePath]).filter((path): path is string => Boolean(path)))];
}

export async function clearCourseAfterStage(
  db: CourseDownstreamDb,
  courseId: string,
  preservedStage: CoursePreservedStage,
  currentStage?: CourseStage,
) {
  const clear = (tx: CourseDownstreamDb) => clearCourseDataAfterStage(tx, courseId, preservedStage, currentStage);
  const storagePaths = db.$transaction ? await db.$transaction(clear) : await clear(db);
  await removeCourseImageFiles(storagePaths);
}

export async function removeCourseImageFiles(storagePaths: string[]) {
  const results = await Promise.allSettled(storagePaths.map((path) => removeStoredCourseImage(path)));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("[course-downstream-cleanup] failed to remove stored image", {
        storagePath: storagePaths[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
}

const stageByBoundary: Record<CourseDownstreamBoundary, CourseStage> = {
  audience: "audience",
  story_outline: "story_outline",
  teaching_plan: "teaching_plan",
  content: "content",
};

export async function markCourseDownstreamStale(
  db: CourseDownstreamDb,
  courseId: string,
  boundary: CourseDownstreamBoundary,
) {
  const staleStage = nextCourseStage(stageByBoundary[boundary]);
  if (!staleStage) return;
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { currentStage: true, staleFromStage: true, lifecycleStatus: true },
  });
  if (!course) return;
  await db.course.update({
    where: { id: courseId },
    data: {
      staleFromStage: earliestCourseStage(course.staleFromStage, staleStage),
      lifecycleStatus: "draft",
    },
  });
}

export async function hasCourseDownstream(db: CourseDownstreamDb, courseId: string, boundary: CourseDownstreamBoundary) {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { currentStage: true } });
  if (!course) return false;

  const visualDelegates = [db.coursePresentation, db.courseImage, db.courseVisualImageSlot, db.courseCharacterVisual, db.courseVisualResourcePlan];
  const contentDelegates = [db.courseContentChatMessage, db.courseContentGeneration, db.courseLessonContent];
  const teachingDelegates = [db.courseTeachingPlan];
  const storyDelegates = [db.courseStoryChatMessage, db.courseStoryDirection, db.courseSourceReference, db.courseStoryOutline, db.courseCharacter];
  const delegates = boundary === "content"
    ? visualDelegates
    : boundary === "teaching_plan"
      ? [...contentDelegates, ...visualDelegates]
      : boundary === "story_outline"
        ? [...teachingDelegates, ...contentDelegates, ...visualDelegates]
        : [...storyDelegates, ...teachingDelegates, ...contentDelegates, ...visualDelegates];
  const records = await Promise.all(delegates.map((delegate) => delegate.findFirst?.({ where: { courseId }, select: { courseId: true } }) ?? null));
  return records.some(Boolean);
}

export async function getCourseDownstreamImpact(db: CourseDownstreamDb, courseId: string, boundary: CourseDownstreamBoundary) {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { currentStage: true } });
  if (!course) return [];
  const [storyOutline, teachingPlan, content, visualPlan, visualSlot, image, characterVisual, presentation] = await Promise.all([
    db.courseStoryOutline.findFirst?.({ where: { courseId }, select: { courseId: true } }) ?? null,
    db.courseTeachingPlan.findFirst?.({ where: { courseId }, select: { courseId: true } }) ?? null,
    db.courseLessonContent.findFirst?.({ where: { courseId }, select: { courseId: true } }) ?? null,
    db.courseVisualResourcePlan.findFirst?.({ where: { courseId }, select: { courseId: true } }) ?? null,
    db.courseVisualImageSlot.findFirst?.({ where: { courseId }, select: { courseId: true } }) ?? null,
    db.courseImage.findFirst?.({ where: { courseId }, select: { courseId: true } }) ?? null,
    db.courseCharacterVisual.findFirst?.({ where: { courseId }, select: { courseId: true } }) ?? null,
    db.coursePresentation.findFirst?.({ where: { courseId }, select: { courseId: true } }) ?? null,
  ]);
  const impact: string[] = [];
  if (boundary === "audience" && storyOutline) impact.push("故事大纲");
  if ((boundary === "audience" || boundary === "story_outline") && teachingPlan) impact.push("教学规划");
  if (boundary !== "content" && content) impact.push("文案与练习");
  if (visualPlan || visualSlot || image || characterVisual) impact.push("视觉资源和图片");
  if (presentation) impact.push("预览发布设置");
  return impact;
}
