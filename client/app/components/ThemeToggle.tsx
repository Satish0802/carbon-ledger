"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("carbon-theme");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextDark = saved ? saved === "dark" : systemDark;
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
    setDark(nextDark);
    setReady(true);
  }, []);

  function toggle() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("carbon-theme", next ? "dark" : "light");
    setDark(next);
  }

  if (!ready) return <button className="theme-toggle theme-toggle-placeholder" aria-hidden="true" tabIndex={-1}>◐</button>;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${dark ? "light" : "dark"} theme`}
      title={`Switch to ${dark ? "light" : "dark"} theme`}
    >
      <span className="theme-toggle-icon" aria-hidden="true">{dark ? "☼" : "☾"}</span>
      <span className="theme-toggle-label">{dark ? "Light" : "Dark"}</span>
    </button>
  );
}
