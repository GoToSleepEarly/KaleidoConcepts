"use client";

import type { SlideTextOverride, TextBoxStyle } from "@/lib/contracts/api";

type Props = {
  pageId: string;
  textBox: TextBoxStyle;
  override?: SlideTextOverride;
  onChange: (pageId: string, override: SlideTextOverride) => void;
  onReset: (pageId: string) => void;
};

export function SlideTextProperties({ pageId, textBox, override, onChange, onReset }: Props) {
  const currentOverride: SlideTextOverride = override ?? {};

  const updateTextBox = (patch: Partial<TextBoxStyle>) => {
    onChange(pageId, {
      ...currentOverride,
      textBox: { ...currentOverride.textBox, ...patch },
    });
  };

  const resetOverride = () => {
    onReset(pageId);
  };

  const currentTextBox = { ...textBox, ...(currentOverride.textBox ?? {}) };

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium text-slate-700 mb-2 block">
          字号大小: {Math.round(currentTextBox.fontSize * 100)}%
        </label>
        <input
          type="range"
          min={0.7}
          max={1.3}
          step={0.05}
          value={currentTextBox.fontSize}
          onChange={(e) => updateTextBox({ fontSize: parseFloat(e.target.value) })}
          className="w-full accent-indigo-600"
        />
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>小</span>
          <span>默认</span>
          <span>大</span>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700 mb-2 block">
          背景透明度: {Math.round(currentTextBox.opacity * 100)}%
        </label>
        <input
          type="range"
          min={0.5}
          max={1}
          step={0.05}
          value={currentTextBox.opacity}
          onChange={(e) => updateTextBox({ opacity: parseFloat(e.target.value) })}
          className="w-full accent-indigo-600"
        />
      </div>

      <button
        type="button"
        onClick={resetOverride}
        className="w-full text-sm text-slate-600 hover:text-indigo-600 py-2 border border-slate-200 rounded-md hover:border-indigo-300 transition"
      >
        重置为默认
      </button>
    </div>
  );
}
