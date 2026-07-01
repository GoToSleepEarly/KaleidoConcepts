import { NextResponse } from "next/server";

import { mockStudents } from "@/lib/mock-course-data";

export async function GET() {
  return NextResponse.json({ students: mockStudents });
}
