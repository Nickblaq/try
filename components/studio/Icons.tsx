import type { IconProps } from "@/lib/studio/types";

const svgProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Icons = {
  Back: ({ size = 20 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M15 5 8 12l7 7" />
    </svg>
  ),
  Close: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  Chevron: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  ),
  Play: ({ size = 20 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.3v13.4a1 1 0 0 0 1.53.85l10.7-6.7a1 1 0 0 0 0-1.7L9.53 4.45A1 1 0 0 0 8 5.3Z" />
    </svg>
  ),
  Check: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="m5 12 5 5L20 7" />
    </svg>
  ),
  Plus: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Search: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  Link: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
      <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
    </svg>
  ),
  Upload: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M12 19V8m0 0-4 4m4-4 4 4M5 5h14" />
    </svg>
  ),
  Download: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
    </svg>
  ),
  Music: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  ),
  Video: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </svg>
  ),
  Subtitle: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15h6M7 11h4M15 15h2" />
    </svg>
  ),
  Image: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m4 18 5-5 4 4 3-3 4 4" />
    </svg>
  ),
  File: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
    </svg>
  ),
  Archive: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
    </svg>
  ),
  Lock: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  Globe: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  ),
  Shield: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="m12 3 8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z" />
    </svg>
  ),
  Bolt: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" />
    </svg>
  ),
  Terminal: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="m5 8 4 4-4 4M13 16h6" />
    </svg>
  ),
  Clock: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  Trash: ({ size = 14 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" />
    </svg>
  ),
  Home: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1Z" />
    </svg>
  ),
  Grid: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  ),
  Flow: ({ size = 22 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8.5 6h4a3 3 0 0 1 3 3v.5M8.5 18h4a3 3 0 0 0 3-3v-.5" />
    </svg>
  ),
  Up: ({ size = 14 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="m6 15 6-6 6 6" />
    </svg>
  ),
  Down: ({ size = 14 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  Warn: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  ),
  Info: ({ size = 16 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
  Scissors: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
    </svg>
  ),
  Settings: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  ),
  Sparkle: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </svg>
  ),
  Type: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M4 6V4h16v2M9 20h6M12 4v16" />
    </svg>
  ),
  Crop: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M6 2v16h16M2 6h16v16" />
    </svg>
  ),
  Rotate: ({ size = 18 }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <path d="M4 12a8 8 0 1 0 3-6.3" />
      <path d="M4 5v4h4" />
    </svg>
  ),
};
