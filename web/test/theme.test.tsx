import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../src/components/ThemeToggle";
import { applyTheme, readTheme } from "../src/lib/theme";

beforeEach(() => {
  localStorage.clear();
  applyTheme("light");
});

afterEach(() => {
  localStorage.clear();
  applyTheme("light");
});

describe("runtime theme", () => {
  it("defaults to light even when the operating system prefers dark", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    expect(readTheme()).toBe("light");
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
  });

  it("switches with the keyboard and restores the saved choice on reload", async () => {
    const user = userEvent.setup();
    const view = render(<ThemeToggle />);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("dockyard.theme")).toBe("dark");
    view.unmount();
    applyTheme("light");
    applyTheme(readTheme());
    render(<ThemeToggle />);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    await user.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(readTheme()).toBe("light");
  });

  it("ignores invalid saved values", () => {
    localStorage.setItem("dockyard.theme", "unknown");
    expect(readTheme()).toBe("light");
  });

  it("still switches when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    await userEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});
