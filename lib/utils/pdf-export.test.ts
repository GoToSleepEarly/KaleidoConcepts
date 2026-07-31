import { describe, expect, test } from "vitest";

import {
  installPdfExportColorCompatibilityStyles,
  sanitizeUnsupportedPdfColorFunctions,
  sanitizeUnsupportedPdfColorStylesheets,
} from "./pdf-export";

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
});
