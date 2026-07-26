import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  clearLessonChatDraft,
  getLessonChatDraft,
  LessonChatNotFoundError,
} from "@/lib/server/repositories/lesson-chat";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    return NextResponse.json(await getLessonChatDraft(getDb(), id));
  } catch (error) {
    if (error instanceof LessonChatNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: "教案共创内容加载失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await clearLessonChatDraft(getDb(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof LessonChatNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: "清空对话失败" }, { status: 500 });
  }
}
