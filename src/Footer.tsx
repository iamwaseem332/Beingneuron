import { Link } from "react-router-dom";
import { FOOTER_GROUPS } from "./content";
import { LogoMark } from "./icons";

export default function Footer() {
  return (
    <footer className="relative border-t border-paper/10 bg-ink-950 text-paper">
      <div className="bg-grid-dark pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <LogoMark className="text-pulse-400" />
              <span className="font-display text-lg font-medium tracking-tight">
                Being<span className="font-bold">Neuron</span>
              </span>
            </Link>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-paper/55">
              An AI research &amp; learning platform. Understand research. Explore ideas.
              Experiment with AI.
            </p>
            <div className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-paper/15 px-3.5 py-1.5 font-mono text-[10.5px] tracking-[0.18em] text-paper/60">
              <span className="ping-dot inline-block h-1.5 w-1.5 rounded-full bg-pulse-400" />
              PHASE 01 — FOUNDATION
            </div>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-paper/40">
                {group.title}
              </h3>
              <ul className="mt-5 space-y-3">
                {group.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="link-line text-sm text-paper/70 transition-colors hover:text-pulse-300"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-paper/10 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] tracking-wide text-paper/40">
            © 2026 BeingNeuron · Research · Learning · Experimentation
          </p>
          <p className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-paper/40">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-pulse-400" />
            interface preview — no data leaves your browser
          </p>
        </div>
      </div>
    </footer>
  );
}
