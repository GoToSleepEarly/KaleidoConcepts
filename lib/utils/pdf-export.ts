"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const OKLCH_COLOR_RE = /oklch\(\s*([0-9.]+%?)\s+([0-9.]+%?)\s+([0-9.]+)(?:deg)?(?:\s*\/\s*([0-9.]+%?))?\s*\)/gi;
const PDF_COLOR_STYLE_PROPERTIES = [
  "background",
  "background-color",
  "background-image",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "box-shadow",
  "caret-color",
  "color",
  "fill",
  "outline-color",
  "stroke",
  "text-decoration-color",
  "text-shadow",
  "-webkit-tap-highlight-color",
];
const PDF_EXPORT_COLOR_COMPAT_STYLE_ATTR = "data-pdf-export-color-compat";

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function parseOklchNumber(value: string, scalePercent = true) {
  if (value.endsWith("%")) {
    const parsed = Number.parseFloat(value.slice(0, -1));
    return scalePercent ? parsed / 100 : parsed;
  }
  return Number.parseFloat(value);
}

function parseAlpha(value: string | undefined) {
  if (!value) return 1;
  return clamp(parseOklchNumber(value));
}

function linearSrgbToEncoded(value: number) {
  const clamped = clamp(value);
  if (clamped <= 0.0031308) return 12.92 * clamped;
  return 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function oklchToRgbString(lightness: string, chroma: string, hue: string, alpha?: string) {
  const l = parseOklchNumber(lightness);
  const c = parseOklchNumber(chroma);
  const h = (Number.parseFloat(hue) * Math.PI) / 180;
  const a = parseAlpha(alpha);

  const okA = c * Math.cos(h);
  const okB = c * Math.sin(h);

  const lPrime = l + 0.3963377774 * okA + 0.2158037573 * okB;
  const mPrime = l - 0.1055613458 * okA - 0.0638541728 * okB;
  const sPrime = l - 0.0894841775 * okA - 1.291485548 * okB;

  const lCube = lPrime ** 3;
  const mCube = mPrime ** 3;
  const sCube = sPrime ** 3;

  const red = Math.round(linearSrgbToEncoded(4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube) * 255);
  const green = Math.round(linearSrgbToEncoded(-1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube) * 255);
  const blue = Math.round(linearSrgbToEncoded(-0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube) * 255);

  if (a < 1) {
    return `rgba(${red}, ${green}, ${blue}, ${Number(a.toFixed(3))})`;
  }
  return `rgb(${red}, ${green}, ${blue})`;
}

function replaceUnsupportedColorFunctions(value: string) {
  return value.replace(OKLCH_COLOR_RE, (_match, lightness: string, chroma: string, hue: string, alpha?: string) =>
    oklchToRgbString(lightness, chroma, hue, alpha),
  );
}

export function sanitizeUnsupportedPdfColorFunctions(root: Element): void {
  const elements = [root, ...Array.from(root.querySelectorAll("*"))] as HTMLElement[];

  for (const element of elements) {
    const style = element.getAttribute("style");
    if (style?.includes("oklch(")) {
      element.setAttribute("style", replaceUnsupportedColorFunctions(style));
    }

    const computedStyle = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (!computedStyle) continue;

    for (const property of PDF_COLOR_STYLE_PROPERTIES) {
      const value = computedStyle.getPropertyValue(property);
      if (!value.includes("oklch(")) continue;
      element.style.setProperty(
        property,
        replaceUnsupportedColorFunctions(value),
        computedStyle.getPropertyPriority(property),
      );
    }
  }
}

export function sanitizeUnsupportedPdfColorStylesheets(doc: Document): void {
  for (const styleElement of Array.from(doc.querySelectorAll("style"))) {
    const cssText = styleElement.textContent;
    if (cssText?.includes("oklch(")) {
      styleElement.textContent = replaceUnsupportedColorFunctions(cssText);
    }
  }
}

function collectRootOklchCustomProperties(doc: Document) {
  const rootStyle = doc.defaultView?.getComputedStyle(doc.documentElement);
  if (!rootStyle) return "";

  const declarations: string[] = [];
  for (let i = 0; i < rootStyle.length; i++) {
    const property = rootStyle.item(i);
    if (!property.startsWith("--")) continue;

    const value = rootStyle.getPropertyValue(property).trim();
    if (!value.includes("oklch(")) continue;

    declarations.push(`${property}: ${replaceUnsupportedColorFunctions(value)};`);
  }

  return declarations.join("\n");
}

export function installPdfExportColorCompatibilityStyles(doc: Document): () => void {
  const existing = doc.querySelector(`style[${PDF_EXPORT_COLOR_COMPAT_STYLE_ATTR}]`);
  existing?.remove();

  const rootDeclarations = collectRootOklchCustomProperties(doc);
  const styleElement = doc.createElement("style");
  styleElement.setAttribute(PDF_EXPORT_COLOR_COMPAT_STYLE_ATTR, "true");
  styleElement.textContent = `
    :root {
      ${rootDeclarations}
    }
    html, body {
      background-color: var(--background, #ffffff) !important;
      color: var(--foreground, #111827) !important;
    }
  `;
  doc.head.appendChild(styleElement);

  return () => {
    styleElement.remove();
  };
}

async function renderImageToFit(
  src: string,
  targetWidth: number,
  targetHeight: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const tw = targetWidth;
      const th = targetHeight;

      const scale = Math.max(tw / iw, th / ih);
      const sw = iw * scale;
      const sh = ih * scale;
      const sx = (tw - sw) / 2;
      const sy = (th - sh) / 2;

      ctx.drawImage(img, sx, sy, sw, sh);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export async function exportSlidesToPDF(
  slidesContainerSelector: string,
  filename: string = "course-slides.pdf",
): Promise<void> {
  const container = document.querySelector(slidesContainerSelector);
  if (!container) {
    throw new Error("Slides container not found");
  }

  const slideWrappers = container.querySelectorAll<HTMLElement>(".preview-slide-wrapper");
  if (slideWrappers.length === 0) {
    throw new Error("No slides found");
  }

  const firstSlide = slideWrappers[0];
  const rect = firstSlide.getBoundingClientRect();
  const slideWidth = rect.width;
  const slideHeight = rect.height;
  const aspectRatio = slideWidth / slideHeight;

  const pdfWidth = 297;
  const pdfHeight = pdfWidth / aspectRatio;

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [pdfWidth, pdfHeight],
  });

  const cleanupColorCompatibilityStyles = installPdfExportColorCompatibilityStyles(document);

  try {
    for (let i = 0; i < slideWrappers.length; i++) {
      const wrapper = slideWrappers[i];
      const wrapperIndex = i;

      const origMargin = wrapper.style.margin;
      const origBorderRadius = wrapper.style.borderRadius;
      const origBoxShadow = wrapper.style.boxShadow;

      const wrapperRect = wrapper.getBoundingClientRect();

      const imgInfos: Array<{
        dataUrl: string;
        left: number;
        top: number;
        width: number;
        height: number;
      }> = [];

      const imgs = wrapper.querySelectorAll("img");
      for (const img of imgs) {
        if (!img.src) continue;
        try {
          const r = img.getBoundingClientRect();
          const dataUrl = await renderImageToFit(img.src, r.width, r.height);
          imgInfos.push({
            dataUrl,
            left: r.left - wrapperRect.left,
            top: r.top - wrapperRect.top,
            width: r.width,
            height: r.height,
          });
        } catch {
          // 图片加载失败，跳过
        }
      }

      try {
        wrapper.style.margin = "0";
        wrapper.style.borderRadius = "0";
        wrapper.style.boxShadow = "none";

        const canvas = await html2canvas(wrapper, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          logging: false,
          onclone: (clonedDoc) => {
            sanitizeUnsupportedPdfColorStylesheets(clonedDoc);

            const clonedWrappers = clonedDoc.querySelectorAll<HTMLElement>(".preview-slide-wrapper");
            const clonedWrapper = clonedWrappers[wrapperIndex];
            if (!clonedWrapper) return;

            sanitizeUnsupportedPdfColorFunctions(clonedWrapper);

            const clonedImgs = clonedWrapper.querySelectorAll("img");
            const clonedImgArr = Array.from(clonedImgs);

            for (let j = 0; j < Math.min(imgInfos.length, clonedImgArr.length); j++) {
              const info = imgInfos[j];
              const clonedImg = clonedImgArr[j];
              const parent = clonedImg.parentElement;
              if (!parent) continue;

              parent.innerHTML = "";

              const plainImg = clonedDoc.createElement("img");
              plainImg.src = info.dataUrl;
              plainImg.style.position = "absolute";
              plainImg.style.left = `${info.left}px`;
              plainImg.style.top = `${info.top}px`;
              plainImg.style.width = `${info.width}px`;
              plainImg.style.height = `${info.height}px`;
              parent.appendChild(plainImg);
            }
          },
        });

        const imgData = canvas.toDataURL("image/png");

        if (i > 0) {
          pdf.addPage([pdfWidth, pdfHeight], "landscape");
        }

        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height / canvas.width) * pdfWidth;
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      } finally {
        wrapper.style.margin = origMargin;
        wrapper.style.borderRadius = origBorderRadius;
        wrapper.style.boxShadow = origBoxShadow;
      }
    }
  } finally {
    cleanupColorCompatibilityStyles();
  }

  pdf.save(filename);
}
