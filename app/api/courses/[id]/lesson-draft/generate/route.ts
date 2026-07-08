import { NextResponse } from "next/server";

import { generateLessonDraft } from "@/lib/server/ai/lesson-draft-generator";
import { getDb } from "@/lib/server/db";
import { CourseBasicValidationError, getStoryGenerationContext } from "@/lib/server/repositories/courses";
import {
  getLessonDraft,
  getLessonDraftPrerequisites,
  LessonDraftNotFoundError,
  LessonDraftPrerequisiteError,
  LessonDraftValidationError,
  saveLessonDraft,
} from "@/lib/server/repositories/lesson-drafts";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  try {
    const existing = await getLessonDraft(db, id);

    if (existing.draft) {
      return NextResponse.json(existing);
    }

    const context = await getStoryGenerationContext(db, id);

    if (!context) {
      return NextResponse.json({ message: "课程不存在" }, { status: 404 });
    }

    const { option } = await getLessonDraftPrerequisites(db, id);
    const draft = await generateLessonDraft({ ...context, storyOption: option });
    const result = await saveLessonDraft(db, id, draft);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof LessonDraftNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof LessonDraftPrerequisiteError || error instanceof CourseBasicValidationError || error instanceof LessonDraftValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Lesson draft generation failed", error);
    return NextResponse.json({ message: "课文草稿生成失败" }, { status: 500 });
  }
}
