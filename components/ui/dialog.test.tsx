import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, test, vi } from "vitest";

import { Dialog } from "./dialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

describe("Dialog cancel handling", () => {
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

  test("still closes when the dialog itself is cancelled", () => {
    const onClose = vi.fn();
    render(
      <Dialog onClose={onClose} open title="编辑人物">
        <span>内容</span>
      </Dialog>,
    );

    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { bubbles: false, cancelable: true }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
