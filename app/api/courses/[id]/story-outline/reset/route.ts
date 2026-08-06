import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseStoryOutlineNotFoundError,
  resetStoryOutline,
} from "@/lib/server/repositories/story-outline";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await resetStoryOutline(getDb(), id));
  } catch (error) {
    if (error instanceof CourseStoryOutlineNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ message: "故事大纲重置失败" }, { status: 500 });
  }
}
