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
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setMounted(true);
    setTheme(getThemeFromDocument());

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

  const isDarkMode = mounted ? theme === "dark" : false;

  return (
    <button
      type="button"
      onClick={handleToggle}
      title="Toggle theme"
      className="rounded-lg p-2 text-base text-stone-700 opacity-70 transition hover:bg-zinc-700 hover:opacity-100 dark:text-stone-100"
      aria-label="Toggle theme"
    >
      {isDarkMode ? "🌙" : "☀️"}
    </button>
  );
}
