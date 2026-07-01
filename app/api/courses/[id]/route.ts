import { NextResponse } from "next/server";

import { mockCourse } from "@/lib/mock-course-data";

export async function GET() {
  return NextResponse.json({ course: mockCourse });
}
