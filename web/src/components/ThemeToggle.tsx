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
      className="mx-3 mt-3 flex h-10 shrink-0 items-center justify-center gap-3 rounded-md text-13 font-medium text-grey hover:bg-primary-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:justify-start md:px-3"
      onClick={() => {
        const next = theme === "light" ? "dark" : "light";
        saveTheme(next);
        setTheme(next);
      }}
    >
      <Icon size={17} aria-hidden />
      <span className="hidden md:inline">{theme === "light" ? "Dark mode" : "Light mode"}</span>
    </button>
  );
}
