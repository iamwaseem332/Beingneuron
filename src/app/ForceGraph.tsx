/**
 * Phase 7 — interactive force-directed graph renderer.
 *
 * Deliberately dependency-free: a compact force simulation + SVG rendering,
 * lazy-loaded inside the graph route chunk so no graph library is ever
 * loaded globally. Supports zoom (wheel, cursor-anchored), pan, node drag,
 * node/edge selection, keyboard focus and animated reheat.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { usePrefersReducedMotion } from "../hooks";
import { NODE_META, RELATION_META, type GraphEdge, type GraphNode, type NodeShape } from "./graphModel";

type SimNode = { id: string; x: number; y: number; vx: number; vy: number; r: number };
type Transform = { x: number; y: number; k: number };

const BASE_LINK_DIST = 60;
const BASE_CHARGE = -800;
const GRAVITY = 0.08;
const DAMPING = 0.85;
const ALPHA_DECAY = 0.026;

export type ForceGraphProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  highlightIds: Set<string> | null; // search matches (null = no search)
  focusRequest: { id: string; nonce: number } | null;
  resetNonce: number;
  /** Imperative zoom: { factor: 1.3 | 0.75 | … , nonce } — applied around the viewport center. */
  zoomRequest?: { factor: number; nonce: number } | null;
  /** Use static layout like hero section (no force simulation) */
  staticLayout?: boolean;
  /** Number of visible nodes - used to adjust physics for congestion */
  nodeCount?: number;
  /** Fullscreen mode - spreads nodes apart for better clarity */
  isFullscreen?: boolean;
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
};

function radiusOf(n: GraphNode): number {
  return 8 + n.importance * 11 + (n.evidence_references.length > 2 ? 1.5 : 0);
}

function shapePath(shape: NodeShape, r: number): string {
  switch (shape) {
    case "diamond":
      return `M0 ${-r} L${r} 0 L0 ${r} L${-r} 0 Z`;
    case "hex":
      return `M${-r} 0 L${-r / 2} ${-r * 0.87} L${r / 2} ${-r * 0.87} L${r} 0 L${r / 2} ${r * 0.87} L${-r / 2} ${r * 0.87} Z`;
    case "tri":
      return `M0 ${-r} L${r * 0.9} ${r * 0.72} L${-r * 0.9} ${r * 0.72} Z`;
    case "square":
      return `M${-r * 0.82} ${-r * 0.82} H${r * 0.82} V${r * 0.82} H${-r * 0.82} Z`;
    default:
      return "";
  }
}

const TYPE_ORDER: GraphNode["type"][] = [
  "research_question", "problem", "concept", "method", "model", "dataset",
  "experiment", "result", "claim", "limitation", "conclusion",
];

