"use client";

type Props = {
  currentSlide: number;
  totalSlides: number;
  onPrevious: () => void;
  onNext: () => void;
  onReset: () => void;
  onFullscreen?: () => void;
  showFullscreenButton?: boolean;
  variant?: "editor" | "presenter";
  extraActions?: React.ReactNode;
};

export function PresentationControls({
  currentSlide,
  totalSlides,
  onPrevious,
  onNext,
  onReset,
  onFullscreen,
  showFullscreenButton,
  variant = "presenter",
  extraActions,
}: Props) {
  const isPresenter = variant === "presenter";

  const base =
    "flex items-center gap-3 px-4 py-2 rounded-full shadow-lg transition-opacity duration-300";
  const style = isPresenter
    ? "bg-black/50 text-white backdrop-blur-md presentation-controls-hover"
    : "bg-white/90 text-slate-800 border border-slate-200 shadow";

  const disabledPrev = currentSlide === 0;
  const disabledNext = currentSlide >= totalSlides - 1;

  const btnBase = "p-2 rounded-full transition hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed";
  const btnEditor = "p-2 rounded-lg transition hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed";
  const btn = isPresenter ? btnBase : btnEditor;

  return (
    <div className={`${base} ${style}`}>
      <button type="button" className={btn} onClick={onReset} disabled={disabledPrev} aria-label="回到开头">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="19 20 9 12 19 4 19 20" />
          <line x1="5" y1="19" x2="5" y2="5" />
        </svg>
      </button>
      <button type="button" className={btn} onClick={onPrevious} disabled={disabledPrev} aria-label="上一页">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span className={`text-sm tabular-nums px-2 ${isPresenter ? "text-white/90" : "text-slate-600"}`}>
        {currentSlide + 1} / {totalSlides}
      </span>
      <button type="button" className={btn} onClick={onNext} disabled={disabledNext} aria-label="下一页">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {showFullscreenButton && onFullscreen && (
        <button type="button" className={btn} onClick={onFullscreen} aria-label="全屏">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
      )}
      {extraActions}
    </div>
  );
}
