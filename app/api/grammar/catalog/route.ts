import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { getGrammarCatalog } from "@/lib/server/repositories/grammar-catalog";

export async function GET() {
  try {
    return NextResponse.json(await getGrammarCatalog(getDb()));
  } catch {
    return NextResponse.json({ message: "语法知识库加载失败" }, { status: 500 });
  }
}
