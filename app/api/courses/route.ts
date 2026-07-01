import { NextResponse } from "next/server";

import { mockCourse } from "@/lib/mock-course-data";

export async function GET() {
  return NextResponse.json({ courses: [mockCourse] });
}

export async function POST() {
  return NextResponse.json({ course: mockCourse }, { status: 201 });
}
