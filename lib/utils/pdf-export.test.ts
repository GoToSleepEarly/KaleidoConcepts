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

import {
  applyPdfColorCompatibility,
  createPdfExportWrapper,
  exportSlidesToPDF,
  pdfCaptureScale,
} from "@/lib/utils/pdf-export";

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
    expect(pdfCaptureScale({ width: 400, height: 225 }, 2)).toBe(4);
  });

  test("keeps the rendered HTML layout size and only isolates it for export", () => {
    const source = document.createElement("div");
    source.className = "preview-slide-wrapper";
    source.style.width = "640px";
    source.style.height = "360px";
    source.innerHTML = '<div class="preview-slide"></div>';
    Object.defineProperty(source, "getBoundingClientRect", { value: () => ({ width: 640, height: 360 }) });

    const exported = createPdfExportWrapper(source);

    expect(exported).not.toBe(source);
    expect(source.dataset.pdfExportSlide).toBeUndefined();
    expect(exported.dataset.pdfExportSlide).toBe("true");
    expect(exported.style.width).toBe("640px");
    expect(exported.style.height).toBe("360px");
    expect(exported.querySelector<HTMLElement>(".preview-slide")?.style.width).toBe("100%");
    expect(exported.querySelector<HTMLElement>(".preview-slide")?.style.height).toBe("100%");
    expect(source.style.width).toBe("640px");
    expect(source.querySelector<HTMLElement>(".preview-slide")?.style.width).toBe("");
  });

  test("captures without tainting the canvas and releases each page", async () => {
    const deck = document.createElement("div");
    deck.className = "deck";
    const slide = document.createElement("div");
    slide.className = "preview-slide-wrapper";
    slide.innerHTML = '<div class="preview-slide"><div class="slide-text-box-inner"><div class="slide-text-content" style="--auto-fit-scale: 1.55"><p>Bottom line</p></div></div></div>';
    Object.defineProperty(slide, "getBoundingClientRect", { value: () => ({ width: 800, height: 450 }) });
    deck.append(slide);
    document.body.append(deck);
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    canvas.toDataURL = vi.fn(() => "data:image/png;base64,test");
    html2canvas.mockResolvedValue(canvas);
    await exportSlidesToPDF(".deck", "lesson.pdf");

    const [capturedElement, captureOptions] = html2canvas.mock.calls[0];
    const capturedSlide = capturedElement as HTMLElement;
    expect(capturedSlide).not.toBe(slide);
    expect(capturedSlide.style.width).toBe("800px");
    expect(capturedSlide.style.height).toBe("450px");
    expect(capturedSlide.querySelector<HTMLElement>(".slide-text-box-inner")?.style.boxShadow).toBe("none");
    expect(capturedSlide.querySelector<HTMLElement>(".slide-text-box-inner")?.style.overflow).toBe("");
    expect(Number(capturedSlide.querySelector<HTMLElement>(".slide-text-content")?.style.getPropertyValue("--auto-fit-scale"))).toBeCloseTo(1.488);
    expect(capturedSlide.querySelector<HTMLElement>(".slide-text-content")?.style.overflow).toBe("");
    expect(capturedSlide.querySelector<HTMLElement>(".slide-text-content")?.style.paddingBottom).toBe("0.25em");
    expect(slide.querySelector<HTMLElement>(".slide-text-box-inner")?.style.boxShadow).toBe("");
    expect(slide.querySelector<HTMLElement>(".slide-text-box-inner")?.style.overflow).toBe("");
    expect(captureOptions).toEqual(expect.objectContaining({ useCORS: true, allowTaint: false, onclone: expect.any(Function) }));
    expect(addImage).toHaveBeenCalledWith(expect.any(String), "PNG", 0, 0, 297, 167.0625, undefined, "FAST");
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(output).toHaveBeenCalledWith("blob");
    expect(save).toHaveBeenCalledWith("lesson.pdf");
  });
});
