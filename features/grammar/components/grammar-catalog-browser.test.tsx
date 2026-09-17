import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
      title: "Present perfect and past 1",
      unitStart: 13,
      unitEnd: 13,
      units: [
        { unitNumber: 13, officialTitle: "Present perfect and past 1", learningContents: ["Use the present perfect for a current result.", "Use the past simple for finished past time.", "Choose the tense from the time reference."] },
      ],
    }],
  }],
}];

describe("GrammarCatalogBrowser", () => {
  it("shows every grammar rule and selects the Unit point id", () => {
    const onSelectedIdsChange = vi.fn();
    render(<GrammarCatalogBrowser activeBookId="book" books={books} onActiveBookChange={vi.fn()} onSelectedIdsChange={onSelectedIdsChange} selectedIds={[]} />);

    expect(screen.getByText("Use the present perfect for a current result.")).toBeInTheDocument();
    expect(screen.getByText("Use the past simple for finished past time.")).toBeInTheDocument();
    expect(screen.getByText("Choose the tense from the time reference.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Unit 13/ }));
    expect(onSelectedIdsChange).toHaveBeenCalledWith(["point"]);
  });

  it("searches grammar rule text", () => {
    render(<GrammarCatalogBrowser activeBookId="book" books={books} onActiveBookChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索当前书籍" }), { target: { value: "finished past" } });
    expect(screen.getAllByText("Present perfect and past 1").length).toBeGreaterThan(0);
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

  it("keeps Unit and title on one summary line and reveals selected-point details without removing it", () => {
    const onSelectedIdsChange = vi.fn();
    render(<GrammarCatalogBrowser activeBookId="book" books={books} onActiveBookChange={vi.fn()} onSelectedIdsChange={onSelectedIdsChange} selectedIds={["point"]} />);

    const summary = screen.getByTestId("selected-grammar-point-point");
    expect(summary).toHaveTextContent("Unit 13 · Present perfect and past 1");
    fireEvent.click(screen.getByRole("button", { name: "查看 Unit 13 · Present perfect and past 1 的 3 条语法要点" }));
    expect(summary).toHaveTextContent("Use the present perfect for a current result.");
    expect(onSelectedIdsChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "移除 Unit 13 · Present perfect and past 1" }));
    expect(onSelectedIdsChange).toHaveBeenCalledWith([]);
  });

  it("opens the first Step 1 Unit to reveal that compact rows contain selectable details", () => {
    const onSelectedIdsChange = vi.fn();
    render(<GrammarCatalogBrowser activeBookId="book" books={books} compactExpandableDetails defaultExpandFirstDetails onActiveBookChange={vi.fn()} onSelectedIdsChange={onSelectedIdsChange} selectedIds={["point"]} />);

    expect(screen.getAllByText("Use the present perfect for a current result.")).toHaveLength(1);
    expect(onSelectedIdsChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "收起列表中 Unit 13 · Present perfect and past 1 的语法要点", expanded: true }));
    expect(screen.queryByText("Use the present perfect for a current result.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开已选知识点 Unit 13 · Present perfect and past 1 的语法要点", expanded: false }));
    expect(screen.getAllByText("Use the present perfect for a current result.")).toHaveLength(1);
    expect(onSelectedIdsChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "取消选择 Unit 13 Present perfect and past 1" }));
    expect(onSelectedIdsChange).toHaveBeenCalledWith([]);
  });

  it("keeps compact Unit details collapsed outside the Step 1 selection affordance", () => {
    render(<GrammarCatalogBrowser activeBookId="book" books={books} compactExpandableDetails onActiveBookChange={vi.fn()} onSelectedIdsChange={vi.fn()} selectedIds={[]} />);

    expect(screen.queryByText("Use the present perfect for a current result.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开列表中 Unit 13 · Present perfect and past 1 的语法要点" })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps compact selected summaries at one stable row height when a Unit title is long", () => {
    render(<GrammarCatalogBrowser activeBookId="book" books={books} compactExpandableDetails onActiveBookChange={vi.fn()} onSelectedIdsChange={vi.fn()} selectedIds={["point"]} />);

    const summary = screen.getByTestId("selected-grammar-point-point");
    const title = within(summary).getByTitle("Present perfect and past 1");
    expect(summary).toHaveAttribute("data-layout", "single-line");
    expect(title).toHaveClass("truncate");
    expect(summary).toHaveTextContent("Present perfect and past 1");
    expect(summary).toHaveTextContent("Unit 13");
  });
});
