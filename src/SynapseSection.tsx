import { useState } from "react";
import { usePrefersReducedMotion } from "./hooks";
import { ButtonLink, Eyebrow, Reveal, Tag } from "./ui";
import { IconCheck } from "./icons";

type Passage = { id: string; sec: string; text: string };
type GNode = { id: string; pid: string; x: number; y: number; label: string; type: string };

const PASSAGES: Passage[] = [
  {
    id: "claim",
    sec: "§1",
    text: "Reward-timing signals reshape synaptic weights within a 40 ms window.",
  },
  {
    id: "method",
    sec: "§3",
    text: "Spiking activity was recorded from 212 neurons across prefrontal slices.",
  },
  {
    id: "evidence",
    sec: "§4",
    text: "The effect held in 9 of 11 trials (p < 0.01, paired t-test).",
  },
  {
    id: "concept",
    sec: "§2",
    text: "Eligibility traces bridge the delay between spike and reward.",
  },
  {
    id: "gap",
    sec: "§5",
    text: "Whether the mechanism extends to in-vivo circuits remains open.",
  },
];

const NODES: GNode[] = [
  { id: "n-claim", pid: "claim", x: 230, y: 62, label: "Central claim", type: "CLAIM" },
  { id: "n-method", pid: "method", x: 88, y: 168, label: "Methodology", type: "METHOD" },
  { id: "n-evidence", pid: "evidence", x: 372, y: 152, label: "Evidence", type: "EVIDENCE" },
  { id: "n-concept", pid: "concept", x: 306, y: 270, label: "Key concept", type: "CONCEPT" },
  { id: "n-gap", pid: "gap", x: 116, y: 284, label: "Open question", type: "GAP" },
];

const EDGES: [string, string][] = [
  ["n-claim", "n-method"],
  ["n-claim", "n-evidence"],
  ["n-method", "n-concept"],
  ["n-evidence", "n-concept"],
  ["n-claim", "n-gap"],
  ["n-method", "n-gap"],
];

const FACETS = [
  "Concepts & relationships",
  "Claims & conclusions",
  "Methodology maps",
  "Evidence trails",
];

const FIELDS = [
  "AI",
  "Biology",
  "Medicine",
  "Physics",
  "Chemistry",
  "Psychology",
  "Economics",
  "CompSci",
  "Neuroscience",
  "+ any field",
];

