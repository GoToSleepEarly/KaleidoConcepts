"use client";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function exportSlidesToPDF(selector: string, filename: string) {
  const slides = document.querySelector(selector)?.querySelectorAll<HTMLElement>(".preview-slide-wrapper");
  if (!slides?.length) throw new Error("没有可导出的课件页面");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [297, 167.0625] });
  for (let index = 0; index < slides.length; index += 1) {
    const canvas = await html2canvas(slides[index], { scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff", logging: false });
    if (index > 0) pdf.addPage([297, 167.0625], "landscape");
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 297, 167.0625);
  }
  pdf.save(filename);
}
