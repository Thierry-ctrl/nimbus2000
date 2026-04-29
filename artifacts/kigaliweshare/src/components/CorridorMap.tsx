import { useMemo } from "react";

interface Neighborhood {
  id: string;
  name: string;
}

interface CorridorMapProps {
  neighborhoods: Neighborhood[];
  originId: string;
  destinationId: string;
}

// Static stylized layout: places neighborhoods on a circle around a Kigali
// "city centre" mark. Pure SVG, no real geo — explicitly a schematic.
export function CorridorMap({ neighborhoods, originId, destinationId }: CorridorMapProps) {
  const points = useMemo(() => {
    const W = 320;
    const H = 200;
    const cx = W / 2;
    const cy = H / 2;
    const rx = W / 2 - 30;
    const ry = H / 2 - 28;
    const n = neighborhoods.length || 1;
    return neighborhoods.map((nh, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      return {
        ...nh,
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry,
      };
    });
  }, [neighborhoods]);

  const origin = points.find((p) => p.id === originId);
  const dest = points.find((p) => p.id === destinationId);

  return (
    <svg
      viewBox="0 0 320 200"
      className="w-full h-auto rounded-lg border border-border bg-gradient-to-b from-primary/5 to-secondary/5"
      role="img"
      aria-label="Corridor schematic"
    >
      {/* horizon line */}
      <line x1="0" y1="170" x2="320" y2="170" stroke="currentColor" strokeOpacity="0.08" />
      {/* centre mark (Kigali CBD) */}
      <circle cx="160" cy="100" r="4" fill="hsl(var(--primary))" opacity="0.35" />
      <text
        x="160"
        y="118"
        textAnchor="middle"
        fontSize="9"
        fill="hsl(var(--muted-foreground))"
      >
        Kigali
      </text>

      {/* corridor line */}
      {origin && dest && (
        <g>
          <line
            x1={origin.x}
            y1={origin.y}
            x2={dest.x}
            y2={dest.y}
            stroke="hsl(var(--primary))"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="6 4"
          />
        </g>
      )}

      {/* neighborhood pins */}
      {points.map((p) => {
        const isOrigin = p.id === originId;
        const isDest = p.id === destinationId;
        const active = isOrigin || isDest;
        return (
          <g key={p.id}>
            <circle
              cx={p.x}
              cy={p.y}
              r={active ? 6 : 3}
              fill={
                isOrigin
                  ? "hsl(var(--primary))"
                  : isDest
                    ? "hsl(var(--secondary))"
                    : "hsl(var(--muted-foreground))"
              }
              opacity={active ? 1 : 0.4}
            />
            {active && (
              <text
                x={p.x}
                y={p.y - 10}
                textAnchor="middle"
                fontSize="9"
                fontWeight="600"
                fill="hsl(var(--foreground))"
              >
                {p.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
