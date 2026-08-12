import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/server/db";
import { createPerson, listPeople } from "@/lib/server/repositories/people";
import { personCreateSchema } from "@/lib/server/validation/people";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = z.object({
    role: z.enum(["teacher", "student"]).optional(),
    query: z.string().max(80).optional(),
    status: z.enum(["active", "archived"]).default("active"),
    sort: z.enum(["recent", "name"]).default("recent"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }).safeParse(Object.fromEntries(params));
  if (!parsed.success) return NextResponse.json({ message: "人物查询参数无效" }, { status: 400 });

  try {
    return NextResponse.json(await listPeople(getDb(), {
      ...parsed.data,
      pageSize: parsed.data.pageSize ?? parsed.data.limit ?? 50,
    }));
  } catch {
    return NextResponse.json({ message: "人物档案加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = personCreateSchema.safeParse(await request.json());
  if (!payload.success) return NextResponse.json({ message: "请完整填写中文名、英文名、年龄和性别" }, { status: 400 });
  try {
    return NextResponse.json({ person: await createPerson(getDb(), payload.data) }, { status: 201 });
  } catch {
    return NextResponse.json({ message: "人物保存失败" }, { status: 500 });
  }
}
