"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export const PDF_EXPORT_SLIDE_WIDTH = 1600;
export const PDF_EXPORT_SLIDE_HEIGHT = 900;

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

export function pdfCaptureScale(size: { width: number; height: number }, devicePixelRatio = window.devicePixelRatio || 1) {
  const preferred = Math.max(2, devicePixelRatio, PDF_EXPORT_SLIDE_WIDTH / Math.max(1, size.width));
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

export async function exportSlidesToPDF(selector: string, filename: string) {
  const slides = document.querySelector(selector)?.querySelectorAll<HTMLElement>(".preview-slide-wrapper");
  if (!slides?.length) throw new Error("没有可导出的课件页面");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [297, 167.0625] });
  for (let index = 0; index < slides.length; index += 1) {
    const sourceRect = slides[index].getBoundingClientRect();
    const exportSlide = createPdfExportWrapper(slides[index]);
    document.body.append(exportSlide);
    try {
      await waitForSlideAssets(exportSlide);
      const canvas = await html2canvas(exportSlide, {
        scale: pdfCaptureScale(sourceRect),
        useCORS: true,
        allowTaint: false,
        imageTimeout: 15_000,
        backgroundColor: "#ffffff",
        logging: false,
        onclone: applyPdfColorCompatibility,
      });
      if (index > 0) pdf.addPage([297, 167.0625], "landscape");
      const imageData = canvas.toDataURL("image/png");
      pdf.addImage(imageData, "PNG", 0, 0, 297, 167.0625, undefined, "FAST");
      canvas.width = 0;
      canvas.height = 0;
    } finally {
      exportSlide.remove();
    }
  }
  const blob = pdf.output("blob");
  pdf.save(filename);
  return blob;
}
