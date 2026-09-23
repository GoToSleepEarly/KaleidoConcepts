/** @vitest-environment node */

import { createServer, type IncomingMessage } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { createCourseImageProvider } from "./course-image-provider";

const servers: ReturnType<typeof createServer>[] = [];

async function requestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("course image provider transport", () => {
  test("uses a compatible custom dispatcher for image requests", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Connection": "close", "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ url: "https://example.com/image.webp" }] }));
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试服务器没有可用端口");

    const result = await createCourseImageProvider({ apiKey: "test-key", baseUrl: `http://127.0.0.1:${address.port}`, model: "test-model", timeoutMs: 1_000 }).generate({ prompt: "测试请求", quality: "medium" });
    expect(result.imageUrl).toBe("https://example.com/image.webp");
  });

  test("serializes course image edits as real multipart with model and reference images", async () => {
    let receivedContentType = "";
    let receivedBody = Buffer.alloc(0);
    const server = createServer(async (request, response) => {
      receivedContentType = request.headers["content-type"] ?? "";
      receivedBody = await requestBody(request);
      response.writeHead(200, { "Connection": "close", "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ url: "https://example.com/edited.webp" }] }));
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试服务器没有可用端口");

    const result = await createCourseImageProvider({ apiKey: "test-key", baseUrl: `http://127.0.0.1:${address.port}`, model: "gpt-image-2", timeoutMs: 1_000 }).edit({
      prompt: "把门改成绿色",
      quality: "medium",
      imageDataUrls: ["data:image/png;base64,aGVsbG8=", "data:image/png;base64,d29ybGQ="],
    });

    const body = receivedBody.toString("utf8");
    expect(result.imageUrl).toBe("https://example.com/edited.webp");
    expect(receivedContentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(body).toContain('name="model"\r\n\r\ngpt-image-2');
    expect(body.match(/name="image\[\]"/g)).toHaveLength(2);
    expect(body).toContain('name="prompt"\r\n\r\n把门改成绿色');
    expect(body).not.toBe("[object FormData]");
  });
});
