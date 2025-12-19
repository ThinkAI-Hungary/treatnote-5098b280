import { useTheme } from "./ThemeProvider";

export function BackgroundEffects() {
  const { resolvedTheme } = useTheme();

  // Only show flowing orbs in dark mode
  if (resolvedTheme !== "dark") {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Flowing color orbs */}
      <div className="color-orb color-orb-1" />
      <div className="color-orb color-orb-2" />
      <div className="color-orb color-orb-3" />
      <div className="color-orb color-orb-4" />
    </div>
  );
}
