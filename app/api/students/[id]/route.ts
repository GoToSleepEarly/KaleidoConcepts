import { NextResponse } from "next/server";
import { z } from "zod";

import { defaultStudentAvatars, mockStudents } from "@/lib/mock-course-data";

const studentInputSchema = z.object({
  chineseName: z.string().trim().min(1),
  englishName: z.string().trim().min(1),
  age: z.number().int(),
  gender: z.enum(["male", "female"]),
  interests: z.array(z.string()).default([]),
  learningGoal: z.string().optional(),
  notes: z.string().optional(),
});

const mutableStudents = [...mockStudents];

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = studentInputSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "学生信息不完整" }, { status: 400 });
  }

  const index = mutableStudents.findIndex((student) => student.id === id);

  const student = {
    ...(index >= 0 ? mutableStudents[index] : { id, createdAt: new Date().toISOString() }),
    ...payload.data,
    name: payload.data.englishName,
    avatarUrl: defaultStudentAvatars[payload.data.gender],
    updatedAt: new Date().toISOString(),
  };

  if (index >= 0) {
    mutableStudents[index] = student;
  } else {
    mutableStudents.unshift(student);
  }

  return NextResponse.json({ student });
}
