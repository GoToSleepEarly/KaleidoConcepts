import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/server/db";
import { createPerson, listPeople } from "@/lib/server/repositories/people";
import type { PersonRole } from "@/lib/contracts/api";

const genderSchema = z.enum(["male", "female"]);

const personInputSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("teacher"),
    chineseName: z.string().trim().min(1),
    englishName: z.string().trim().min(1),
    age: z.number().int(),
    gender: genderSchema,
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roleParam = searchParams.get("role");

  if (roleParam && roleParam !== "teacher" && roleParam !== "student") {
    return NextResponse.json({ message: "人物类型无效" }, { status: 400 });
  }

  const role = roleParam as PersonRole | null;

  try {
    const people = await listPeople(getDb(), role ? { role } : {});
    return NextResponse.json({ people });
  } catch {
    return NextResponse.json({ message: "人物档案加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = personInputSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "人物信息不完整" }, { status: 400 });
  }

  try {
    const person = await createPerson(getDb(), payload.data);
    return NextResponse.json({ person }, { status: 201 });
  } catch {
    return NextResponse.json({ message: "人物保存失败" }, { status: 500 });
  }
}
