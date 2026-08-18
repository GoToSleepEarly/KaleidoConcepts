import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { visualResourcesError } from "@/lib/server/http/visual-resources";
import { updateVisualCharacterAppearance } from "@/lib/server/repositories/visual-resources";
import { visualCharacterAppearanceSchema } from "@/lib/server/validation/visual-resources";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; characterId: string }> }) {
  const { id, characterId } = await params;
  try {
    const input = visualCharacterAppearanceSchema.parse(await request.json());
    return NextResponse.json(await updateVisualCharacterAppearance(getDb(), id, characterId, input));
  } catch (error) {
    return visualResourcesError(error);
  }
}
