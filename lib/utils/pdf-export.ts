"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export const PDF_EXPORT_SLIDE_WIDTH = 1600;
export const PDF_EXPORT_SLIDE_HEIGHT = 900;

export type PdfExportProgress = {
  phase: "preparing" | "rendering" | "assembling" | "complete";
  completedPages: number;
  totalPages: number;
  currentPage?: number;
};

export type PdfExportOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: PdfExportProgress) => void;
};

const pdfColorTokens: Record<string, string> = {
  "--background": "rgb(250 250 251)", "--foreground": "rgb(38 39 48)",
  "--card": "rgb(255 255 255)", "--card-foreground": "rgb(38 39 48)",
  "--popover": "rgb(255 255 255)", "--popover-foreground": "rgb(38 39 48)",
  "--primary": "rgb(112 80 207)", "--primary-foreground": "rgb(253 253 253)",
  "--primary-50": "rgb(247 243 255)", "--primary-100": "rgb(238 230 255)",
  "--primary-200": "rgb(215 199 251)", "--primary-300": "rgb(183 153 241)",
  "--primary-400": "rgb(148 112 226)", "--primary-600": "rgb(96 65 180)", "--primary-700": "rgb(80 55 151)",
  "--secondary": "rgb(244 244 246)", "--secondary-foreground": "rgb(55 56 66)",
  "--muted": "rgb(246 246 247)", "--muted-foreground": "rgb(112 113 122)",
  "--accent": "rgb(244 244 246)", "--accent-foreground": "rgb(55 56 66)",
  "--destructive": "rgb(214 64 62)", "--destructive-foreground": "rgb(253 253 253)",
  "--success": "rgb(56 157 91)", "--success-foreground": "rgb(253 253 253)", "--success-50": "rgb(239 251 243)",
  "--warning": "rgb(201 142 44)", "--warning-foreground": "rgb(65 49 22)", "--warning-50": "rgb(254 248 232)",
  "--info": "rgb(54 142 196)", "--info-foreground": "rgb(253 253 253)", "--info-50": "rgb(238 248 253)",
  "--border": "rgb(229 229 233)", "--input": "rgb(229 229 233)", "--ring": "rgb(112 80 207)",
  "--shadow-sm": "0 1px 2px 0 rgb(19 20 26 / 0.05)",
  "--shadow": "0 1px 3px 0 rgb(19 20 26 / 0.08), 0 1px 2px -1px rgb(19 20 26 / 0.05)",
  "--shadow-md": "0 4px 6px -1px rgb(19 20 26 / 0.08), 0 2px 4px -2px rgb(19 20 26 / 0.05)",
  "--shadow-lg": "0 10px 15px -3px rgb(19 20 26 / 0.08), 0 4px 6px -4px rgb(19 20 26 / 0.05)",
};

export function applyPdfColorCompatibility(targetDocument: Document) {
  for (const [name, value] of Object.entries(pdfColorTokens)) targetDocument.documentElement.style.setProperty(name, value);
  const style = targetDocument.createElement("style");
  style.textContent = `
    [data-pdf-export-slide], [data-pdf-export-slide] * {
      animation: none !important;
      caret-color: transparent !important;
      transition: none !important;
    }
  `;
  targetDocument.head.append(style);
}

export function pdfCaptureScale(size: { width: number; height: number }) {
  const preferred = Math.min(
    PDF_EXPORT_SLIDE_WIDTH / Math.max(1, size.width),
    PDF_EXPORT_SLIDE_HEIGHT / Math.max(1, size.height),
  );
  const pixels = Math.max(1, size.width * size.height);
  return Math.min(preferred, Math.sqrt(4_000_000 / pixels));
}

