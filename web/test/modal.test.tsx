import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";
import { Modal } from "../src/components/Modal";

it("contains keyboard focus, survives rerenders, and restores focus and scrolling on close", async () => {
  const user = userEvent.setup();
  function Example() {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState("");
    return <><button onClick={() => setOpen(true)}>Open</button>{open &&
      <Modal title="Edit" onClose={() => setOpen(false)}><input aria-label="Name" value={value} onChange={e => setValue(e.target.value)} /><button>Save</button></Modal>}</>;
  }
  render(<Example />);
  const opener = screen.getByRole("button", { name: "Open" });
  await user.click(opener);
  expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  expect(document.body.style.overflow).toBe("hidden");
  await user.tab({ shift: true });
  expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  await user.tab();
  await user.type(screen.getByRole("textbox"), "example");
  expect(screen.getByRole("textbox")).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(document.body.style.overflow).toBe("");
});

it("preserves child autofocus and restores its opener", async () => {
  const user = userEvent.setup();
  function Example() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Open</button>{open &&
      <Modal title="Edit" onClose={() => setOpen(false)}><input autoFocus aria-label="Name" /></Modal>}</>;
  }
  render(<Example />);
  const opener = screen.getByRole("button", { name: "Open" });
  await user.click(opener);
  expect(screen.getByRole("textbox")).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(opener).toHaveFocus();
});
