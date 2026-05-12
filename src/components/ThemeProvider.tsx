import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system" | "eaisymode";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light" | "eaisymode";
};

// ── Cookie helpers ──────────────────────────────────────────────────────────

function getCookie(key: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${key}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

function setCookie(key: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  // Mirror to localStorage as fallback for any code still reading it
  try { localStorage.setItem(key, value); } catch (_) { }
}

// ── Theme resolution ────────────────────────────────────────────────────────

function resolveTheme(theme: Theme): "dark" | "light" | "eaisymode" {
  if (theme === "system") {
    return typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

function getSavedTheme(key: string, defaultTheme: Theme): Theme {
  // Always return defaultTheme (eaisymode) since the toggle buttons have been removed
  return defaultTheme;
}

// Apply class to <html> immediately to prevent any flash
function applyThemeClass(resolved: "dark" | "light" | "eaisymode") {
  const root = document.documentElement;
  root.classList.remove("light", "dark", "eaisymode");
  root.classList.add(resolved);
}

// ── Provider ────────────────────────────────────────────────────────────────

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  resolvedTheme: "light",
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  // Read theme synchronously so first render is correct (no flash)
  const [theme, setThemeState] = useState<Theme>(() => {
    return getSavedTheme(storageKey, defaultTheme);
  });

  // Resolve + apply class synchronously on first render
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light" | "eaisymode">(() => {
    const resolved = resolveTheme(getSavedTheme(storageKey, defaultTheme));
    applyThemeClass(resolved);
    return resolved;
  });

  // Keep HTML class in sync whenever theme state changes
  useEffect(() => {
    const resolved = resolveTheme(theme);
    applyThemeClass(resolved);
    setResolvedTheme(resolved);
  }, [theme]);

  // Listen for system preference changes
  useEffect(() => {
    if (theme !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "dark" : "light";
      applyThemeClass(resolved);
      setResolvedTheme(resolved);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const value: ThemeProviderState = {
    theme,
    setTheme: (newTheme: Theme) => {
      setCookie(storageKey, newTheme);
      setThemeState(newTheme);
    },
    resolvedTheme,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