export default function SynapseSection() {
  const [active, setActive] = useState<string | null>("evidence");
  const reduced = usePrefersReducedMotion();

  const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const hotNode = NODES.find((n) => n.pid === active);

  return (
    <section id="synapse" className="relative scroll-mt-20 overflow-hidden bg-paper py-12 lg:py-14">
      <div className="bg-grid-light absolute inset-0 opacity-70" />
      <div className="absolute -left-52 top-10 h-[540px] w-[540px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.1),transparent_62%)]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-10">
          {/* copy */}
          <div className="lg:col-span-5">
            <Reveal>
              <Eyebrow className="text-pulse-600 text-xs">Synapse · Research Intelligence</Eyebrow>
              <h2 className="mt-2 font-display text-2xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-3xl">
                See how research ideas connect.
              </h2>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">
                Upload a research paper and transform it into an interactive knowledge graph.
                Explore concepts, relationships, claims, methodology, and evidence instead of
                reading a paper as a wall of text.
              </p>
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">
                  Domain-agnostic — one engine, any field
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {FIELDS.map((f) => (
                    <Tag key={f} className="text-[10px]">{f}</Tag>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={280}>
              <ul className="mt-4 space-y-1.5">
                {FACETS.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[12px] text-ink-700">
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-pulse-100 text-pulse-600">
                      <IconCheck size={9} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={360}>
              <div className="mt-5">
                <ButtonLink to="/synapse" variant="dark" arrow className="text-xs px-3.5 py-2">
                  Explore Synapse
                </ButtonLink>
              </div>
            </Reveal>
          </div>

          {/* interactive visual: paper ↔ graph */}
          <div className="lg:col-span-7">
            <Reveal delay={180}>
              <div className="overflow-hidden rounded-md border border-ink-900/12 bg-paper-card shadow-[0_20px_50px_-25px_rgba(6,15,24,0.35)]">
                <div className="flex items-center justify-between border-b border-ink-900/10 px-2.5 py-1.5">
                  <p className="font-mono text-[8.5px] tracking-[0.16em] text-ink-500">
                    SYNAPSE / ANALYSIS PREVIEW
                  </p>
                  <Tag className="text-[10px]">neuroscience · illustrative</Tag>
                </div>

                <div className="grid md:grid-cols-5">
                  {/* source pane */}
                  <div className="border-b border-ink-900/10 p-2.5 md:col-span-2 md:border-b-0 md:border-r">
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-ink-400">
                      Source — excerpts
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {PASSAGES.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseEnter={() => setActive(p.id)}
                          onFocus={() => setActive(p.id)}
                          onClick={() => setActive(p.id)}
                          className={`w-full rounded-sm border-l-2 px-2 py-1 text-left text-[10.5px] leading-snug transition-all duration-300 ${
                            active === p.id
                              ? "border-pulse-500 bg-pulse-100/80 text-ink-900"
                              : "border-transparent text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-700"
                          }`}
                        >
                          <span className="mr-1.5 font-mono text-[8.5px] text-pulse-600">{p.sec}</span>
                          {p.text}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* graph pane */}
                  <div className="relative p-1.5 md:col-span-3">
                    <svg viewBox="0 0 460 340" className="h-auto w-full" role="img" aria-label="Interactive knowledge graph preview">
                      <defs>
                        <pattern id="syn-grid" width="34" height="34" patternUnits="userSpaceOnUse">
                          <path d="M34 0H0v34" fill="none" stroke="rgba(11,26,38,0.05)" strokeWidth="1" />
                        </pattern>
                      </defs>
                      <rect width="460" height="340" fill="url(#syn-grid)" />

                      {EDGES.map(([a, b]) => {
                        const na = nodeById[a];
                        const nb = nodeById[b];
                        const hot = hotNode && (a === hotNode.id || b === hotNode.id);
                        return (
                          <line
                            key={`${a}-${b}`}
                            x1={na.x}
                            y1={na.y}
                            x2={nb.x}
                            y2={nb.y}
                            stroke={hot ? "var(--color-pulse-500)" : "rgba(11,26,38,0.14)"}
                            strokeWidth={hot ? 1.8 : 1}
                            className={hot && !reduced ? "edge-flow" : ""}
                            style={{ transition: "stroke .3s ease" }}
                          />
                        );
                      })}

                      {NODES.map((n) => {
                        const hot = hotNode?.id === n.id;
                        return (
                          <g
                            key={n.id}
                            transform={`translate(${n.x} ${n.y})`}
                            onMouseEnter={() => setActive(n.pid)}
                            onClick={() => setActive(n.pid)}
                            style={{ cursor: "pointer" }}
                          >
                            <circle
                              r={hot ? 22 : 17}
                              fill={hot ? "var(--color-pulse-100)" : "var(--color-paper-card)"}
                              stroke={hot ? "var(--color-pulse-500)" : "rgba(11,26,38,0.22)"}
                              strokeWidth={hot ? 1.8 : 1.2}
                              style={{ transition: "all .3s ease" }}
                            />
                            <circle r={hot ? 5.5 : 4} fill={hot ? "var(--color-pulse-500)" : "var(--color-ink-700)"} style={{ transition: "all .3s ease" }} />
                            <text
                              y="-28"
                              textAnchor="middle"
                              fontFamily="var(--font-mono)"
                              fontSize="8"
                              letterSpacing="1.6"
                              fill={hot ? "var(--color-pulse-600)" : "rgba(65,97,122,0.75)"}
                            >
                              {n.type}
                            </text>
                            <text
                              y="36"
                              textAnchor="middle"
                              fontFamily="var(--font-mono)"
                              fontSize="9.5"
                              fill={hot ? "var(--color-ink-900)" : "rgba(65,97,122,0.9)"}
                            >
                              {n.label}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-ink-900/10 px-2.5 py-1.5">
                  <p className="font-mono text-[8.5px] tracking-wide text-ink-400">
                    hover a node — the source passage highlights
                  </p>
                  <p className="font-mono text-[8.5px] tracking-wide text-pulse-600">
                    evidence-linked 5/5
                  </p>
                </div>
              </div>
            </Reveal>
            <Reveal delay={280}>
              <p className="mt-2.5 font-mono text-[9.5px] tracking-wide text-ink-400">
                * Illustrative excerpt. Real analysis arrives with the Synapse engine — Phase 2.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
