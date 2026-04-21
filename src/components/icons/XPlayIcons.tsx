/**
 * XPLAY Icon System v1.0
 * 33 custom icons — Outlined · 2px stroke · Round caps & joins
 * Ink: currentColor  |  Accent: #CDFF65 (lime)
 *
 * Generated from XPLAY — Icon Sheet (Claude Design)
 * https://claude.ai/design/p/92e20eb3-3d31-4816-83ef-e282874b21f5
 */

import { SVGProps } from 'react';

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

const baseProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// ─────────────────────────────────────────────────────────
// S · 01  Player App — Bottom Navigation  (24 × 24 px)
// ─────────────────────────────────────────────────────────

export const IconMatches = ({ size = 24, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 24 24" {...props}>
    {/* left player */}
    <circle cx="5.5" cy="7.5" r="2" />
    <path d="M2.5 17c.3-2.3 1.6-3.8 3-3.8s2.7 1.5 3 3.8" />
    {/* right player */}
    <circle cx="18.5" cy="7.5" r="2" />
    <path d="M15.5 17c.3-2.3 1.6-3.8 3-3.8s2.7 1.5 3 3.8" />
    {/* VS divider (accent) */}
    <line x1="12" y1="4" x2="12" y2="20" stroke="#CDFF65" />
    <path d="M10 9l1.2 3 .8-2" stroke="#CDFF65" />
    <path d="M13 14l.9-1.2 .9 1.2" stroke="#CDFF65" />
  </svg>
);

export const IconTournaments = ({ size = 24, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 24 24" {...props}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <path d="M7 6H4v2a3 3 0 0 0 3 3" />
    <path d="M17 6h3v2a3 3 0 0 1-3 3" />
    <path d="M10 14h4v3h-4z" />
    <path d="M8 20h8" />
    <path d="M12 17v3" />
  </svg>
);

export const IconRewards = ({ size = 24, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 24 24" {...props}>
    <path d="M12 3l2.3 4.8 5.2.7-3.8 3.6.95 5.2L12 14.9l-4.65 2.4.95-5.2L4.5 8.5l5.2-.7L12 3z" />
    <path d="M12.5 9.5l-1.8 2.8h2.3l-1.2 2.4" stroke="#CDFF65" />
  </svg>
);

export const IconProfile = ({ size = 24, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 24 24" {...props}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" />
  </svg>
);

export const IconClubs = ({ size = 24, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 24 24" {...props}>
    <path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z" />
    <rect x="8.5" y="6" width="7" height="6" rx=".5" />
    <line x1="8.5" y1="9" x2="15.5" y2="9" />
    <line x1="12" y1="6" x2="12" y2="12" />
  </svg>
);

// ─────────────────────────────────────────────────────────
// S · 02  Player App — Feature Icons  (32 × 32 px)
// ─────────────────────────────────────────────────────────

export const IconCourtBooking = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <rect x="5" y="7" width="22" height="20" rx="2.5" />
    <line x1="5" y1="12" x2="27" y2="12" />
    <line x1="10" y1="5" x2="10" y2="9" />
    <line x1="22" y1="5" x2="22" y2="9" />
    {/* court grid accent */}
    <rect x="10" y="16" width="12" height="8" rx=".5" stroke="#CDFF65" />
    <line x1="16" y1="16" x2="16" y2="24" stroke="#CDFF65" />
    <line x1="10" y1="20" x2="22" y2="20" stroke="#CDFF65" />
  </svg>
);

export const IconXPPoints = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <circle cx="16" cy="16" r="10" />
    <circle cx="16" cy="16" r="7" opacity={0.4} />
    <path d="M13 12l6 8M19 12l-6 8" stroke="#CDFF65" />
  </svg>
);

export const IconMembership = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <rect x="4" y="11" width="24" height="15" rx="2.5" />
    <line x1="4" y1="16" x2="28" y2="16" />
    <line x1="8" y1="22" x2="14" y2="22" />
    {/* crown accent */}
    <path d="M10 9l2-4 4 2.5L20 5l2 4z" stroke="#CDFF65" />
    <line x1="10" y1="9" x2="22" y2="9" stroke="#CDFF65" />
  </svg>
);

export const IconCreateMatch = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <circle cx="13" cy="13" r="8" />
    <line x1="13" y1="9" x2="13" y2="17" />
    <line x1="9" y1="13" x2="17" y2="13" />
    {/* ball accent */}
    <ellipse cx="23" cy="22" rx="4" ry="4.5" transform="rotate(45 23 22)" stroke="#CDFF65" />
    <line x1="20.5" y1="24.5" x2="17.5" y2="27.5" stroke="#CDFF65" />
  </svg>
);

export const IconLeaderboard = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <rect x="5" y="18" width="5" height="9" />
    <rect x="13.5" y="13" width="5" height="14" />
    <rect x="22" y="21" width="5" height="6" />
    {/* 1st place trophy accent */}
    <path d="M14.5 7h3v2.5a1.5 1.5 0 0 1-3 0V7z" stroke="#CDFF65" />
    <line x1="16" y1="9.5" x2="16" y2="11" stroke="#CDFF65" />
    <line x1="14.5" y1="11" x2="17.5" y2="11" stroke="#CDFF65" />
  </svg>
);

export const IconCoaching = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <path d="M5 19a6 6 0 0 0 12 0v-2H5z" />
    <path d="M17 15l6-4v10l-6-4" />
    <circle cx="10" cy="20" r="1.5" />
    <path d="M8 13l-3-4" stroke="#CDFF65" />
  </svg>
);

