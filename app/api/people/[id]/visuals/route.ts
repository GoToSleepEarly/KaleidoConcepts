import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { listPersonVisuals } from "@/lib/server/repositories/person-visuals";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json({ visuals: await listPersonVisuals(getDb(), id) });
  } catch {
    return NextResponse.json({ message: "人物形象加载失败" }, { status: 500 });
  }
}
