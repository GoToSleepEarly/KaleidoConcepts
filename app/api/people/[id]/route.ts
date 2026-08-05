import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { PersonNotFoundError, updatePerson } from "@/lib/server/repositories/people";
import { personUpdateSchema } from "@/lib/server/validation/people";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = personUpdateSchema.safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ message: "请完整填写中文名、英文名、年龄和性别" }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json({ person: await updatePerson(getDb(), id, payload.data) });
  } catch (error) {
    if (error instanceof PersonNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ message: "人物保存失败" }, { status: 500 });
  }
}
