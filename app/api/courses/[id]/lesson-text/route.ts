import { NextResponse } from "next/server";

import { mockLessonText } from "@/lib/mock-course-data";

export async function POST() {
  return NextResponse.json({ lessonText: mockLessonText });
}
