import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { archivePerson, PersonNotFoundError } from "@/lib/server/repositories/people";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await archivePerson(getDb(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PersonNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    return NextResponse.json({ message: "人物停用失败" }, { status: 500 });
  }
}
