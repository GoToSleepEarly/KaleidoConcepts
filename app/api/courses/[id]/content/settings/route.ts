import { NextResponse } from "next/server";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await request.json().catch(() => ({}));
  await params;
  return NextResponse.json({ message: "文本模型请在账户高级设置中修改" }, { status: 409 });
}