export function createPdfExportWrapper(sourceWrapper: HTMLElement) {
  const sourceRect = sourceWrapper.getBoundingClientRect();
  const exportWrapper = sourceWrapper.cloneNode(true) as HTMLElement;
  exportWrapper.dataset.pdfExportSlide = "true";
  exportWrapper.style.position = "fixed";
  exportWrapper.style.left = "-10000px";
  exportWrapper.style.top = "0";
  exportWrapper.style.width = `${sourceRect.width}px`;
  exportWrapper.style.height = `${sourceRect.height}px`;
  exportWrapper.style.margin = "0";
  exportWrapper.style.borderRadius = "0";
  exportWrapper.style.boxShadow = "none";
  exportWrapper.style.overflow = "hidden";
  exportWrapper.style.pointerEvents = "none";
  exportWrapper.style.zIndex = "-1";

  const slide = exportWrapper.querySelector<HTMLElement>(".preview-slide");
  if (slide) {
    slide.style.width = "100%";
    slide.style.height = "100%";
    slide.style.borderRadius = "0";
    slide.style.boxShadow = "none";
  }
  for (const textBox of exportWrapper.querySelectorAll<HTMLElement>(".slide-text-box-inner")) {
    textBox.style.boxShadow = "none";
  }
  for (const textContent of exportWrapper.querySelectorAll<HTMLElement>(".slide-text-content")) {
    const fittedScale = Number.parseFloat(textContent.style.getPropertyValue("--auto-fit-scale")) || 1;
    textContent.style.setProperty("--auto-fit-scale", String(Math.max(0.58, fittedScale * 0.96)));
    textContent.style.paddingBottom = "0.25em";
  }
  return exportWrapper;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("PDF 导出已取消", "AbortError");
}

async function waitForSlideAssets(slides: HTMLElement[], signal?: AbortSignal) {
  await document.fonts?.ready;
  throwIfAborted(signal);
  const images = slides.flatMap((slide) => [...slide.querySelectorAll("img")]);
  await Promise.all(images.map(async (image) => {
    if (image.complete) return;
    await Promise.race([
      new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }),
      new Promise<void>((resolve) => window.setTimeout(resolve, 8_000)),
    ]);
  }));
  throwIfAborted(signal);
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else window.setTimeout(resolve, 0);
  });
}

async function canvasToJpeg(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PDF 页面压缩失败")), "image/jpeg", 0.92);
  });
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("PDF 页面读取失败"));
    reader.readAsArrayBuffer(blob);
  });
  return new Uint8Array(buffer);
}

export async function exportSlidesToPDF(selector: string, filename: string, options: PdfExportOptions = {}) {
  const slides = [...(document.querySelector(selector)?.querySelectorAll<HTMLElement>(".preview-slide-wrapper") ?? [])];
  if (!slides.length) throw new Error("没有可导出的课件页面");
  const totalPages = slides.length;
  options.onProgress?.({ phase: "preparing", completedPages: 0, totalPages });
  throwIfAborted(options.signal);
  await yieldToBrowser();
  await waitForSlideAssets(slides, options.signal);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [297, 167.0625] });
  for (let index = 0; index < slides.length; index += 1) {
    throwIfAborted(options.signal);
    options.onProgress?.({ phase: "rendering", currentPage: index + 1, completedPages: index, totalPages });
    await yieldToBrowser();
    const sourceRect = slides[index].getBoundingClientRect();
    const exportSlide = createPdfExportWrapper(slides[index]);
    document.body.append(exportSlide);
    try {
      const canvas = await html2canvas(exportSlide, {
        scale: pdfCaptureScale(sourceRect),
        useCORS: true,
        allowTaint: false,
        imageTimeout: 15_000,
        backgroundColor: "#ffffff",
        logging: false,
        onclone: applyPdfColorCompatibility,
      });
      try {
        throwIfAborted(options.signal);
        const imageData = await canvasToJpeg(canvas);
        throwIfAborted(options.signal);
        if (index > 0) pdf.addPage([297, 167.0625], "landscape");
        pdf.addImage(imageData, "JPEG", 0, 0, 297, 167.0625, undefined, "FAST");
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    } finally {
      exportSlide.remove();
    }
    options.onProgress?.({ phase: "rendering", currentPage: index + 1, completedPages: index + 1, totalPages });
  }
  throwIfAborted(options.signal);
  options.onProgress?.({ phase: "assembling", completedPages: totalPages, totalPages });
  await yieldToBrowser();
  throwIfAborted(options.signal);
  pdf.save(filename);
  options.onProgress?.({ phase: "complete", completedPages: totalPages, totalPages });
  return { pageCount: totalPages };
}
