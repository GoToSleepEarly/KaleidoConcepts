import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { addImage, addPage, output, save, html2canvas } = vi.hoisted(() => ({
  addImage: vi.fn(),
  addPage: vi.fn(),
  output: vi.fn(() => new Blob(["pdf"], { type: "application/pdf" })),
  save: vi.fn(),
  html2canvas: vi.fn(),
}));

vi.mock("html2canvas", () => ({ default: html2canvas }));
vi.mock("jspdf", () => ({ default: vi.fn(() => ({ addImage, addPage, output, save })) }));

import { applyPdfColorCompatibility, exportSlidesToPDF, pdfCaptureScale } from "@/lib/utils/pdf-export";

describe("PDF export", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  test("overrides modern color tokens with html2canvas-compatible rgb values", () => {
    applyPdfColorCompatibility(document);
    expect(document.documentElement.style.getPropertyValue("--primary")).toMatch(/^rgb\(/);
    expect(document.documentElement.style.getPropertyValue("--shadow")).not.toContain("oklch");
  });

  test("global styles do not contain color functions unsupported by html2canvas", () => {
    const globalStyles = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(globalStyles).not.toMatch(/\b(?:oklch|oklab|lab|lch|color)\s*\(/i);
  });

  test("limits capture pixels on small-memory device layouts", () => {
    expect(pdfCaptureScale({ width: 1600, height: 900 }, 3)).toBeLessThan(2);
    expect(pdfCaptureScale({ width: 800, height: 450 }, 2)).toBe(2);
  });

  test("captures without tainting the canvas and releases each page", async () => {
    const deck = document.createElement("div");
    deck.className = "deck";
    const slide = document.createElement("div");
    slide.className = "preview-slide-wrapper";
    Object.defineProperty(slide, "getBoundingClientRect", { value: () => ({ width: 800, height: 450 }) });
    deck.append(slide);
    document.body.append(deck);
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    canvas.toDataURL = vi.fn(() => "data:image/jpeg;base64,test");
    html2canvas.mockResolvedValue(canvas);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    await exportSlidesToPDF(".deck", "lesson.pdf");

    expect(html2canvas).toHaveBeenCalledWith(slide, expect.objectContaining({ useCORS: true, allowTaint: false, onclone: expect.any(Function) }));
    expect(addImage).toHaveBeenCalledWith(expect.any(String), "JPEG", 0, 0, 297, 167.0625, undefined, "FAST");
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(output).toHaveBeenCalledWith("blob");
    expect(save).not.toHaveBeenCalled();
  });
});
