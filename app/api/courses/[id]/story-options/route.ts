import { NextResponse } from "next/server";

import { mockStoryPlans } from "@/lib/mock-course-data";

export async function POST() {
  return NextResponse.json({ options: mockStoryPlans });
}
