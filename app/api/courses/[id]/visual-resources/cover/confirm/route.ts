import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { visualResourcesError } from "@/lib/server/http/visual-resources";
import { confirmVisualCover } from "@/lib/server/repositories/visual-resources";
import { visualCoverConfirmSchema } from "@/lib/server/validation/visual-resources";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const input = visualCoverConfirmSchema.parse(await request.json());
    return NextResponse.json(await confirmVisualCover(getDb(), (await params).id, input.assetId));
  } catch (error) { return visualResourcesError(error); }
}
