/**
 * A claw holding a card, drawn in SVG as a stand-in for a photographic render. It only uses
 * the hero text color and translucent shades, so it follows every theme. Decoration only.
 */
export function HeroIllustration({ className }: { className?: string | undefined }) {
  const shade = (opacity: number) => `rgb(0 0 0 / ${opacity})`
  return (
    <svg
      className={className}
      viewBox="0 0 320 250"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* Mount and rod */}
      <rect x="104" y="0" width="112" height="26" rx="8" fill={shade(0.45)} />
      <rect x="120" y="22" width="80" height="14" rx="4" fill={shade(0.35)} />
      <rect x="148" y="34" width="24" height="74" rx="6" fill={shade(0.5)} />
      {/* Joint */}
      <circle cx="160" cy="112" r="22" fill={shade(0.55)} />
      <circle cx="160" cy="112" r="9" fill="currentColor" opacity="0.5" />
      {/* Arms */}
      <path
        d="M142 122 L84 150 L74 190"
        fill="none"
        stroke={shade(0.5)}
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M178 122 L236 150 L246 190"
        fill="none"
        stroke={shade(0.5)}
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="84" cy="150" r="8" fill="currentColor" opacity="0.45" />
      <circle cx="236" cy="150" r="8" fill="currentColor" opacity="0.45" />
      {/* Card */}
      <g transform="rotate(-4 160 190)">
        <rect x="76" y="150" width="168" height="100" rx="12" fill={shade(0.62)} />
        <rect x="92" y="170" width="30" height="24" rx="5" fill="currentColor" opacity="0.85" />
        <path d="M130 250 L186 150 H212 L156 250Z" fill="currentColor" opacity="0.14" />
        <rect x="92" y="214" width="64" height="6" rx="3" fill="currentColor" opacity="0.5" />
        <rect x="92" y="226" width="40" height="6" rx="3" fill="currentColor" opacity="0.35" />
      </g>
      {/* Fingertips */}
      <circle cx="74" cy="190" r="9" fill={shade(0.6)} />
      <circle cx="246" cy="190" r="9" fill={shade(0.6)} />
    </svg>
  )
}
