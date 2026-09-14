"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export function GrammarUnitSummary({
  action,
  className,
  expanded,
  leading,
  onExpandedChange,
  rules,
  testId,
  title,
  unitLabel,
}: {
  action?: React.ReactNode;
  className?: string;
  expanded: boolean;
  leading?: React.ReactNode;
  onExpandedChange: (expanded: boolean) => void;
  rules: string[];
  testId?: string;
  title: string;
  unitLabel: string;
}) {
  const displayName = `${unitLabel} · ${title}`;
  return (
    <div className={cn("px-3 py-2.5", className)} data-testid={testId}>
      <div className="flex min-h-8 min-w-0 items-center gap-2">
        {leading}
        <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-foreground">{displayName}</p>
        {rules.length ? (
          <button
            aria-expanded={expanded}
            aria-label={`${expanded ? "收起" : "查看"} ${displayName} 的 ${rules.length} 条语法要点`}
            className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onExpandedChange(!expanded)}
            type="button"
          >
            {rules.length} 条要点 · {expanded ? "收起" : "查看"}
            <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          </button>
        ) : null}
        {action}
      </div>
      {expanded && rules.length ? (
        <ul className="mt-2 space-y-1 border-l-2 border-primary-100 pl-3 text-xs leading-5 text-muted-foreground">
          {rules.map((rule) => <li className="flex gap-2" key={rule}><span aria-hidden>•</span><span>{rule}</span></li>)}
        </ul>
      ) : null}
    </div>
  );
}