export default function ForceGraph({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  highlightIds,
  focusRequest,
  resetNonce,
  zoomRequest,
  onSelectNode,
  onSelectEdge,
  staticLayout = false,
  nodeCount,
  isFullscreen = false,
}: ForceGraphProps) {
  const reduced = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<Map<string, SimNode>>(new Map());
  const alphaRef = useRef(0);
  const rafRef = useRef(0);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [t, setT] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const tRef = useRef(t);
  tRef.current = t;
  const [, setFrame] = useState(0); // re-render tick during simulation
  const dragRef = useRef<{ mode: "pan" | "node"; id?: string; px: number; py: number; moved: boolean } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  /* ---------- container size ---------- */
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: Math.max(320, r.width), h: Math.max(320, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------- simulation ---------- */
  const seedAndSync = () => {
    const sim = simRef.current;
    const existing = new Set<string>();
    nodes.forEach((n, i) => {
      existing.add(n.id);
      if (!sim.has(n.id)) {
        if (staticLayout) {
          // Hero section static layout - fixed positions in a circular pattern
          const angle = (i / nodes.length) * Math.PI * 2;
          const ring = 140 + (i % 3) * 40;
          sim.set(n.id, {
            id: n.id,
            x: Math.cos(angle) * ring + size.w / 2,
            y: Math.sin(angle) * ring + size.h / 2,
            vx: 0,
            vy: 0,
            r: 6, // Exact hero dot size
          });
        } else {
          const angle = (TYPE_ORDER.indexOf(n.type) / TYPE_ORDER.length) * Math.PI * 2 + (i % 5) * 0.35;
          const ring = 120 + (i % 4) * 70;
          sim.set(n.id, {
            id: n.id,
            x: Math.cos(angle) * ring + (Math.random() - 0.5) * 30,
            y: Math.sin(angle) * ring + (Math.random() - 0.5) * 30,
            vx: 0,
            vy: 0,
            r: radiusOf(n),
          });
        }
      } else {
        const s = sim.get(n.id)!;
        s.r = staticLayout ? 6 : radiusOf(n);
      }
    });
    for (const key of [...sim.keys()]) if (!existing.has(key)) sim.delete(key);
  };

  const tick = () => {
    const sim = simRef.current;
    const list = nodes.map((n) => sim.get(n.id)!).filter(Boolean);
    
    // Adjust physics based on node count and fullscreen mode
    // More nodes = smaller spacing for compact layout (normal mode)
    // Fullscreen mode = larger spacing for clarity
    const compactFactor = nodeCount && nodeCount > 25 ? Math.max(0.55, 1 - (nodeCount - 25) / 60) : 1;
    
    // Fullscreen spreads nodes apart significantly for better clarity in both overview and detailed modes
    const expandFactor = isFullscreen ? 3.5 : 1;
    const LINK_DIST = BASE_LINK_DIST * compactFactor * expandFactor;
    const CHARGE = BASE_CHARGE * compactFactor * expandFactor * 1.3;
    
    // repulsion (O(n²) — fine at graph scale)
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const f = CHARGE / d2;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }
    // springs
    for (const e of edges) {
      const a = sim.get(e.source);
      const b = sim.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = ((d - LINK_DIST) / d) * 0.055;
      a.vx += dx * f;
      a.vy += dy * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
    }
    // gravity + integrate
    for (const s of list) {
      s.vx -= s.x * GRAVITY * 0.02;
      s.vy -= s.y * GRAVITY * 0.02;
      s.vx *= DAMPING;
      s.vy *= DAMPING;
      s.x += s.vx * alphaRef.current;
      s.y += s.vy * alphaRef.current;
    }
  };

  const fitView = (animate: boolean) => {
    const sim = simRef.current;
    const pts = nodes.map((n) => sim.get(n.id)).filter(Boolean) as SimNode[];
    if (pts.length === 0) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - 60;
    const maxX = Math.max(...xs) + 60;
    const minY = Math.min(...ys) - 60;
    const maxY = Math.max(...ys) + 60;
    const k = Math.min(2.2, Math.max(0.28, Math.min(size.w / (maxX - minX), size.h / (maxY - minY)) * 0.92));
    const next = { k, x: size.w / 2 - ((minX + maxX) / 2) * k, y: size.h / 2 - ((minY + maxY) / 2) * k };
    if (!animate || reduced) {
      setT(next);
      return;
    }
    const from = { ...tRef.current };
    const start = performance.now();
    const dur = 480;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      setT({
        k: from.k + (next.k - from.k) * ease,
        x: from.x + (next.x - from.x) * ease,
        y: from.y + (next.y - from.y) * ease,
      });
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /* boot / data change */
  useEffect(() => {
    seedAndSync();
    // If static layout (hero mode), skip force simulation entirely
    if (staticLayout) {
      setFrame((f) => f + 1);
      fitView(false);
      return;
    }
    if (reduced) {
      alphaRef.current = 1;
      for (let i = 0; i < 320; i += 1) {
        alphaRef.current = Math.max(0.02, alphaRef.current * (1 - ALPHA_DECAY));
        tick();
      }
      alphaRef.current = 0;
      setFrame((f) => f + 1);
      fitView(false);
      return;
    }
    alphaRef.current = 0.95;
    cancelAnimationFrame(rafRef.current);
    const loop = () => {
      if (alphaRef.current > 0.006 && !dragRef.current) {
        alphaRef.current *= 1 - ALPHA_DECAY;
        tick();
        setFrame((f) => f + 1);
      } else if (dragRef.current) {
        tick();
        setFrame((f) => f + 1);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    const fitTimer = window.setTimeout(() => fitView(true), 700);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(fitTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, reduced, size.w, size.h, staticLayout]);

  /* Reheat simulation when fullscreen toggles to spread nodes apart */
  useEffect(() => {
    if (staticLayout || reduced) return;
    // Boost alpha to re-energize the simulation when entering fullscreen
    alphaRef.current = Math.max(alphaRef.current, 0.8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, staticLayout, reduced]);

  /* focus a node (from search) */
  useEffect(() => {
    if (!focusRequest) return;
    const s = simRef.current.get(focusRequest.id);
    if (!s) return;
    const k = Math.max(tRef.current.k, 1.1);
    setT({ k, x: size.w / 2 - s.x * k, y: size.h / 2 - s.y * k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce]);

  /* imperative zoom (toolbar +/−), anchored at the viewport center */
  useEffect(() => {
    if (!zoomRequest) return;
    setT((prev) => {
      const k = Math.min(3, Math.max(0.25, prev.k * zoomRequest.factor));
      const cx = size.w / 2;
      const cy = size.h / 2;
      return { k, x: cx - ((cx - prev.x) / prev.k) * k, y: cy - ((cy - prev.y) / prev.k) * k };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomRequest?.nonce]);

  /* reset */
  useEffect(() => {
    if (resetNonce > 0) fitView(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce]);

  /* ---------- wheel zoom (non-passive) ---------- */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setT((prev) => {
        const k = Math.min(3, Math.max(0.25, prev.k * Math.exp(-e.deltaY * 0.0016)));
        return { k, x: mx - ((mx - prev.x) / prev.k) * k, y: my - ((my - prev.y) / prev.k) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ---------- pointer interactions ---------- */
  const screenToWorld = (px: number, py: number) => {
    const cur = tRef.current;
    return { x: (px - cur.x) / cur.k, y: (py - cur.y) / cur.k };
  };

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    dragRef.current = { mode: "pan", px: e.clientX - rect.left, py: e.clientY - rect.top, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onNodePointerDown = (e: RPointerEvent<SVGGElement>, id: string) => {
    e.stopPropagation();
    const rect = svgRef.current!.getBoundingClientRect();
    dragRef.current = { mode: "node", id, px: e.clientX - rect.left, py: e.clientY - rect.top, moved: false };
    alphaRef.current = Math.max(alphaRef.current, 0.3);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const dx = px - d.px;
    const dy = py - d.py;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.mode === "pan") {
      setT((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    } else if (d.mode === "node" && d.id) {
      const w = screenToWorld(px, py);
      const s = simRef.current.get(d.id);
      if (s) {
        s.x = w.x;
        s.y = w.y;
        s.vx = 0;
        s.vy = 0;
        alphaRef.current = Math.max(alphaRef.current, 0.25);
      }
    }
    d.px = px;
    d.py = py;
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved && d.mode === "pan") {
      onSelectNode(null);
      onSelectEdge(null);
    }
    alphaRef.current = Math.max(alphaRef.current, 0.12);
  };

  /* ---------- render ---------- */
  const sim = simRef.current;
  const pos = (id: string) => sim.get(id);
  const isDimmed = (id: string) =>
    (highlightIds !== null && !highlightIds.has(id)) ||
    (selectedNodeId !== null && id !== selectedNodeId && !edges.some((e) => (e.source === selectedNodeId || e.target === selectedNodeId) && (e.source === id || e.target === id)));
  const showLabels = t.k > 0.55;

  // Create signal pulses for connected nodes (like hero)
  const pulses = useMemo(() => {
    if (reduced || edges.length === 0) return [];
    const pulseEdges: { path: string; dur: string; begin: string }[] = [];
    edges.forEach((e, i) => {
      const a = pos(e.source);
      const b = pos(e.target);
      if (a && b) {
        pulseEdges.push({
          path: `M${a.x} ${a.y} L${b.x} ${b.y}`,
          dur: `${3 + Math.random() * 2}s`,
          begin: `${(i * 0.6) % 3}s`,
        });
      }
    });
    return pulseEdges.slice(0, 4); // Limit to 4 pulses like hero
  }, [edges, reduced, sim]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-ink-900/70">
      {/* Title bar like hero */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between border-b border-paper/10 px-2.5 py-1.5 bg-ink-900/90 backdrop-blur-sm">
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
      
      {/* Grid background like hero */}
      <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0v40" fill="none" stroke="rgba(242,244,239,0.045)" strokeWidth="1" />
          </pattern>
          <radialGradient id="grid-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(18,163,146,0.08)" />
            <stop offset="100%" stopColor="rgba(18,163,146,0)" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
        <rect width="100%" height="100%" fill="url(#grid-glow)" />
      </svg>
      
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="relative block cursor-grab touch-none select-none active:cursor-grabbing mt-8"
        role="application"
        aria-label="Knowledge graph canvas — scroll to zoom, drag to pan, click nodes and edges to inspect"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          {(["teal", "amber", "steel", "paper"] as const).map((c) => (
            <marker
              key={c}
              id={`arrow-${c}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path
                d="M0 0 L10 5 L0 10 z"
                fill={
                  c === "teal" ? "var(--color-pulse-400)" : c === "amber" ? "var(--color-signal-400)" : c === "paper" ? "rgba(242,244,239,0.55)" : "#8fb0c6"
                }
              />
            </marker>
          ))}
        </defs>

        <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
          {/* edges */}
          {edges.map((e) => {
            const a = pos(e.source);
            const b = pos(e.target);
            if (!a || !b) return null;
            const meta = RELATION_META[e.kind];
            const selected = selectedEdgeId === e.id;
            const touches = selectedNodeId !== null && (e.source === selectedNodeId || e.target === selectedNodeId);
            const dim =
              (highlightIds !== null && !(highlightIds.has(e.source) && highlightIds.has(e.target))) ||
              (selectedNodeId !== null && !touches && !selected);
            const color = selected ? "var(--color-paper)" : meta.color;
            const markerGroup =
              meta.color.includes("signal") ? "amber" : meta.color.includes("pulse") ? "teal" : meta.color.includes("242,244,239") ? "paper" : "steel";
            return (
              <g key={e.id} opacity={dim ? 0.1 : selected || touches ? 1 : 0.62} style={{ transition: "opacity .25s ease" }}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={color}
                  strokeWidth={selected ? 2.2 : touches ? 1.8 : 1.1}
                  strokeDasharray={meta.dash ?? undefined}
                  markerEnd={`url(#arrow-${markerGroup})`}
                  style={{ transition: "stroke .25s ease" }}
                />
                {selected && !reduced && (
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-pulse-300)" strokeWidth="2.4" className="edge-flow" />
                )}
                {/* wide invisible hit area */}
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={14}
                  className="cursor-pointer"
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelectEdge(e.id);
                    onSelectNode(null);
                  }}
                />
                {(selected || (touches && t.k > 1.15)) && (
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 6}
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                    fontSize={10 / Math.max(t.k, 0.8)}
                    fill="var(--color-paper)"
                    stroke="var(--color-ink-950)"
                    strokeWidth={3 / t.k}
                    paintOrder="stroke"
                    style={{ pointerEvents: "none" }}
                  >
                    {meta.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* signal pulses traveling between nodes (like hero) */}
          {!reduced &&
            pulses.map((p, i) => (
              <circle key={i} r="3" fill="var(--color-pulse-300)" opacity="0.9">
                <animateMotion dur={p.dur} begin={p.begin} repeatCount="indefinite" path={p.path} />
              </circle>
            ))}

          {/* nodes - Hero section style: simple circles with inner dot */}
          {nodes.map((n) => {
            const s = pos(n.id);
            if (!s) return null;
            const selected = selectedNodeId === n.id;
            const hoveredNode = hovered === n.id;
            const dim = isDimmed(n.id);
            const r = 22; // Fixed radius like hero
            const labelVisible = showLabels || selected || hoveredNode || n.importance > 0.72;
            const isHot = hoveredNode || selected;
            return (
              <g
                key={n.id}
                transform={`translate(${s.x} ${s.y})`}
                opacity={dim ? 0.16 : 1}
                className={staticLayout ? "" : "cursor-pointer"}
                style={{ transition: "opacity .25s ease" }}
                onPointerDown={staticLayout ? undefined : (e) => onNodePointerDown(e, n.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!staticLayout && !dragRef.current?.moved) {
                    onSelectNode(n.id);
                    onSelectEdge(null);
                  }
                }}
                onPointerEnter={() => setHovered(n.id)}
                onPointerLeave={() => setHovered((h) => (h === n.id ? null : h))}
                role="button"
                aria-label={`${n.type}: ${n.label}`}
              >
                {/* Outer circle */}
                <circle
                  r={isHot ? 26 : 22}
                  fill={isHot ? "rgba(53,196,174,0.14)" : "rgba(15,33,48,0.9)"}
                  stroke={isHot ? "var(--color-pulse-400)" : "rgba(139,164,180,0.35)"}
                  strokeWidth={isHot ? 1.6 : 1}
                  style={{ transition: "all .3s ease" }}
                />
                {/* Inner dot */}
                <circle
                  r={isHot ? 6.5 : 5.5}
                  fill={isHot ? "var(--color-pulse-300)" : "var(--color-paper)"}
                  style={{ transition: "all .3s ease" }}
                />
                {/* Type label above */}
                {labelVisible && (
                  <text
                    y="-34"
                    textAnchor="middle"
                    fontFamily="var(--font-mono)"
                    fontSize="8.5"
                    letterSpacing="2"
                    fill={isHot ? "var(--color-pulse-300)" : "rgba(124,228,208,0.65)"}
                  >
                    {n.type.toUpperCase()}
                  </text>
                )}
                {/* Node label removed - details shown in inspector panel on click */}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Footer strip like hero */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between border-t border-paper/10 px-2.5 py-1.5 bg-ink-900/90 backdrop-blur-sm">
        <p className="font-mono text-[9px] tracking-wide text-paper/45">
          nodes {nodes.length} · edges {edges.length} · domain research
        </p>
        <p className="flex items-center gap-2 font-mono text-[9px] tracking-wide text-pulse-300/80">
          <span className="anim-breathe inline-block h-1 w-1 rounded-full bg-pulse-400" />
          evidence-linked
        </p>
      </div>
    </div>
  );
}
