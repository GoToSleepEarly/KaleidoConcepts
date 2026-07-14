import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/server/db";
import { archivePreset, PresetConflictError, PresetNotFoundError, updatePreset } from "@/lib/server/repositories/presets";

const presetInputSchema = z.object({
  kind: z.enum(["theme", "grammar"]),
  label: z.string().trim().min(1),
  category: z.string().optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = presetInputSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ message: "预设信息不完整" }, { status: 400 });
  }

  try {
    const preset = await updatePreset(getDb(), id, payload.data);
    return NextResponse.json({ preset });
  } catch (error) {
    if (error instanceof PresetNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof PresetConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }

    return NextResponse.json({ message: "预设保存失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await archivePreset(getDb(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PresetNotFoundError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    return NextResponse.json({ message: "预设删除失败" }, { status: 500 });
  }
}
