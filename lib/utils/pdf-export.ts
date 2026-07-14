"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
          const clonedWrappers = clonedDoc.querySelectorAll<HTMLElement>(".preview-slide-wrapper");
          const clonedWrapper = clonedWrappers[wrapperIndex];
          if (!clonedWrapper) return;

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

  pdf.save(filename);
}
