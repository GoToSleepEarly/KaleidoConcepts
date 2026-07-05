import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/server/db";
import { updatePerson } from "@/lib/server/repositories/people";

const genderSchema = z.enum(["male", "female"]);

const personInputSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("teacher"),
    name: z.string().trim().min(1),
    gender: genderSchema.optional(),
    appearance: z.string().optional(),
    notes: z.string().optional(),
    avatarUrl: z.string().optional(),
  }),
  z.object({
    role: z.literal("student"),
    chineseName: z.string().trim().min(1),
    englishName: z.string().trim().min(1),
    age: z.number().int(),
    gender: genderSchema,
    appearance: z.string().trim().min(1),
    interests: z.array(z.string()).default([]),
    learningGoal: z.string().optional(),
    notes: z.string().optional(),
    avatarUrl: z.string().optional(),
  }),
]);

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = personInputSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "人物信息不完整" }, { status: 400 });
  }

  try {
    const person = await updatePerson(getDb(), id, payload.data);
    return NextResponse.json({ person });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2025") {
      return NextResponse.json({ message: "人物不存在" }, { status: 404 });
    }

    return NextResponse.json({ message: "人物保存失败" }, { status: 500 });
  }
}
