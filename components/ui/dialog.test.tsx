import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { Dialog } from "./dialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

describe("Dialog", () => {
  test("centers compact modal dialogs in both axes", () => {
    render(
      <Dialog onClose={vi.fn()} open size="compact" title="新增主题方向">
        <span>内容</span>
      </Dialog>,
    );

    expect(screen.getByRole("dialog")).toHaveClass(
      "left-1/2",
      "top-1/2",
      "-translate-x-1/2",
      "-translate-y-1/2",
      "w-[min(92vw,560px)]",
    );
  });

  test("keeps modal dialogs inside phone safe areas with a sheet layout", () => {
    render(
      <Dialog onClose={vi.fn()} open title="选择人物">
        <span>内容</span>
      </Dialog>,
    );

    expect(screen.getByRole("dialog")).toHaveClass(
      "max-sm:inset-x-2",
      "max-sm:bottom-2",
      "max-sm:top-auto",
      "max-sm:max-h-[calc(100dvh-1rem)]",
      "max-sm:translate-x-0",
      "max-sm:translate-y-0",
    );
  });

  test("does not close when a file input emits a bubbling cancel event", () => {
    const onClose = vi.fn();
    render(
      <Dialog onClose={onClose} open title="编辑人物">
        <input aria-label="人物照片" type="file" />
      </Dialog>,
    );

    fireEvent(
      screen.getByLabelText("人物照片"),
      new Event("cancel", { bubbles: true, cancelable: true }),
    );

    expect(onClose).not.toHaveBeenCalled();
  });

  test("closes when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Dialog onClose={onClose} open title="编辑人物">
        <span>内容</span>
      </Dialog>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Dialog onClose={onClose} open title="编辑人物">
        <span>内容</span>
      </Dialog>,
    );
    const backdrop = document.querySelector<HTMLButtonElement>("button[aria-hidden='true']");

    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("restores focus to the previously focused element after closing", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <>
        <button type="button">打开弹窗</button>
        <Dialog onClose={onClose} open={false} title="选择人物">
          <button type="button">第一个操作</button>
        </Dialog>
      </>,
    );
    const opener = screen.getByRole("button", { name: "打开弹窗" });

    opener.focus();
    rerender(
      <>
        <button type="button">打开弹窗</button>
        <Dialog onClose={onClose} open title="选择人物">
          <button type="button">第一个操作</button>
        </Dialog>
      </>,
    );
    const closeButton = screen.getByRole("button", { name: "关闭" });
    await waitFor(() => expect(closeButton).toHaveFocus());

    rerender(
      <>
        <button type="button">打开弹窗</button>
        <Dialog onClose={onClose} open={false} title="选择人物">
          <button type="button">第一个操作</button>
        </Dialog>
      </>,
    );

    expect(screen.getByRole("button", { name: "打开弹窗" })).toHaveFocus();
  });

  test("moves focus into the dialog and keeps Tab navigation inside it", async () => {
    render(
      <Dialog onClose={vi.fn()} open title="选择人物">
        <button type="button">第一个操作</button>
        <button type="button">第二个操作</button>
      </Dialog>,
    );
    const closeButton = screen.getByRole("button", { name: "关闭" });
    const firstButton = screen.getByRole("button", { name: "第一个操作" });
    const secondButton = screen.getByRole("button", { name: "第二个操作" });

    await waitFor(() => expect(closeButton).toHaveFocus());

    secondButton.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    closeButton.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(secondButton).toHaveFocus();

    firstButton.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(firstButton).toHaveFocus();
  });

  test("renders without the native dialog showModal API", () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: undefined,
    });

    render(
      <Dialog onClose={vi.fn()} open title="选择全课知识点">
        <span>知识点内容</span>
      </Dialog>,
    );

    expect(screen.getByRole("dialog", { name: "选择全课知识点" })).toBeInTheDocument();
    expect(screen.getByText("知识点内容")).toBeInTheDocument();
  });
});
