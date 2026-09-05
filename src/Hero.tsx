import { DOMAINS } from "./content";
import { usePrefersReducedMotion, useScramble } from "./hooks";
import { ButtonLink, Reveal, StatusLine } from "./ui";
import { scrollToSection } from "./Nav";
import { NodeDot } from "./icons";
import HeroNetwork from "./HeroNetwork";

function DomainTicker() {
  const loop = [...DOMAINS, ...DOMAINS];
  return (
    <div className="relative border-t border-pulse-400/10">
      <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-hidden px-5 py-4 sm:px-8">
        <p className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-pulse-300/80 md:block">
          Domain-agnostic
        </p>
        <div className="relative flex-1 overflow-hidden">
          <div className="marquee-track items-center gap-9">
            {loop.map((d, i) => (
              <span
                key={`${d}-${i}`}
                className="flex items-center gap-9 font-mono text-[11.5px] uppercase tracking-[0.18em] text-paper/45"
              >
                {d}
                <NodeDot className="text-pulse-400/60" />
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-black to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-black to-transparent" />
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  const reduced = usePrefersReducedMotion();
  const line1 = useScramble("Understand research.", 250);
  const line2 = useScramble("Explore ideas.", 1050);
  const line3 = useScramble("Experiment with AI.", 1750);

  const go = (id: string) => () => scrollToSection(id, !reduced);

  return (
    <section className="relative overflow-hidden bg-black text-paper">
      {/* layered ambient background */}
      <div className="bg-grid-dark absolute inset-0" />
      <div className="absolute -right-40 -top-48 h-[820px] w-[820px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.2),transparent_62%)]" />
      <div className="absolute -bottom-64 -left-48 h-[700px] w-[700px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.15),transparent_65%)]" />

      {/* drifting deco nodes */}
      <div className="anim-floaty absolute left-[8%] top-32 hidden text-pulse-400/40 xl:block" style={{ animationDelay: "0.8s" }}>
        <NodeDot size={9} />
      </div>
      <div className="anim-floaty absolute right-[4%] top-[58%] hidden text-pulse-400/20 xl:block" style={{ animationDelay: "2.2s" }}>
        <NodeDot size={7} />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-16 sm:px-8 lg:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Reveal>
              <p className="flex items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.26em] text-pulse-300">
                <span className="inline-block h-[6px] w-[6px] rotate-45 bg-pulse-400" />
                AI Research &amp; Learning Platform
              </p>
            </Reveal>

            <h1 className="mt-5 font-display text-[2rem] font-bold leading-[1.05] tracking-tight sm:text-[2.8rem] xl:text-[3.2rem]">
              <span className="block">{line1}</span>
              <span className="block text-paper/85">{line2}</span>
              <span className="block text-pulse-300">{line3}</span>
            </h1>

            <Reveal delay={200}>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-paper/65">
                BeingNeuron is an interactive research and AI learning platform that helps you
                understand complex papers, visualize how ideas connect, and experiment with AI
                systems.
              </p>
            </Reveal>

            <Reveal delay={320}>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <ButtonLink variant="primary" onClick={go("products")} arrow>
                  Explore BeingNeuron
                </ButtonLink>
                <ButtonLink variant="outline-light" onClick={go("synapse")}>
                  Explore Research
                </ButtonLink>
              </div>
            </Reveal>

            <Reveal delay={430}>
              <div className="mt-8 space-y-2 border-t border-pulse-400/10 pt-4 text-paper/50">
                <StatusLine>
                  <span>synapse.engine — knowledge graphs · standby</span>
                </StatusLine>
                <StatusLine>
                  <span>neurosurgery.lab — debug environment · standby</span>
                </StatusLine>
                <StatusLine marker="●" markerClass="text-pulse-400">
                  <span>
                    phase.01 — foundation &amp; public pages · live
                    <span className="anim-blink ml-1 inline-block text-pulse-300">▍</span>
                  </span>
                </StatusLine>
              </div>
            </Reveal>
          </div>

          <div className="lg:col-span-6">
            <Reveal delay={260}>
              <HeroNetwork />
            </Reveal>
          </div>
        </div>
      </div>

      <DomainTicker />
    </section>
  );
}
