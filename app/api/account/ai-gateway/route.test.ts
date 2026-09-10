import { beforeEach, describe, expect, test, vi } from "vitest";

import { GET, PATCH } from "./route";

const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/db", () => ({
  getDb: vi.fn(() => ({ user: { findUnique, update } })),
}));

describe("account AI gateway route", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  test("GET reads the current gateway from the authenticated user's database row", async () => {
    findUnique.mockResolvedValue({
      id: "user-1",
      writingProvider: "deepseek-chat",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2-c",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "main",
    });
    const response = await GET(
      new Request("http://localhost/api/account/ai-gateway", {
        headers: { cookie: "kaleido.user-id=user-1" },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      writingProvider: "deepseek-chat",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2-c",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "main",
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  test("PATCH updates the database without storing the gateway in a cookie", async () => {
    findUnique.mockResolvedValue({
      id: "user-1",
      writingProvider: "gpt-5.6-sol",
      aiGateway: "quickrouter",
      quickRouterEndpoint: "main",
      imageModel: "gpt-image-2",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "main",
    });
    update.mockResolvedValue({
      id: "user-1",
      writingProvider: "deepseek-chat",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2-c",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "direct",
    });
    const response = await PATCH(
      new Request("http://localhost/api/account/ai-gateway", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: "kaleido.user-id=user-1",
        },
        body: JSON.stringify({
          writingProvider: "deepseek-chat",
          aiGateway: "crazyrouter",
          quickRouterEndpoint: "direct",
          imageModel: "gpt-image-2-c",
          imageGateway: "quickrouter",
          imageQuickRouterEndpoint: "direct",
        }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      writingProvider: "deepseek-chat",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2-c",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "direct",
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        writingProvider: "deepseek-chat",
        aiGateway: "crazyrouter",
        quickRouterEndpoint: "direct",
        imageModel: "gpt-image-2-c",
        imageGateway: "quickrouter",
        imageQuickRouterEndpoint: "direct",
      },
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("PATCH preserves the endpoint for a cached client that only sends the gateway", async () => {
    findUnique.mockResolvedValue({
      id: "user-1",
      writingProvider: "deepseek-chat",
      aiGateway: "quickrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2",
      imageGateway: "crazyrouter",
      imageQuickRouterEndpoint: "main",
    });
    update.mockResolvedValue({
      id: "user-1",
      writingProvider: "deepseek-chat",
      aiGateway: "crazyrouter",
      quickRouterEndpoint: "direct",
      imageModel: "gpt-image-2",
      imageGateway: "crazyrouter",
      imageQuickRouterEndpoint: "main",
    });

    const response = await PATCH(
      new Request("http://localhost/api/account/ai-gateway", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: "kaleido.user-id=user-1",
        },
        body: JSON.stringify({ aiGateway: "crazyrouter" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        writingProvider: "deepseek-chat",
        aiGateway: "crazyrouter",
        quickRouterEndpoint: "direct",
        imageModel: "gpt-image-2",
        imageGateway: "crazyrouter",
        imageQuickRouterEndpoint: "main",
      },
    });
  });

  test("PATCH rejects an image model and gateway combination that is not preset", async () => {
    findUnique.mockResolvedValue({
      id: "user-1",
      writingProvider: "gpt-5.6-sol",
      aiGateway: "quickrouter",
      quickRouterEndpoint: "main",
      imageModel: "gpt-image-2",
      imageGateway: "quickrouter",
      imageQuickRouterEndpoint: "main",
    });

    const response = await PATCH(
      new Request("http://localhost/api/account/ai-gateway", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: "kaleido.user-id=user-1",
        },
        body: JSON.stringify({
          aiGateway: "quickrouter",
          imageModel: "gpt-image-2-c",
          imageGateway: "crazyrouter",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  test("PATCH accepts Easy88AI for the standard image model", async () => {
    findUnique.mockResolvedValue({ id: "user-1", writingProvider: "gpt-5.6-sol", aiGateway: "easy88ai", quickRouterEndpoint: "main", imageModel: "gpt-image-2", imageGateway: "quickrouter", imageQuickRouterEndpoint: "main" });
    update.mockResolvedValue({ id: "user-1", writingProvider: "gpt-5.6-sol", aiGateway: "easy88ai", quickRouterEndpoint: "main", imageModel: "gpt-image-2", imageGateway: "easy88ai", imageQuickRouterEndpoint: "main" });

    const response = await PATCH(
      new Request("http://localhost/api/account/ai-gateway", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: "kaleido.user-id=user-1" },
        body: JSON.stringify({ aiGateway: "easy88ai", imageModel: "gpt-image-2", imageGateway: "easy88ai" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ imageModel: "gpt-image-2", imageGateway: "easy88ai" }) }));
  });
});
