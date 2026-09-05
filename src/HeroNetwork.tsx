import { useMemo, useState } from "react";
import { usePrefersReducedMotion } from "./hooks";

type Node = {
  id: string;
  x: number;
  y: number;
  label: string;
  type: string;
  meta: string[];
};

const NODES: Node[] = [
  {
    id: "paper",
    x: 100,
    y: 255,
    label: "Source paper",
    type: "DOC",
    meta: ["origin · uploaded PDF", "sections mapped · 6", "status · ingested"],
  },
  {
    id: "claim",
    x: 300,
    y: 105,
    label: "Central claim",
    type: "CLAIM",
    meta: ["confidence · 0.94", "linked nodes · 4", "source · §1 abstract"],
  },
  {
    id: "method",
    x: 285,
    y: 345,
    label: "Methodology",
    type: "METHOD",
    meta: ["design · controlled", "n · 212 units", "source · §3 methods"],
  },
  {
    id: "evidence",
    x: 505,
    y: 235,
    label: "Evidence",
    type: "EVIDENCE",
    meta: ["trials · 9 of 11", "p · < 0.01", "source · §4 results"],
  },
  {
    id: "concept",
    x: 470,
    y: 430,
    label: "Key concept",
    type: "CONCEPT",
    meta: ["citations · 18", "domain · neuroscience", "cross-paper · yes"],
  },
  {
    id: "gap",
    x: 520,
    y: 75,
    label: "Open question",
    type: "GAP",
    meta: ["flagged · authors", "follow-ups · 2", "source · §5 discussion"],
  },
];

const EDGES: [string, string][] = [
  ["paper", "claim"],
  ["paper", "method"],
  ["claim", "evidence"],
  ["method", "evidence"],
  ["evidence", "concept"],
  ["claim", "gap"],
  ["method", "concept"],
];

export default function HeroNetwork() {
  const [hovered, setHovered] = useState<string | null>(null);
  const reduced = usePrefersReducedMotion();
  const byId = useMemo(() => Object.fromEntries(NODES.map((n) => [n.id, n])), []);
  const active = hovered ? byId[hovered] : null;

  const pulses: { path: string; dur: string; begin: string }[] = [
    { path: "M100 255 L300 105", dur: "3.4s", begin: "0s" },
    { path: "M285 345 L505 235", dur: "4.1s", begin: "1.2s" },
    { path: "M300 105 L520 75", dur: "3.8s", begin: "2.1s" },
    { path: "M505 235 L470 430", dur: "3.2s", begin: "0.6s" },
  ];

  return (
    <div className="relative overflow-hidden rounded-lg border border-paper/12 bg-ink-900/70 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.8)] backdrop-blur-sm">
      {/* title bar */}
      <div className="flex items-center justify-between border-b border-paper/10 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-600" />
          <span className="h-1.5 w-1.5 rounded-full bg-ink-600" />
          <span className="h-1.5 w-1.5 rounded-full bg-pulse-400/80" />
        </div>
        <p className="font-mono text-[9px] tracking-[0.16em] text-paper/50">
          SYNAPSE — LIVE GRAPH PREVIEW
        </p>
        <p className="font-mono text-[9px] text-paper/40">v0.1</p>
      </div>

      <div className="relative">
        <svg viewBox="0 0 640 420" className="h-auto w-full" role="img" aria-label="Preview of a research knowledge graph">
          <defs>
            <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0v40" fill="none" stroke="rgba(242,244,239,0.045)" strokeWidth="1" />
            </pattern>
            <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(18,163,146,0.12)" />
              <stop offset="100%" stopColor="rgba(18,163,146,0)" />
            </radialGradient>
          </defs>
          <rect width="640" height="420" fill="url(#hero-grid)" />
          <rect width="640" height="420" fill="url(#hero-glow)" />

          {/* edges */}
          {EDGES.map(([a, b]) => {
            const na = byId[a];
            const nb = byId[b];
            const isHot = hovered !== null && (a === hovered || b === hovered);
            return (
              <g key={`${a}-${b}`}>
                <line
                  x1={na.x}
                  y1={na.y * 0.72 + 60}
                  x2={nb.x}
                  y2={nb.y * 0.72 + 60}
                  stroke={isHot ? "var(--color-pulse-400)" : "rgba(139,164,180,0.28)"}
                  strokeWidth={isHot ? 1.8 : 1}
                  className={isHot ? "edge-flow" : ""}
                  style={{ transition: "stroke .3s ease" }}
                />
              </g>
            );
          })}

          {/* signal pulses traveling between nodes */}
          {!reduced &&
            pulses.map((p, i) => (
              <circle key={i} r="3" fill="var(--color-pulse-300)" opacity="0.9">
                <animateMotion dur={p.dur} begin={p.begin} repeatCount="indefinite" path={p.path.replace(/(\d+) (\d+)/g, (_, x, y) => `${x} ${parseFloat(y) * 0.72 + 60}`)} />
              </circle>
            ))}

          {/* nodes */}
          {NODES.map((n) => {
            const hot = hovered === n.id;
            const connected =
              hovered !== null && EDGES.some(([a, b]) => (a === hovered && b === n.id) || (b === hovered && a === n.id));
            return (
              <g
                key={n.id}
                transform={`translate(${n.x} ${n.y * 0.72 + 60})`}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  r={hot ? 26 : 22}
                  fill={hot ? "rgba(53,196,174,0.14)" : "rgba(15,33,48,0.9)"}
                  stroke={hot || connected ? "var(--color-pulse-400)" : "rgba(139,164,180,0.35)"}
                  strokeWidth={hot ? 1.6 : 1}
                  style={{ transition: "all .3s ease" }}
                />
                <circle
                  r={hot ? 6.5 : 5.5}
                  fill={hot || connected ? "var(--color-pulse-300)" : "var(--color-paper)"}
                  style={{ transition: "all .3s ease" }}
                />
                <text
                  y="-34"
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize="8.5"
                  letterSpacing="2"
                  fill={hot ? "var(--color-pulse-300)" : "rgba(124,228,208,0.65)"}
                >
                  {n.type}
                </text>
                <text
                  y="40"
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize="10"
                  fill={hot ? "var(--color-paper)" : "rgba(242,244,239,0.72)"}
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* detail readout — in flow, never overlaps the graph */}
      <div className="border-t border-paper/10 px-2.5 py-2">
        {active ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="font-mono text-[9px] tracking-[0.2em] text-pulse-300">{active.type}</p>
            <p className="font-display text-xs font-semibold text-paper">{active.label}</p>
            {active.meta.map((m) => (
              <p key={m} className="font-mono text-[9px] tracking-wide text-paper/50">
                {m}
              </p>
            ))}
          </div>
        ) : (
          <p className="font-mono text-[9.5px] tracking-wide text-paper/40">
            <span className="text-pulse-300/80">readout</span> — hover a node · every concept stays
            linked to its source in the paper
          </p>
        )}
      </div>

      {/* footer strip */}
      <div className="flex items-center justify-between border-t border-paper/10 px-2.5 py-1.5">
        <p className="font-mono text-[9px] tracking-wide text-paper/45">
          nodes 6 · edges 7 · domain neuroscience
        </p>
        <p className="flex items-center gap-2 font-mono text-[9px] tracking-wide text-pulse-300/80">
          <span className="anim-breathe inline-block h-1 w-1 rounded-full bg-pulse-400" />
          evidence-linked
        </p>
      </div>
    </div>
  );
}
