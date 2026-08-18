"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
  style.textContent = ".preview-deck-pdf, .preview-deck-pdf * { animation: none !important; transition: none !important; }";
  targetDocument.head.append(style);
}

export function pdfCaptureScale(size: { width: number; height: number }, devicePixelRatio = window.devicePixelRatio || 1) {
  const preferred = Math.min(2, Math.max(1, devicePixelRatio));
  const pixels = Math.max(1, size.width * size.height);
  return Math.min(preferred, Math.sqrt(4_000_000 / pixels));
}

async function waitForSlideAssets(slide: HTMLElement) {
  await document.fonts?.ready;
  await Promise.all([...slide.querySelectorAll("img")].map(async (image) => {
    if (image.complete) return;
    await Promise.race([
      new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }),
      new Promise<void>((resolve) => window.setTimeout(resolve, 8_000)),
    ]);
  }));
}

function downloadPdf(pdf: jsPDF, blob: Blob, filename: string) {
  if (typeof URL.createObjectURL !== "function") {
    pdf.save(filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function exportSlidesToPDF(selector: string, filename: string) {
  const slides = document.querySelector(selector)?.querySelectorAll<HTMLElement>(".preview-slide-wrapper");
  if (!slides?.length) throw new Error("没有可导出的课件页面");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [297, 167.0625] });
  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index];
    await waitForSlideAssets(slide);
    const canvas = await html2canvas(slide, { scale: pdfCaptureScale(slide.getBoundingClientRect()), useCORS: true, allowTaint: false, imageTimeout: 15_000, backgroundColor: "#ffffff", logging: false, onclone: applyPdfColorCompatibility });
    if (index > 0) pdf.addPage([297, 167.0625], "landscape");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 297, 167.0625, undefined, "FAST");
    canvas.width = 0;
    canvas.height = 0;
  }
  const blob = pdf.output("blob");
  downloadPdf(pdf, blob, filename);
  return blob;
}
