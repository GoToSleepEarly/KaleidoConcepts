import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseStoryOutlineNotFoundError,
  CourseStoryOutlineValidationError,
  confirmStoryOutline,
} from "@/lib/server/repositories/story-outline";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const course = await confirmStoryOutline(getDb(), id);
    return NextResponse.json({ course });
  } catch (error) {
    if (error instanceof CourseStoryOutlineNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof CourseStoryOutlineValidationError) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ message: "故事大纲确认失败" }, { status: 500 });
  }
}
