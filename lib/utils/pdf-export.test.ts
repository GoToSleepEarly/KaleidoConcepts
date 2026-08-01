import html2canvas from "html2canvas";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  PDF_EXPORT_SLIDE_HEIGHT,
  PDF_EXPORT_SLIDE_WIDTH,
  createFixedSizePdfExportWrapper,
  exportSlidesToPDF,
  installPdfExportColorCompatibilityStyles,
  resolvePdfExportScale,
  sanitizeUnsupportedPdfColorFunctions,
  sanitizeUnsupportedPdfColorStylesheets,
} from "./pdf-export";

vi.mock("html2canvas", () => ({
  default: vi.fn(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    return canvas;
  }),
}));

vi.mock("jspdf", () => ({
  default: vi.fn().mockImplementation(() => ({
    addImage: vi.fn(),
    addPage: vi.fn(),
    save: vi.fn(),
  })),
}));

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("sanitizeUnsupportedPdfColorFunctions", () => {
  test("replaces oklch colors before html2canvas parses cloned slide styles", () => {
    document.body.innerHTML = `
      <div id="slide" style="color: oklch(0.18 0.02 260); background: linear-gradient(135deg, oklch(0.58 0.2 280), rgb(255, 255, 255)); box-shadow: 0 1px 2px oklch(0.1 0.02 260 / 0.05);">
        <span style="border-color: oklch(0.92 0.008 260); --shadow: 0 1px 2px oklch(0.1 0.02 260 / 0.05);">PDF</span>
      </div>
    `;

    const slide = document.getElementById("slide");
    expect(slide).not.toBeNull();

    sanitizeUnsupportedPdfColorFunctions(slide!);

    expect(slide!.getAttribute("style")).not.toContain("oklch(");
    expect(slide!.querySelector("span")!.getAttribute("style")).not.toContain("oklch(");
    expect(slide!.getAttribute("style")).toContain("rgb(");
    expect(slide!.querySelector("span")!.getAttribute("style")).toContain("rgba(");
  });

  test("copies computed oklch class styles into safe inline colors", () => {
    const style = document.createElement("style");
    style.textContent = `
      .pdf-card {
        color: oklch(0.18 0.02 260);
        border-color: oklch(0.92 0.008 260);
      }
    `;
    document.head.appendChild(style);
    document.body.innerHTML = `<div id="slide"><span class="pdf-card">PDF</span></div>`;

    const slide = document.getElementById("slide");
    const card = slide!.querySelector("span")!;

    sanitizeUnsupportedPdfColorFunctions(slide!);

    expect(card.getAttribute("style")).not.toContain("oklch(");
    expect(card.getAttribute("style")).toContain("color: rgb(");
    expect(card.getAttribute("style")).toContain("border");
  });

  test("replaces oklch colors in cloned document stylesheets", () => {
    const style = document.createElement("style");
    style.textContent = `
      :root { --background: oklch(0.985 0.002 260); }
      .pdf-card {
        background: linear-gradient(90deg, var(--background), oklch(0.94 0.005 260));
        box-shadow: 0 1px 2px oklch(0.1 0.02 260 / 0.05);
      }
    `;
    document.head.appendChild(style);

    sanitizeUnsupportedPdfColorStylesheets(document);

    expect(style.textContent).not.toContain("oklch(");
    expect(style.textContent).toContain("rgb(");
    expect(style.textContent).toContain("rgba(");
  });

  test("temporarily overrides theme tokens so html2canvas sees rgb root and body colors before cloning", () => {
    const style = document.createElement("style");
    style.textContent = `
      :root { --background: oklch(0.985 0.002 260); --foreground: oklch(0.18 0.02 260); }
      body { background: var(--background); color: var(--foreground); }
    `;
    document.head.appendChild(style);

    const cleanup = installPdfExportColorCompatibilityStyles(document);

    expect(getComputedStyle(document.documentElement).backgroundColor).not.toContain("oklch(");
    expect(getComputedStyle(document.body).backgroundColor).not.toContain("oklch(");
    expect(getComputedStyle(document.body).color).not.toContain("oklch(");

    cleanup();

    expect(document.querySelector("style[data-pdf-export-color-compat]")).toBeNull();
  });

  test("creates an offscreen fixed-size slide wrapper independent of responsive viewport size", () => {
    document.body.innerHTML = `
      <div class="preview-slide-wrapper" style="width: 360px; height: 202.5px;">
        <div class="preview-slide">Slide</div>
      </div>
    `;
    const source = document.querySelector<HTMLElement>(".preview-slide-wrapper");
    expect(source).not.toBeNull();

    const exportWrapper = createFixedSizePdfExportWrapper(source!);

    expect(exportWrapper).not.toBe(source);
    expect(exportWrapper.style.width).toBe(`${PDF_EXPORT_SLIDE_WIDTH}px`);
    expect(exportWrapper.style.height).toBe(`${PDF_EXPORT_SLIDE_HEIGHT}px`);
    expect(exportWrapper.style.position).toBe("fixed");
    expect(exportWrapper.style.left).toBe("-10000px");
    expect(exportWrapper.querySelector(".preview-slide")).not.toBeNull();
  });

  test("caps export scale so mobile Safari does not exceed the canvas pixel budget", () => {
    const scale = resolvePdfExportScale(1600, 900, 2);

    expect(scale).toBeLessThan(2);
    expect(1600 * 900 * scale * scale).toBeLessThanOrEqual(3_500_000);
  });

  test("exports from fixed-size offscreen wrappers instead of responsive onscreen slide dimensions", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,test");
    document.body.innerHTML = `
      <div class="preview-deck-pdf">
        <div class="preview-slide-wrapper" style="width: 360px; height: 202.5px;">
          <div class="preview-slide">Slide</div>
        </div>
      </div>
    `;

    await exportSlidesToPDF(".preview-deck-pdf", "mobile-safe.pdf");

    const mockedHtml2canvas = vi.mocked(html2canvas);
    const [element, options] = mockedHtml2canvas.mock.calls[0];

    expect(element).toBeInstanceOf(HTMLElement);
    expect((element as HTMLElement).style.width).toBe(`${PDF_EXPORT_SLIDE_WIDTH}px`);
    expect((element as HTMLElement).style.height).toBe(`${PDF_EXPORT_SLIDE_HEIGHT}px`);
    expect(options?.scale).toBe(resolvePdfExportScale(PDF_EXPORT_SLIDE_WIDTH, PDF_EXPORT_SLIDE_HEIGHT));
    expect(document.querySelector('body > .preview-slide-wrapper[style*="-10000px"]')).toBeNull();
  });
});
