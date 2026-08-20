import { z } from "zod";

const storageProbeSchema = z.object({
  available: z.boolean(),
  errorMessage: z.string().max(500).optional(),
  errorName: z.string().max(100).optional(),
});

const clientErrorSchema = z.object({
  diagnostics: z.object({
    isSecureContext: z.boolean(),
    localStorage: storageProbeSchema,
    randomUUIDAvailable: z.boolean(),
    sessionStorage: storageProbeSchema,
  }).optional(),
  digest: z.string().max(200).optional(),
  message: z.string().min(1).max(2_000),
  occurredAt: z.string().datetime(),
  online: z.boolean().optional(),
  reportId: z.string().regex(/^CE-\d{8}T\d{6}-[a-z0-9]{6}$/),
  resourceUrl: z.string().max(2_000).optional(),
  route: z.string().max(1_000).optional(),
  stack: z.string().max(8_000).optional(),
  type: z.enum(["error-boundary", "promise", "resource", "runtime"]),
  userAgent: z.string().max(1_000).optional(),
  viewport: z.string().max(50).optional(),
});

const maximumReportBytes = 32_768;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumReportBytes) {
    return Response.json({ message: "客户端错误报告过大" }, { status: 413 });
  }

  let input: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > maximumReportBytes) {
      return Response.json({ message: "客户端错误报告过大" }, { status: 413 });
    }
    input = JSON.parse(raw);
  } catch {
    return Response.json({ message: "客户端错误报告格式错误" }, { status: 400 });
  }

  const parsed = clientErrorSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ message: "客户端错误报告字段错误" }, { status: 400 });
  }

  console.error("[CLIENT_ERROR]", JSON.stringify({
    ...parsed.data,
    receivedAt: new Date().toISOString(),
  }));

  return Response.json({ reportId: parsed.data.reportId }, { status: 202 });
}
