import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createCourseContentGenerationDeps } from "../../lib/server/ai/course-content-deps";
import { createStoryOutlineGenerationDeps } from "../../lib/server/ai/story-outline-deps";

type EvalConfig = {
  scope: "story" | "content";
  method: string;
  args: unknown[];
  bootstrapResponses?: string[];
};

type CapturedRequest = {
  index: number;
  url: string;
  operation: string;
  model: string | null;
  reasoningEffort: string | null;
  maxOutputTokens: number | null;
  prompt: string;
  promptSha256: string;
  promptCharacters: number;
  promptUtf8Bytes: number;
};

function argument(name: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const configPath = argument("--config");
  const outputDirectory = argument("--output-dir");
  const responsePaths = process.argv
    .filter((value) => value.startsWith("--response="))
    .map((value) => value.slice("--response=".length));

  if (!configPath || !outputDirectory) {
    throw new Error("Usage: pnpm exec tsx scripts/prompt-eval/run-manual-ai-operation.ts --config <config.json> --output-dir <directory> [--response=<raw-output.txt> ...]");
  }

  const config = JSON.parse(await readFile(path.resolve(configPath), "utf8")) as EvalConfig;
  const responseTexts = responsePaths.length
    ? await Promise.all(responsePaths.map((value) => readFile(path.resolve(value), "utf8")))
    : config.bootstrapResponses ?? [];
  const captured: CapturedRequest[] = [];

  process.env.QUICKROUTER_TEXT_API_KEY = "manual-eval-no-network";
  process.env.QUICKROUTER_GPT_TEXT_MODEL = "gpt-5.6-sol";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  const prompt = typeof body.input === "string" ? body.input : "";
  const reasoning = typeof body.reasoning === "object" && body.reasoning
    ? Reflect.get(body.reasoning, "effort")
    : null;
  const request: CapturedRequest = {
    index: captured.length,
    url: String(input),
    operation: config.method,
    model: typeof body.model === "string" ? body.model : null,
    reasoningEffort: typeof reasoning === "string" ? reasoning : null,
    maxOutputTokens: typeof body.max_output_tokens === "number" ? body.max_output_tokens : null,
    prompt,
    promptSha256: sha256(prompt),
    promptCharacters: Array.from(prompt).length,
    promptUtf8Bytes: Buffer.byteLength(prompt, "utf8"),
  };
  captured.push(request);

  const responseText = responseTexts[request.index];
  if (responseText === undefined) {
    throw new Error(`MANUAL_AI_RESPONSE_REQUIRED:${request.index}`);
  }
  return new Response(JSON.stringify({ status: "completed", output_text: responseText }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  }) as typeof fetch;

  const deps = config.scope === "story"
    ? createStoryOutlineGenerationDeps()
    : createCourseContentGenerationDeps();
  const method = Reflect.get(deps, config.method);
  if (typeof method !== "function") throw new Error(`Unknown ${config.scope} method: ${config.method}`);

  let result: unknown = null;
  let error: { name: string; message: string; stack?: string } | null = null;
  try {
    result = await Reflect.apply(method, deps, config.args);
  } catch (caught) {
    const value = caught instanceof Error ? caught : new Error(String(caught));
    error = { name: value.name, message: value.message, stack: value.stack };
  }

  const resolvedOutputDirectory = path.resolve(outputDirectory);
  await mkdir(resolvedOutputDirectory, { recursive: true });
  await Promise.all(captured.map(async (request) => {
    const prefix = String(request.index + 1).padStart(2, "0");
    await writeFile(path.join(resolvedOutputDirectory, `${prefix}-prompt.txt`), `${request.prompt}\n`, "utf8");
    await writeFile(path.join(resolvedOutputDirectory, `${prefix}-request.json`), `${JSON.stringify(request, null, 2)}\n`, "utf8");
  }));
  await writeFile(path.join(resolvedOutputDirectory, "validation.json"), `${JSON.stringify({
    config: { scope: config.scope, method: config.method },
    suppliedResponseCount: responseTexts.length,
    capturedRequestCount: captured.length,
    result,
    error,
  }, null, 2)}\n`, "utf8");

  if (error && !error.message.startsWith("MANUAL_AI_RESPONSE_REQUIRED:")) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
