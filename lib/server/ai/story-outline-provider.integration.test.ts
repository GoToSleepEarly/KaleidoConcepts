/** @vitest-environment node */

import { createServer } from "node:http";

import { afterEach, describe, expect, test } from "vitest";

import { createStoryOutlineProvider } from "./story-outline-provider";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("story outline provider transport", () => {
  test("uses a fetch implementation compatible with its custom dispatcher", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Connection": "close", "Content-Type": "application/json" });
      response.end(JSON.stringify({ output_text: "{\"ok\":true}" }));
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试服务器没有可用端口");

    const result = await createStoryOutlineProvider({
      apiKey: "test-key",
      baseUrl: `http://127.0.0.1:${address.port}`,
      gptModel: "test-model",
      researchModel: "test-model",
      timeoutMs: 1_000,
    }).generateOutline({
      writingProvider: "quickrouter_gpt",
      prompt: "测试请求",
    });

    expect(result.text).toBe("{\"ok\":true}");
  });
});
