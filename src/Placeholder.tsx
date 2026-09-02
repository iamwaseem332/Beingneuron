import { useParams, Link } from "react-router-dom";
import { PLACEHOLDERS } from "./content";
import { LogoMark } from "./icons";
import { useScramble } from "./hooks";

export default function PlaceholderPage() {
  const { slug } = useParams<{ slug: string }>();
  const copy = slug ? PLACEHOLDERS[slug] : undefined;

  const name = copy?.name ?? "Not found";
  const title = useScramble(copy ? copy.name.toUpperCase() : "404 · UNMAPPED", 250);

  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-ink-950 px-5 pb-20 pt-28 text-paper sm:px-8">
      <div className="bg-grid-dark absolute inset-0" />
      <div className="absolute left-1/2 top-1/2 h-[560px] w-[860px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(18,163,146,0.1),transparent_62%)]" />

      <div className="relative mx-auto w-full max-w-2xl">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <LogoMark className="text-pulse-400" />
          <span className="font-display text-[15px] font-medium tracking-tight">
            Being<span className="font-bold">Neuron</span>
          </span>
        </Link>

        <div className="mt-8 overflow-hidden rounded-xl border border-paper/12 bg-ink-900/70 shadow-[0_40px_90px_-45px_rgba(0,0,0,0.9)] backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-paper/10 px-5 py-3">
            <p className="font-mono text-[10.5px] tracking-[0.2em] text-paper/45">
              MODULE REGISTRY — {copy?.code ?? "···"}
            </p>
            <span className="flex items-center gap-2 rounded-full border border-signal-400/40 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-signal-300">
              <span className="anim-breathe inline-block h-1.5 w-1.5 rounded-full bg-signal-400" />
              standby
            </span>
          </div>

          <div className="p-7 sm:p-9">
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              <span className="text-pulse-300">{title}</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-paper/65">
              {copy?.desc ??
                "This route isn't mapped in the current phase. The modules below cover everything that exists so far."}
            </p>

            {copy && (
              <div className="mt-7 space-y-2 border-t border-paper/10 pt-6 font-mono text-[11.5px] tracking-wide text-paper/50">
                <p>
                  <span className="text-pulse-300">scope</span> ··· {copy.scope}
                </p>
                <p>
                  <span className="text-pulse-300">phase</span> ··· 02+ (foundation is live now)
                </p>
                <p>
                  <span className="text-pulse-300">deps</span> ···· auth · analysis engine · storage
                </p>
              </div>
            )}

            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                to="/"
                className="rounded-full bg-pulse-400 px-6 py-3 font-display text-[14.5px] font-semibold text-ink-950 transition-all duration-300 hover:bg-pulse-300 active:scale-[0.98]"
              >
                Back to home
              </Link>
              <Link
                to="/signup"
                className="rounded-full border border-paper/30 px-6 py-3 font-display text-[14.5px] font-semibold text-paper transition-all duration-300 hover:border-paper hover:bg-paper hover:text-ink-950"
              >
                Get Started
              </Link>
            </div>
          </div>

          <div className="border-t border-paper/10 px-5 py-3">
            <p className="font-mono text-[10px] tracking-wide text-paper/35">
              the interface you're standing on is Phase 1 — engines arrive next
            </p>
          </div>
        </div>

        {/* quick routes to live modules */}
        <div className="mt-6 flex flex-wrap gap-2.5">
          {[
            ["Synapse preview", "/synapse"],
            ["NeuroSurgery preview", "/neurosurgery"],
            ["Pricing", "/pricing"],
            ["Login", "/login"],
          ].map(([label, to]) => (
            <Link
              key={to}
              to={to}
              className="rounded-full border border-paper/15 px-4 py-1.5 font-mono text-[11px] tracking-wide text-paper/60 transition-all duration-300 hover:border-pulse-300 hover:text-pulse-300"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
