import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { NumberForm } from "@/lib/number-format";

export type AccentColor = "indigo" | "purple" | "emerald" | "rose" | "amber";
export type ThemeMode = "light" | "dark";
export type AnimationSpeed = "slow" | "normal" | "fast";

export interface Settings {
  theme: ThemeMode;
  accent: AccentColor;
  numberForm: NumberForm;
  decimalPlaces: number;
  showSteps: boolean;
  autoCalculate: boolean;
  useRadians: boolean;
  alwaysShowGraphs: boolean;
  animationSpeed: AnimationSpeed;
  defaultGraphRange: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  accent: "indigo",
  numberForm: "decimal",
  decimalPlaces: 4,
  showSteps: true,
  autoCalculate: false,
  useRadians: true,
  alwaysShowGraphs: false,
  animationSpeed: "normal",
  defaultGraphRange: 10,
};

const STORAGE_KEY = "calcio-settings";

interface SettingsContextValue extends Settings {
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetDefaults: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function loadInitial(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
    // Migrate legacy theme-only key from the old ThemeToggle implementation
    const legacyTheme = localStorage.getItem("math-theme");
    if (legacyTheme === "dark" || legacyTheme === "light") {
      return { ...DEFAULT_SETTINGS, theme: legacyTheme };
    }
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      return { ...DEFAULT_SETTINGS, theme: "dark" };
    }
  } catch {
    // ignore corrupt storage
  }
  return DEFAULT_SETTINGS;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadInitial);

  // Apply theme + accent to <html> so CSS variables update everywhere
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", settings.theme === "dark");
    root.setAttribute("data-accent", settings.accent);
  }, [settings.theme, settings.accent]);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // storage full / unavailable — non-fatal
    }
  }, [settings]);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return (
    <SettingsContext.Provider value={{ ...settings, update, resetDefaults }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
