import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { deletePersonVisual, PersonVisualInvalidStateError, PersonVisualNotFoundError } from "@/lib/server/repositories/person-visuals";
import { removeStoredPersonVisual } from "@/lib/server/storage/person-visuals";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params;
  try {
    await deletePersonVisual(getDb(), id, assetId, removeStoredPersonVisual);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PersonVisualNotFoundError) return NextResponse.json({ message: error.message }, { status: 404 });
    if (error instanceof PersonVisualInvalidStateError) return NextResponse.json({ message: error.message }, { status: 409 });
    return NextResponse.json({ message: "人物形象删除失败" }, { status: 500 });
  }
}
