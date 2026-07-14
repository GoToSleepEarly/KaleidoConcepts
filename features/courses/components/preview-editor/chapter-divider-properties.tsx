"use client";

const CHAPTER_THEMES = [
  { id: "blue-purple", label: "蓝紫", preview: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" },
  { id: "green-teal", label: "青竹", preview: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)" },
  { id: "orange-red", label: "橙红", preview: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
  { id: "purple-pink", label: "紫粉", preview: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)" },
  { id: "blue-indigo", label: "蓝靛", preview: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" },
];

type Props = {
  value: string;
  onChange: (theme: string) => void;
};

export function ChapterDividerProperties({ value, onChange }: Props) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700 mb-2 block">章节配色主题</label>
      <div className="grid grid-cols-3 gap-2">
        {CHAPTER_THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => onChange(theme.id)}
            className={`relative aspect-video rounded-lg overflow-hidden border-2 transition ${
              value === theme.id ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-300"
            }`}
            style={{ background: theme.preview }}
          >
            <span className="absolute bottom-1 left-1 text-[10px] text-white bg-black/40 px-1 rounded">
              {theme.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
