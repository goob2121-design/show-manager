"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const storageKey = "cmms-theme";

function getThemeFromDocument(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document === "undefined") {
      return "light";
    }

    return getThemeFromDocument();
  });

  useEffect(() => {
    const handleThemeChange = () => {
      setTheme(getThemeFromDocument());
    };

    window.addEventListener("cmms-theme-change", handleThemeChange);

    return () => {
      window.removeEventListener("cmms-theme-change", handleThemeChange);
    };
  }, []);

  function handleToggle() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(storageKey, nextTheme);
    applyTheme(nextTheme);
    setTheme(nextTheme);
    window.dispatchEvent(new Event("cmms-theme-change"));
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="rounded-full border border-stone-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-700 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-slate-900 dark:text-stone-100 dark:hover:bg-slate-800"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? "Light Mode" : "Dark Mode"}
    </button>
  );
}
