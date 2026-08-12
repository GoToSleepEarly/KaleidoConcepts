import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { visualResourcesError } from "@/lib/server/http/visual-resources";
import { updateCharacterVisualIntent } from "@/lib/server/repositories/visual-resources";
import { visualIntentSchema } from "@/lib/server/validation/visual-resources";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; characterId: string }> }) {
  const { id, characterId } = await params;
  try { const input = visualIntentSchema.parse(await request.json()); return NextResponse.json(await updateCharacterVisualIntent(getDb(), id, characterId, input.intent)); }
  catch (error) { return visualResourcesError(error); }
}
