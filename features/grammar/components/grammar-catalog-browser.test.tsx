import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GrammarCatalogBrowser } from "@/features/grammar/components/grammar-catalog-browser";

const books = [{
  id: "book",
  title: "English Grammar in Use",
  edition: "Fifth Edition",
  officialLevel: "B1–B2",
  sections: [{
    id: "section",
    officialTitle: "Present perfect and past",
    points: [{
      id: "point",
      title: "Present perfect and past",
      unitStart: 13,
      unitEnd: 14,
      units: [
        { unitNumber: 13, officialTitle: "Present perfect and past 1" },
        { unitNumber: 14, officialTitle: "Present perfect and past 2" },
      ],
    }],
  }],
}];

describe("GrammarCatalogBrowser", () => {
  it("shows authoritative source units and selects the merged point id", () => {
    const onSelectedIdsChange = vi.fn();
    render(<GrammarCatalogBrowser activeBookId="book" books={books} onActiveBookChange={vi.fn()} onSelectedIdsChange={onSelectedIdsChange} selectedIds={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "查看 Present perfect and past 来源 Unit" }));
    expect(screen.getByText("Present perfect and past 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Units 13–14/ }));
    expect(onSelectedIdsChange).toHaveBeenCalledWith(["point"]);
  });

  it("searches exact child unit titles", () => {
    render(<GrammarCatalogBrowser activeBookId="book" books={books} onActiveBookChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索当前书籍" }), { target: { value: "past 2" } });
    expect(screen.getAllByText("Present perfect and past").length).toBeGreaterThan(0);
  });

  it("supports a scoped task view with an explicit chapter action", () => {
    render(<GrammarCatalogBrowser
      activeBookId="book"
      books={books}
      emptyMessage="当前分类没有知识点"
      onActiveBookChange={vi.fn()}
      onSelectedIdsChange={vi.fn()}
      pointDescriptions={{ point: "AI 已推荐至第 2 章" }}
      selectionLabels={{ selected: "已加入本章", unselected: "加入本章" }}
      selectedIds={["point"]}
      visiblePointIds={["point"]}
    />);

    expect(screen.getByText("AI 已推荐至第 2 章")).toBeInTheDocument();
    expect(screen.getByText("已加入本章")).toBeInTheDocument();
  });
});
