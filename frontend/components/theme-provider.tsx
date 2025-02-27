"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const [mounted, setMounted] = React.useState(false);

  // Force dark mode on initial load
  React.useEffect(() => {
    // Apply dark mode immediately
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";

    setMounted(true);
  }, []);

  // Prevent flash of unstyled content during initial render
  // Only render children once mounted on client
  return (
    <NextThemesProvider {...props}>
      {mounted ? (
        children
      ) : (
        <div style={{ visibility: "hidden" }}>{children}</div>
      )}
    </NextThemesProvider>
  );
}
