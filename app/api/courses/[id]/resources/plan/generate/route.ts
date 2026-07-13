import { NextResponse } from "next/server";

import { generateCourseResourcePlan } from "@/lib/server/ai/resource-plan-generator";
import { getDb } from "@/lib/server/db";
import { CourseBasicValidationError, getStoryGenerationContext } from "@/lib/server/repositories/courses";
import {
  CourseImageNotFoundError,
  CourseImagePrerequisiteError,
  saveCourseResourcePlan,
} from "@/lib/server/repositories/course-images";
import {
  getLessonDraft,
  getLessonDraftPrerequisites,
  LessonDraftPrerequisiteError,
} from "@/lib/server/repositories/lesson-drafts";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  try {
    const context = await getStoryGenerationContext(db, id);
    if (!context) {
      return NextResponse.json({ message: "课程不存在" }, { status: 404 });
    }

    const [{ draft }, { option }] = await Promise.all([getLessonDraft(db, id), getLessonDraftPrerequisites(db, id)]);
    if (!draft) {
      throw new CourseImagePrerequisiteError("请先生成课文草稿");
    }

    const plan = await generateCourseResourcePlan({
      ...context,
      storyOption: option,
      draft,
    });
    const result = await saveCourseResourcePlan(db, id, plan);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CourseImageNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof CourseImagePrerequisiteError || error instanceof CourseBasicValidationError || error instanceof LessonDraftPrerequisiteError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Resource plan generation failed", error);
    return NextResponse.json({ message: "资源方案生成失败" }, { status: 500 });
  }
}
