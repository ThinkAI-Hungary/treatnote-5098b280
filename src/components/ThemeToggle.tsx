import { Moon, Sun, Sparkles } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <button
      onClick={toggleTheme}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "fixed bottom-6 left-6 z-50",
        "h-14 w-14 rounded-full",
        "flex items-center justify-center",
        "bg-gradient-to-br from-primary to-accent",
        "shadow-lg transition-all duration-500 ease-out",
        "hover:scale-110 hover:shadow-xl",
        "group overflow-hidden",
        // Glow effect
        resolvedTheme === "dark" 
          ? "shadow-[0_0_20px_hsl(195_85%_55%/0.4),0_0_40px_hsl(270_70%_60%/0.2)]" 
          : "shadow-[0_0_20px_hsl(270_70%_55%/0.3),0_0_40px_hsl(195_85%_55%/0.15)]",
        isHovered && "animate-pulse-glow"
      )}
      aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Background gradient animation */}
      <div 
        className={cn(
          "absolute inset-0 rounded-full transition-opacity duration-500",
          "bg-gradient-to-br from-accent to-primary",
          isHovered ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Sparkle decorations */}
      <Sparkles 
        className={cn(
          "absolute h-3 w-3 text-primary-foreground/60 transition-all duration-300",
          isHovered ? "opacity-100 -top-1 -right-1 scale-100" : "opacity-0 top-2 right-2 scale-0"
        )}
      />
      <Sparkles 
        className={cn(
          "absolute h-2 w-2 text-primary-foreground/40 transition-all duration-500",
          isHovered ? "opacity-100 -bottom-0.5 -left-0.5 scale-100" : "opacity-0 bottom-2 left-2 scale-0"
        )}
        style={{ animationDelay: "150ms" }}
      />

      {/* Sun icon */}
      <Sun 
        className={cn(
          "absolute h-6 w-6 text-primary-foreground transition-all duration-500",
          resolvedTheme === "dark" 
            ? "rotate-0 scale-100 opacity-100" 
            : "rotate-90 scale-0 opacity-0"
        )}
      />

      {/* Moon icon */}
      <Moon 
        className={cn(
          "absolute h-6 w-6 text-primary-foreground transition-all duration-500",
          resolvedTheme === "dark" 
            ? "-rotate-90 scale-0 opacity-0" 
            : "rotate-0 scale-100 opacity-100"
        )}
      />

      {/* Ripple effect on hover */}
      <div 
        className={cn(
          "absolute inset-0 rounded-full border-2 border-primary-foreground/30",
          "transition-all duration-500",
          isHovered ? "scale-125 opacity-0" : "scale-100 opacity-0"
        )}
      />
    </button>
  );
}
