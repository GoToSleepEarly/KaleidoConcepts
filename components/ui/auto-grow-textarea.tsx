"use client";

import React, { forwardRef, useCallback, useLayoutEffect, useRef } from "react";

function resizeToContent(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight);
  const nextHeight = Number.isFinite(maxHeight) ? Math.min(textarea.scrollHeight, maxHeight) : textarea.scrollHeight;
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = Number.isFinite(maxHeight) && textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function AutoGrowTextarea(
  { onInput, rows = 1, value, ...props },
  forwardedRef,
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback((node: HTMLTextAreaElement | null) => {
    localRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);

  useLayoutEffect(() => {
    resizeToContent(localRef.current);
  }, [value]);

  return (
    <textarea
      {...props}
      onInput={(event) => {
        resizeToContent(event.currentTarget);
        onInput?.(event);
      }}
      ref={setRef}
      rows={rows}
      value={value}
    />
  );
});
