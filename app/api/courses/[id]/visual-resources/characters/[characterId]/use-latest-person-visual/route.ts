import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { visualResourcesError } from "@/lib/server/http/visual-resources";
import { adoptLatestPersonVisual } from "@/lib/server/repositories/visual-resources";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; characterId: string }> }) {
  const { id, characterId } = await params;
  try { return NextResponse.json(await adoptLatestPersonVisual(getDb(), id, characterId)); }
  catch (error) { return visualResourcesError(error); }
}
