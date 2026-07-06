import { NextResponse } from "next/server";

import type { LessonDraft } from "@/lib/contracts/api";
import { getDb } from "@/lib/server/db";
import {
  getLessonDraft,
  LessonDraftNotFoundError,
  LessonDraftPrerequisiteError,
  LessonDraftValidationError,
  saveLessonDraft,
} from "@/lib/server/repositories/lesson-drafts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const result = await getLessonDraft(getDb(), id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LessonDraftNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    return NextResponse.json({ message: "课文草稿加载失败" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = (await request.json().catch(() => null)) as { draft?: LessonDraft } | null;

  if (!payload?.draft) {
    return NextResponse.json({ message: "课文草稿信息不完整" }, { status: 400 });
  }

  try {
    const result = await saveLessonDraft(getDb(), id, payload.draft);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LessonDraftNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof LessonDraftPrerequisiteError || error instanceof LessonDraftValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: "课文草稿保存失败" }, { status: 500 });
  }
}