export const IconNotifications = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <path d="M9 21h14l-2-2v-5a5 5 0 0 0-10 0v5l-2 2z" />
    <path d="M13 24a3 3 0 0 0 6 0" />
    {/* notification dot accent */}
    <circle cx="23" cy="10" r="2.5" fill="#CDFF65" stroke="#CDFF65" />
  </svg>
);

export const IconSettings = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <path d="M19.4 5.2l-.6-2.2h-5.6l-.6 2.2a11 11 0 0 0-2.6 1.5L7.8 5.8 3.8 9.8l.9 1.8a11 11 0 0 0-1.5 2.6L1 14.8v5.6l2.2.6a11 11 0 0 0 1.5 2.6l-.9 1.8 4 4 1.8-.9a11 11 0 0 0 2.6 1.5l.6 2.2h5.6l.6-2.2a11 11 0 0 0 2.6-1.5l1.8.9 4-4-.9-1.8a11 11 0 0 0 1.5-2.6l2.2-.6v-5.6l-2.2-.6a11 11 0 0 0-1.5-2.6l.9-1.8-4-4-1.8.9a11 11 0 0 0-2.6-1.5z" />
    <circle cx="16" cy="17.6" r="4" stroke="#CDFF65" />
  </svg>
);

export const IconMarketplace = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <path d="M6 11h20l-1.5 15a2 2 0 0 1-2 1.8H9.5a2 2 0 0 1-2-1.8L6 11z" />
    <path d="M11 11V8a5 5 0 0 1 10 0v3" />
    {/* XP bolt accent */}
    <path d="M13 18l6 5M19 18l-6 5" stroke="#CDFF65" />
  </svg>
);

export const IconRewardsHub = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <rect x="5" y="13" width="22" height="14" rx="1.5" />
    <rect x="3" y="9" width="26" height="5" rx="1" />
    <line x1="16" y1="9" x2="16" y2="27" />
    <path d="M16 9c-2-3-6-3-6-1s2 2 6 1z" />
    <path d="M16 9c2-3 6-3 6-1s-2 2-6 1z" />
    {/* lightning bolt accent */}
    <path d="M22 18l-3 4h2l-1 3 3-4h-2l1-3z" stroke="#CDFF65" fill="none" />
  </svg>
);

// ─────────────────────────────────────────────────────────
// S · 03  Club App — Operator Icons  (32 × 32 px)
// ─────────────────────────────────────────────────────────

export const IconDashboard = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <rect x="18" y="5" width="9" height="9" rx="1.5" stroke="#CDFF65" />
    <rect x="5" y="18" width="9" height="9" rx="1.5" />
    <rect x="18" y="18" width="9" height="9" rx="1.5" />
  </svg>
);

export const IconCourtBookings = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <rect x="5" y="7" width="22" height="18" rx="1.5" />
    <line x1="16" y1="7" x2="16" y2="25" stroke="#CDFF65" />
    <line x1="5" y1="13" x2="27" y2="13" />
    <line x1="5" y1="19" x2="27" y2="19" />
  </svg>
);

export const IconPlayers = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <circle cx="12" cy="11" r="3.5" />
    <path d="M5 24c.6-3.2 3.2-5 7-5s6.4 1.8 7 5" />
    <circle cx="22" cy="9" r="3" stroke="#CDFF65" />
    <path d="M20 16.5c3 0 5.5 1.5 6.5 4.5" stroke="#CDFF65" />
  </svg>
);

export const IconMemberships = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <rect x="7" y="10" width="18" height="13" rx="2" stroke="#CDFF65" />
    <path d="M9 8h16a2 2 0 0 1 2 2" />
    <path d="M11 5h14a2 2 0 0 1 2 2" />
    <line x1="11" y1="16" x2="21" y2="16" />
    <line x1="11" y1="19" x2="17" y2="19" />
  </svg>
);

export const IconStaff = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <circle cx="14" cy="10" r="4" />
    <path d="M6 25c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    <circle cx="23" cy="21" r="4.5" stroke="#CDFF65" />
    <path d="M21 21l1.5 1.5L25 20" stroke="#CDFF65" />
  </svg>
);

export const IconRevenue = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    {/* trend line accent */}
    <path d="M5 23l6-6 4 4 8-9" stroke="#CDFF65" />
    <path d="M19 12h4v4" />
    {/* currency symbol */}
    <path d="M9 9c0-1.5 1.2-2.5 2.8-2.5s2.7 1 2.7 2.5M8 14h6M9 10v3.5c0 1 .3 1.5 1 1.5h3" />
  </svg>
);

export const IconAnalytics = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <path d="M16 6a10 10 0 1 0 10 10H16V6z" />
    <path d="M19 5a8 8 0 0 1 8 8h-8V5z" stroke="#CDFF65" />
  </svg>
);

export const IconEvents = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <line x1="11" y1="4" x2="11" y2="18" />
    <path d="M11 5h9l-2 3 2 3h-9" stroke="#CDFF65" />
    <rect x="5" y="22" width="7" height="6" />
    <rect x="12" y="18" width="8" height="10" />
    <rect x="20" y="24" width="7" height="4" />
  </svg>
);

export const IconClubCoaching = ({ size = 32, ...props }: IconProps) => (
  <svg {...baseProps} width={size} height={size} viewBox="0 0 32 32" {...props}>
    <rect x="7" y="6" width="18" height="22" rx="2" />
    <rect x="12" y="4" width="8" height="4" rx="1" />
    {/* play button accent */}
    <path d="M14 15l6 3.5-6 3.5z" stroke="#CDFF65" fill="none" />
  </svg>
);
