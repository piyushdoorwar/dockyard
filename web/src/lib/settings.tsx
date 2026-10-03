import { createContext, useContext, useState, type ReactNode } from "react";

interface Settings {
  agents: boolean;
  compose: boolean;
}

const STORAGE_KEY = "dockyard.discovery";

function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return { agents: saved?.agents === true, compose: saved?.compose === true };
  } catch {
    return { agents: false, compose: false };
  }
}

const SettingsContext = createContext<{
  settings: Settings;
  setEnabled: (feature: keyof Settings, enabled: boolean) => void;
} | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(readSettings);
  function setEnabled(feature: keyof Settings, enabled: boolean) {
    const next = { ...settings, [feature]: enabled };
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Preferences still apply for this session when storage is unavailable.
    }
  }
  return <SettingsContext.Provider value={{ settings, setEnabled }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings requires SettingsProvider");
  return context;
}
