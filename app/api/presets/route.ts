import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/server/db";
import { createPreset, listPresets, PresetConflictError } from "@/lib/server/repositories/presets";
import type { PresetKind } from "@/lib/contracts/api";

const presetInputSchema = z.object({
  kind: z.enum(["theme", "grammar"]),
  label: z.string().trim().min(1),
  category: z.string().optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kindParam = searchParams.get("kind");

  if (kindParam && kindParam !== "theme" && kindParam !== "grammar") {
    return NextResponse.json({ message: "预设类型无效" }, { status: 400 });
  }

  const kind = kindParam as PresetKind | null;

  try {
    const presets = await listPresets(getDb(), kind ? { kind } : {});
    return NextResponse.json({ presets });
  } catch {
    return NextResponse.json({ message: "预设加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = presetInputSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "预设信息不完整" }, { status: 400 });
  }

  try {
    const preset = await createPreset(getDb(), payload.data);
    return NextResponse.json({ preset }, { status: 201 });
  } catch (error) {
    if (error instanceof PresetConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }

    return NextResponse.json({ message: "预设保存失败" }, { status: 500 });
  }
}
