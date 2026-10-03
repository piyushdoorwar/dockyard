import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { readTheme, saveTheme } from "../lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme);
  const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
  const Icon = theme === "light" ? Moon : Sun;

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="btn btn-cancel shrink-0"
      onClick={() => {
        const next = theme === "light" ? "dark" : "light";
        saveTheme(next);
        setTheme(next);
      }}
    >
      <Icon size={17} aria-hidden />
      <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
    </button>
  );
}
