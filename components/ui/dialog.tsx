"use client";

import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isFocusable(element: HTMLElement) {
  if (element.hasAttribute("disabled")) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;
  return element.tabIndex >= 0 || ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(element.tagName);
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  variant = "modal",
  size = "default",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  variant?: "modal" | "drawer";
  size?: "compact" | "default" | "medium-fit" | "medium" | "wide";
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
        .filter(isFocusable);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-modal">
      <button
        aria-hidden="true"
        tabIndex={-1}
        className="fixed inset-0 cursor-default bg-slate-950/45"
        onClick={onClose}
        type="button"
      />
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          "z-modal max-h-[calc(100dvh-2rem)] w-[min(94vw,760px)] overflow-hidden rounded-lg bg-card p-0 text-foreground shadow-lg animate-dialog-fade max-sm:inset-x-2 max-sm:bottom-2 max-sm:top-auto max-sm:max-h-[calc(100dvh-1rem)] max-sm:w-auto max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-xl",
          variant === "modal" && "fixed left-1/2 top-1/2 m-0 -translate-x-1/2 -translate-y-1/2",
          variant === "drawer" &&
            "fixed inset-y-0 right-0 m-0 h-dvh max-h-dvh w-[min(94vw,520px)] max-w-none rounded-none border-l border-border max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh",
          size === "compact" && variant === "modal" && "w-[min(92vw,560px)]",
          size === "medium-fit" && variant === "modal" && "w-[min(94vw,900px)]",
          size === "medium" &&
            variant === "modal" &&
            "h-[min(720px,calc(100dvh-2rem))] w-[min(94vw,900px)]",
          size === "wide" &&
            variant === "modal" &&
            "h-[min(760px,calc(100dvh-2rem))] w-[min(96vw,1080px)]",
        )}
        ref={dialogRef}
        role="dialog"
      >
        <div className="flex min-h-0 h-full flex-col">
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              {icon ? (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary ring-1 ring-primary-100">
                  {icon}
                </span>
              ) : null}
              <div className="min-w-0">
                <h2
                  className="text-lg font-semibold tracking-tight text-foreground"
                  id={titleId}
                >
                  {title}
                </h2>
                {description ? (
                  <p
                    className="mt-0.5 truncate text-sm text-muted-foreground"
                    id={descriptionId}
                  >
                    {description}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              aria-label="关闭"
              className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onClose}
              ref={closeButtonRef}
              type="button"
            >
              <X className="size-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
