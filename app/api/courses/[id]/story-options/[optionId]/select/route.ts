import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  selectStoryOption,
  StoryOptionsLockedError,
  StoryOptionsNotFoundError,
  StoryOptionsValidationError,
} from "@/lib/server/repositories/story-options";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; optionId: string }> }) {
  const { id, optionId } = await params;

  try {
    const result = await selectStoryOption(getDb(), id, optionId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StoryOptionsNotFoundError) {
      return NextResponse.json({ message: "课程或故事方案不存在" }, { status: 404 });
    }

    if (error instanceof StoryOptionsLockedError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }

    if (error instanceof StoryOptionsValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: "故事方案选择失败" }, { status: 500 });
  }
}
