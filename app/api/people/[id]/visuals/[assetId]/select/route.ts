import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { PersonVisualInvalidStateError, selectPersonVisual } from "@/lib/server/repositories/person-visuals";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params;
  try {
    return NextResponse.json({ visual: await selectPersonVisual(getDb(), id, assetId) });
  } catch (error) {
    if (error instanceof PersonVisualInvalidStateError) return NextResponse.json({ message: error.message }, { status: 409 });
    return NextResponse.json({ message: "当前形象保存失败" }, { status: 500 });
  }
}
