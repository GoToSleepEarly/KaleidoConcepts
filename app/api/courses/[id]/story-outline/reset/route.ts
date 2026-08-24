import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  CourseStoryOutlineNotFoundError,
  resetStoryOutline,
} from "@/lib/server/repositories/story-outline";
import { markCourseDownstreamStale, type CourseDownstreamDb } from "@/lib/server/repositories/course-downstream";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const state = await resetStoryOutline(db, id);
    await markCourseDownstreamStale(db as unknown as CourseDownstreamDb, id, "story_outline");
    return NextResponse.json(state);
  } catch (error) {
    if (error instanceof CourseStoryOutlineNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ message: "故事大纲重置失败" }, { status: 500 });
  }
}
