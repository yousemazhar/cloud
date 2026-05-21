import type { CSSProperties } from "react";

export type IconName =
  | "search" | "bell" | "help" | "settings" | "apps"
  | "chevron-down" | "chevron-right" | "plus" | "x" | "more"
  | "star" | "share" | "filter" | "calendar" | "user" | "users"
  | "board" | "timeline" | "backlog" | "reports" | "issues"
  | "code" | "rocket" | "page" | "link" | "attach" | "image"
  | "upload" | "check" | "eye" | "trend-up" | "logout" | "alert" | "trash" | "edit";

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Subset of the design's icon library. Single-file so we don't import 35 SVGs
 * individually. All icons render through one signature.
 */
export function Icon({ name, size = 16, strokeWidth = 1.7, className, style }: IconProps) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    className, style
  };
  switch (name) {
    case "search": return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case "bell": return <svg {...p}><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/></svg>;
    case "help": return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 2.5-3 4.5"/></svg>;
    case "settings": return <svg {...p}><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/></svg>;
    case "apps": return <svg {...p}>{[5, 12, 19].flatMap((y) => [5, 12, 19].map((x) => (<circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" fill="currentColor"/>)))}</svg>;
    case "chevron-down": return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case "chevron-right": return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
    case "plus": return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case "x": return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case "more": return <svg {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></svg>;
    case "star": return <svg {...p}><polygon points="12,2 14.6,9 22,9 16,13.5 18.2,21 12,16.8 5.8,21 8,13.5 2,9 9.4,9"/></svg>;
    case "share": return <svg {...p}><path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/><polyline points="16 6 12 2 8 6"/><path d="M12 2v14"/></svg>;
    case "filter": return <svg {...p}><path d="M3 4h18M6 12h12M10 20h4"/></svg>;
    case "calendar": return <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>;
    case "user": return <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>;
    case "users": return <svg {...p}><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><circle cx="17" cy="8" r="3"/><path d="M22 19c0-3-2-5-5-5"/></svg>;
    case "board": return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></svg>;
    case "timeline": return <svg {...p}><path d="M3 6h12M3 12h18M3 18h8"/></svg>;
    case "backlog": return <svg {...p}><path d="M3 6h18M3 12h18M3 18h18"/></svg>;
    case "reports": return <svg {...p}><path d="M3 20h18"/><path d="M6 20V10M11 20V4M16 20v-7M21 20v-4"/></svg>;
    case "issues": return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16v.01"/></svg>;
    case "code": return <svg {...p}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
    case "rocket": return <svg {...p}><path d="M5 19l3-3M9 11l4 4m-3.5-7.5L14 12l4-1c2-1 3-3 3-6 0-1-1-2-2-2-3 0-5 1-6 3l-1 4-2-1.5z"/></svg>;
    case "page": return <svg {...p}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="14 3 14 9 20 9"/></svg>;
    case "link": return <svg {...p}><path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1.5-1.5"/></svg>;
    case "attach": return <svg {...p}><path d="M21 11l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8.5-8.5"/></svg>;
    case "image": return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5L8 19"/></svg>;
    case "upload": return <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><path d="M12 3v12"/></svg>;
    case "check": return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>;
    case "eye": return <svg {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "trend-up": return <svg {...p}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>;
    case "logout": return <svg {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><path d="M21 12H9"/></svg>;
    case "alert": return <svg {...p}><path d="M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17v.01"/></svg>;
    case "trash": return <svg {...p}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14"/></svg>;
    case "edit": return <svg {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>;
    default: return <svg {...p}/>;
  }
}
