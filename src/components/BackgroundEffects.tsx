import React from "react";
import { useTheme } from "./ThemeProvider";

// Memoized to prevent re-renders from parent state changes
export const BackgroundEffects = React.memo(function BackgroundEffects() {
  const { resolvedTheme } = useTheme();

  // Only show flowing orbs in dark mode
  if (resolvedTheme !== "dark") {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Flowing color orbs with GPU acceleration */}
      <div 
        className="color-orb color-orb-1" 
        style={{ willChange: 'transform, opacity' }} 
      />
      <div 
        className="color-orb color-orb-2" 
        style={{ willChange: 'transform, opacity' }} 
      />
      <div 
        className="color-orb color-orb-3" 
        style={{ willChange: 'transform, opacity' }} 
      />
      <div 
        className="color-orb color-orb-4" 
        style={{ willChange: 'transform, opacity' }} 
      />
    </div>
  );
});
