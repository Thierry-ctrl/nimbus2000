type Props = { className?: string };

export function KigaliSkyline({ className }: Props) {
  return (
    <svg
      viewBox="0 0 480 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Illustration of Kigali landmarks"
    >
      <defs>
        <clipPath id="kigali-frame">
          <rect x="0" y="0" width="480" height="200" rx="20" />
        </clipPath>
      </defs>

      <g clipPath="url(#kigali-frame)">
        {/* Sky block */}
        <rect width="480" height="200" fill="hsl(var(--brand-mint))" />

        {/* Cobalt left panel — abstract street network */}
        <rect width="160" height="200" fill="hsl(var(--brand-cobalt))" />
        <g
          stroke="hsl(var(--brand-cloud) / 0.6)"
          strokeWidth="1.5"
          fill="none"
        >
          <path d="M10 40 L70 40 L70 90 L130 90" />
          <path d="M30 10 L30 70 L100 70 L100 160" />
          <path d="M150 30 L120 30 L120 130 L60 130 L60 190" />
        </g>
        <g fill="hsl(var(--brand-cloud))">
          <circle cx="70" cy="40" r="3" />
          <circle cx="100" cy="70" r="3" />
          <circle cx="60" cy="130" r="3" />
          <circle cx="120" cy="130" r="3" />
        </g>

        {/* Hills of Kigali (rolling) */}
        <path
          d="M160 140 Q210 95 270 130 T380 120 T480 135 L480 200 L160 200 Z"
          fill="hsl(var(--brand-navy))"
        />
        <path
          d="M160 165 Q220 130 290 155 T420 150 T480 160 L480 200 L160 200 Z"
          fill="hsl(var(--brand-ink))"
          opacity="0.85"
        />

        {/* Kigali Convention Centre dome (right side) */}
        <g transform="translate(330 70)">
          {/* dome base */}
          <path
            d="M0 80 A60 55 0 0 1 120 80 Z"
            fill="hsl(var(--brand-cloud))"
          />
          {/* crisscross lattice */}
          <g
            stroke="hsl(var(--brand-cobalt))"
            strokeWidth="1.2"
            fill="none"
            opacity="0.85"
          >
            <path d="M10 78 Q60 30 110 78" />
            <path d="M20 78 Q60 38 100 78" />
            <path d="M30 78 Q60 46 90 78" />
            <path d="M0 80 L120 80" />
            <path d="M15 65 L105 65" />
            <path d="M30 50 L90 50" />
            <path d="M45 36 L75 36" />
            {/* diagonal mesh */}
            <path d="M5 80 L60 30 L115 80" />
            <path d="M30 80 L60 40 L90 80" />
          </g>
          {/* dome cap */}
          <circle cx="60" cy="28" r="3.5" fill="hsl(var(--brand-navy))" />
          <line
            x1="60"
            y1="28"
            x2="60"
            y2="14"
            stroke="hsl(var(--brand-navy))"
            strokeWidth="1.5"
          />
        </g>

        {/* High-rise tower (BPR-ish) */}
        <g transform="translate(220 60)">
          <rect width="36" height="90" fill="hsl(var(--brand-cloud))" />
          <rect
            x="36"
            width="6"
            height="90"
            fill="hsl(var(--brand-navy))"
            opacity="0.4"
          />
          {Array.from({ length: 7 }).map((_, i) => (
            <rect
              key={i}
              x="6"
              y={6 + i * 12}
              width="24"
              height="6"
              fill="hsl(var(--brand-cobalt))"
              opacity="0.8"
            />
          ))}
          <rect x="14" y="-10" width="8" height="14" fill="hsl(var(--brand-cloud))" />
        </g>

        {/* Sun / moon */}
        <circle cx="430" cy="40" r="14" fill="hsl(var(--brand-cloud))" />

        {/* Carpool sedan (foreground) */}
        <g transform="translate(180 150)">
          <path
            d="M0 22 Q4 8 24 6 L60 4 Q78 4 86 14 L104 18 Q114 20 116 28 L116 34 Q116 38 110 38 L6 38 Q0 38 0 32 Z"
            fill="hsl(var(--brand-ink))"
          />
          <path
            d="M22 8 L60 6 Q72 6 78 14 L86 18 L24 18 Z"
            fill="hsl(var(--brand-cobalt))"
            opacity="0.9"
          />
          <circle cx="28" cy="38" r="6" fill="hsl(var(--brand-cloud))" />
          <circle cx="28" cy="38" r="3" fill="hsl(var(--brand-ink))" />
          <circle cx="92" cy="38" r="6" fill="hsl(var(--brand-cloud))" />
          <circle cx="92" cy="38" r="3" fill="hsl(var(--brand-ink))" />
        </g>

        {/* Road line */}
        <line
          x1="0"
          y1="195"
          x2="480"
          y2="195"
          stroke="hsl(var(--brand-cloud))"
          strokeWidth="2"
          strokeDasharray="10 8"
          opacity="0.7"
        />
      </g>
    </svg>
  );
}

export function KigaliMark({ className }: Props) {
  return (
    <svg
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="KigaliWeShare logo mark"
    >
      <rect width="40" height="40" rx="10" fill="hsl(var(--brand-ink))" />
      {/* dome */}
      <path
        d="M8 28 A12 11 0 0 1 32 28 Z"
        fill="hsl(var(--brand-mint))"
      />
      <g
        stroke="hsl(var(--brand-ink))"
        strokeWidth="0.9"
        fill="none"
        opacity="0.7"
      >
        <path d="M10 28 Q20 16 30 28" />
        <path d="M14 28 Q20 20 26 28" />
        <path d="M8 28 L32 28" />
      </g>
      <circle cx="20" cy="17" r="1.6" fill="hsl(var(--brand-cobalt))" />
    </svg>
  );
}
