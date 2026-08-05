"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

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
  size?: "default" | "wide";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-describedby={description ? `${title}-description` : undefined}
      aria-labelledby={`${title}-title`}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[min(94vw,760px)] overflow-hidden rounded-lg bg-card p-0 text-foreground shadow-lg backdrop:bg-slate-950/45",
        "open:animate-fade-in",
        variant === "drawer" &&
          "fixed inset-y-0 right-0 m-0 h-dvh max-h-dvh w-[min(94vw,520px)] max-w-none rounded-none border-l border-border",
        size === "wide" &&
          variant === "modal" &&
          "h-[min(760px,calc(100dvh-2rem))] w-[min(96vw,1080px)]",
      )}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      ref={ref}
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
                id={`${title}-title`}
              >
                {title}
              </h2>
              {description ? (
                <p
                  className="mt-0.5 truncate text-sm text-muted-foreground"
                  id={`${title}-description`}
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
            type="button"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
