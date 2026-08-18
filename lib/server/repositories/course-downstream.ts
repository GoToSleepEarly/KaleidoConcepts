import type { CourseStage } from "@/lib/contracts/api";
import { removeCourseImageFiles } from "@/lib/server/storage/course-images";

type DeleteDelegate = {
  deleteMany: (query: { where: { courseId: string } }) => Promise<{ count: number }>;
  findFirst?: (query: { where: { courseId: string }; select: { courseId: true } }) => Promise<{ courseId: string } | null>;
};

type CourseDelegate = {
  findUnique: (query: { where: { id: string }; select: { currentStage: true } }) => Promise<{ currentStage: CourseStage } | null>;
  update: (query: { where: { id: string }; data: { currentStage: CourseStage; lifecycleStatus: "draft" } }) => Promise<unknown>;
};

export type CourseDownstreamBoundary = "audience" | "story_outline" | "teaching_plan" | "content";

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

const stageByBoundary: Record<CourseDownstreamBoundary, CourseStage> = {
  audience: "audience",
  story_outline: "story_outline",
  teaching_plan: "teaching_plan",
  content: "content",
};

const stageOrder: Record<CourseStage, number> = {
  audience: 1,
  story_outline: 2,
  teaching_plan: 3,
  content: 4,
  visual_resources: 5,
  preview: 6,
};

export async function hasCourseDownstream(db: CourseDownstreamDb, courseId: string, boundary: CourseDownstreamBoundary) {
  const course = await db.course.findUnique({ where: { id: courseId }, select: { currentStage: true } });
  if (!course) return false;
  if (stageOrder[course.currentStage] > stageOrder[stageByBoundary[boundary]]) return true;

  const visualDelegates = [db.coursePresentation, db.courseImage, db.courseVisualImageSlot, db.courseCharacterVisual, db.courseVisualResourcePlan];
  const contentDelegates = [db.courseContentChatMessage, db.courseContentGeneration, db.courseLessonContent];
  const teachingDelegates = [db.courseTeachingPlan];
  const storyDelegates = [db.courseStoryChatMessage, db.courseStoryDirection, db.courseSourceReference, db.courseStoryOutline, db.courseStorySetting, db.courseCharacter];
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
  if (boundary === "audience" && (storyOutline || stageOrder[course.currentStage] >= stageOrder.teaching_plan)) impact.push("故事大纲");
  if ((boundary === "audience" || boundary === "story_outline") && (teachingPlan || stageOrder[course.currentStage] >= stageOrder.teaching_plan)) impact.push("教学规划");
  if (boundary !== "content" && (content || stageOrder[course.currentStage] >= stageOrder.content)) impact.push("文案与练习");
  if (visualPlan || visualSlot || image || characterVisual || stageOrder[course.currentStage] >= stageOrder.visual_resources) impact.push("视觉资源和图片");
  if (presentation || stageOrder[course.currentStage] >= stageOrder.preview) impact.push("预览发布设置");
  return impact;
}

async function deleteCourseDownstreamRecords(
  tx: CourseDownstreamDb,
  courseId: string,
  boundary: CourseDownstreamBoundary,
) {
  await tx.coursePresentation.deleteMany({ where: { courseId } });
  await tx.courseImage.deleteMany({ where: { courseId } });
  await tx.courseVisualImageSlot.deleteMany({ where: { courseId } });
  await tx.courseCharacterVisual.deleteMany({ where: { courseId } });
  await tx.courseVisualResourcePlan.deleteMany({ where: { courseId } });

  if (boundary !== "content") {
    await tx.courseContentChatMessage.deleteMany({ where: { courseId } });
    await tx.courseContentGeneration.deleteMany({ where: { courseId } });
    await tx.courseLessonContent.deleteMany({ where: { courseId } });
  }
  if (boundary === "audience" || boundary === "story_outline") {
    await tx.courseTeachingPlan.deleteMany({ where: { courseId } });
  }
  if (boundary === "audience") {
    await tx.courseStoryChatMessage.deleteMany({ where: { courseId } });
    await tx.courseStoryDirection.deleteMany({ where: { courseId } });
    await tx.courseCharacter.deleteMany({ where: { courseId } });
    await tx.courseSourceReference.deleteMany({ where: { courseId } });
    await tx.courseStoryOutline.deleteMany({ where: { courseId } });
    await tx.courseStorySetting.deleteMany({ where: { courseId } });
  }

  await tx.course.update({
    where: { id: courseId },
    data: { currentStage: stageByBoundary[boundary], lifecycleStatus: "draft" },
  });
}

export async function withCourseDownstreamReset<T>(
  db: CourseDownstreamDb,
  courseId: string,
  boundary: CourseDownstreamBoundary,
  mutation: (tx: CourseDownstreamDb) => Promise<T>,
  dependencies: { removeImages?: (courseId: string) => Promise<void> } = {},
) {
  const removeImages = dependencies.removeImages ?? removeCourseImageFiles;
  const result = await db.$transaction(async (tx) => {
    await deleteCourseDownstreamRecords(tx, courseId, boundary);
    return mutation(tx);
  });
  await removeImages(courseId);
  return result;
}

export async function clearCourseDownstream(
  db: CourseDownstreamDb,
  courseId: string,
  boundary: CourseDownstreamBoundary,
  dependencies: { removeImages?: (courseId: string) => Promise<void> } = {},
) {
  return withCourseDownstreamReset(db, courseId, boundary, async () => undefined, dependencies);
}

export async function runBeforeCourseDownstreamReset<T>(
  db: CourseDownstreamDb,
  courseId: string,
  boundary: CourseDownstreamBoundary,
  mutation: () => Promise<T>,
  dependencies: { removeImages?: (courseId: string) => Promise<void> } = {},
) {
  const result = await mutation();
  await clearCourseDownstream(db, courseId, boundary, dependencies);
  return result;
}
