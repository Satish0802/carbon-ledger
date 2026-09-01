import React from "react";

export type CarbonIconName =
  | "transport" | "energy" | "diet" | "shopping" | "water" | "globe"
  | "leaf" | "chart" | "warning" | "trash" | "close" | "check"
  | "lock" | "pin" | "home" | "work" | "settings";

type Props = { name: CarbonIconName; size?: number; strokeWidth?: number; className?: string };

export default function CarbonIcon({ name, size = 20, strokeWidth = 1.8, className }: Props) {
  const common = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const, className, "aria-hidden": true,
  };
  const icons: Record<CarbonIconName, React.ReactNode> = {
    transport: <><path d="M5 16l1.2-5.2A2.3 2.3 0 0 1 8.4 9h7.2a2.3 2.3 0 0 1 2.2 1.8L19 16"/><path d="M4 16h16v3H4z"/><circle cx="7" cy="19" r="1.2"/><circle cx="17" cy="19" r="1.2"/><path d="M7 13h10"/></>,
    energy: <><path d="M13 2L5 13h6l-1 9 8-12h-6z"/></>,
    diet: <><path d="M12 21C7 18 5 13 7 8c4 0 8 2 8 7 0 3-1 5-3 6z"/><path d="M12 21c0-5 2-9 7-12"/></>,
    shopping: <><path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/></>,
    water: <><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.3 2.5 3.3 5.5 3.3 9S14.3 18.5 12 21c-2.3-2.5-3.3-5.5-3.3-9S9.7 5.5 12 3z"/></>,
    leaf: <><path d="M20 4C11 4 5 8 5 14c0 3 2 5 5 5 6 0 10-6 10-15z"/><path d="M4 21c3-5 7-8 12-11"/></>,
    chart: <><path d="M4 19V5M4 19h16"/><path d="M7 15l3-4 3 2 5-7"/></>,
    warning: <><path d="M12 3l9 17H3z"/><path d="M12 9v5M12 17h.01"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
    close: <><path d="M6 6l12 12M18 6L6 18"/></>,
    check: <><path d="M5 12l4 4L19 6"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    pin: <><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/></>,
    home: <><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10M10 20v-6h4v6"/></>,
    work: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2M3 12h18M10 12v2h4v-2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.5 1.5-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.1v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.5-1.5.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H7v-2.1h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.5-1.5.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V4h2.1v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.5 1.5-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2V12h-.2a1.7 1.7 0 0 0-1.6 1z"/></>,
  };
  return <svg {...common}>{icons[name]}</svg>;
}
