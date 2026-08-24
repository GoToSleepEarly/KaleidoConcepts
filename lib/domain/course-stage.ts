import type { CourseStage } from "@/lib/contracts/api";

export const courseStages: CourseStage[] = [
  "audience",
  "story_outline",
  "teaching_plan",
  "content",
  "visual_resources",
  "preview",
];

export function courseStageIndex(stage: CourseStage) {
  return courseStages.indexOf(stage);
}

export function furthestCourseStage(left: CourseStage, right: CourseStage) {
  return courseStageIndex(left) >= courseStageIndex(right) ? left : right;
}

export function earliestCourseStage(left: CourseStage | null | undefined, right: CourseStage) {
  if (!left) return right;
  return courseStageIndex(left) <= courseStageIndex(right) ? left : right;
}

export function nextCourseStage(stage: CourseStage): CourseStage | null {
  return courseStages[courseStageIndex(stage) + 1] ?? null;
}

export function isCourseStageStale(staleFromStage: CourseStage | null | undefined, stage: CourseStage) {
  return Boolean(staleFromStage && courseStageIndex(stage) >= courseStageIndex(staleFromStage));
}

export function staleStageAfterConfirming(
  staleFromStage: CourseStage | null | undefined,
  confirmedStage: CourseStage,
  furthestStage: CourseStage,
) {
  if (staleFromStage !== confirmedStage) return staleFromStage ?? null;
  const nextStage = nextCourseStage(confirmedStage);
  return nextStage && courseStageIndex(furthestStage) > courseStageIndex(confirmedStage) ? nextStage : null;
}
