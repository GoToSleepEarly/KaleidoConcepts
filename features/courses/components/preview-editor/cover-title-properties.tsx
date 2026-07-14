"use client";

const COVER_THEMES = [
  { id: "dark", label: "深色", preview: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.8) 100%)" },
  { id: "warm", label: "暖色", preview: "linear-gradient(to bottom, rgba(255,140,0,0.2) 0%, rgba(0,0,0,0.7) 100%)" },
  { id: "light", label: "浅色", preview: "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.8) 100%)" },
];

type Props = {
  value: string;
  fontScale: number;
  onChange: (theme: string, fontScale: number) => void;
};

export function CoverTitleProperties({ value, fontScale, onChange }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium text-slate-700 mb-2 block">封面蒙版</label>
        <div className="grid grid-cols-3 gap-2">
          {COVER_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => onChange(theme.id, fontScale)}
              className={`relative aspect-video rounded-lg overflow-hidden border-2 transition ${
                value === theme.id ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-300"
              }`}
              style={{ background: theme.preview, backgroundColor: "#334155" }}
            >
              <span className="absolute bottom-1 left-1 text-[10px] text-white bg-black/50 px-1 rounded">
                {theme.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700 mb-2 block">
          标题字号: {Math.round(fontScale * 100)}%
        </label>
        <input
          type="range"
          min={0.7}
          max={1.4}
          step={0.05}
          value={fontScale}
          onChange={(e) => onChange(value, parseFloat(e.target.value))}
          className="w-full accent-indigo-600"
        />
      </div>
    </div>
  );
}
