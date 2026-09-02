import { useState } from "react";
import { COMPARISON, FAQS, TIERS } from "./content";
import { ButtonLink, Eyebrow, Reveal } from "./ui";
import { IconCheck, IconChevron, IconMinus } from "./icons";

function TierCard({ tier, index }: { tier: (typeof TIERS)[number]; index: number }) {
  return (
    <Reveal delay={index * 120}>
      <div
        className={`card-lift relative flex h-full flex-col overflow-hidden rounded-xl border p-8 ${
          tier.featured
            ? "border-ink-800 bg-ink-950 text-paper shadow-[0_35px_80px_-40px_rgba(6,15,24,0.7)]"
            : "border-ink-900/12 bg-paper-card"
        }`}
      >
        {tier.featured && <div className="bg-grid-dark absolute inset-0 opacity-60" />}
        {tier.badge && (
          <span className="absolute right-5 top-5 rounded-full bg-pulse-400 px-3 py-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.18em] text-ink-950">
            {tier.badge}
          </span>
        )}
        <div className="relative">
          <p className={`font-mono text-[10.5px] uppercase tracking-[0.22em] ${tier.featured ? "text-pulse-300" : "text-ink-400"}`}>
            {tier.tag}
          </p>
          <h2 className={`mt-3 font-display text-2xl font-semibold tracking-tight ${tier.featured ? "text-paper" : "text-ink-900"}`}>
            {tier.name}
          </h2>
          <div className="mt-5 flex items-baseline gap-2">
            <span className={`tnum font-display text-5xl font-bold tracking-tight ${tier.featured ? "text-paper" : "text-ink-900"}`}>
              {tier.price}
            </span>
            <span className={`font-mono text-[11px] tracking-wide ${tier.featured ? "text-paper/50" : "text-ink-400"}`}>
              {tier.per}
            </span>
          </div>
          <ul className="mt-7 space-y-3">
            {tier.features.map((f) => (
              <li key={f} className={`flex items-start gap-3 text-[14px] leading-snug ${tier.featured ? "text-paper/80" : "text-ink-600"}`}>
                <span
                  className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
                    tier.featured ? "bg-pulse-400/20 text-pulse-300" : "bg-pulse-100 text-pulse-600"
                  }`}
                >
                  <IconCheck size={11} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-8 pt-2">
          {tier.featured ? (
            <ButtonLink to="/signup" variant="primary" className="w-full" arrow>
              {tier.cta}
            </ButtonLink>
          ) : (
            <ButtonLink to="/signup" variant="outline-dark" className="w-full">
              {tier.cta}
            </ButtonLink>
          )}
        </div>
      </div>
    </Reveal>
  );
}

function ComparisonCell({ value }: { value: string }) {
  if (value === "✓")
    return (
      <span className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-pulse-100 text-pulse-600">
        <IconCheck size={12} />
      </span>
    );
  if (value === "—")
    return (
      <span className="mx-auto flex h-5 w-5 items-center justify-center text-ink-300">
        <IconMinus size={13} />
      </span>
    );
  return <span className="tnum font-mono text-[12px] text-ink-700">{value}</span>;
}

export default function PricingPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <main className="relative overflow-hidden bg-paper pb-28 pt-32 lg:pt-40">
      <div className="bg-grid-light absolute inset-0 opacity-60" />
      <div className="absolute -right-56 -top-40 h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.12),transparent_62%)]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        {/* header */}
        <div className="max-w-2xl">
          <Eyebrow className="text-pulse-600">Pricing</Eyebrow>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.04] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.4rem]">
            Clear plans for serious research.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-600">
            Start free, grow into structured research, and scale up when you need advanced
            experimentation across papers and models.
          </p>
        </div>

        <Reveal delay={100}>
          <div className="mt-8 flex items-start gap-3 rounded-lg border border-signal-500/35 bg-signal-300/15 px-4 py-3.5">
            <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rotate-45 bg-signal-500" />
            <p className="font-mono text-[11.5px] leading-relaxed tracking-wide text-ink-700">
              PRELIMINARY — this structure is conceptual. Billing, accounts, and final limits ship
              in a later phase; nothing is charged today.
            </p>
          </div>
        </Reveal>

        {/* tiers */}
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {TIERS.map((t, i) => (
            <TierCard key={t.id} tier={t} index={i} />
          ))}
        </div>

        {/* comparison */}
        <Reveal delay={100} className="mt-20">
          <Eyebrow className="text-pulse-600">Side by side</Eyebrow>
          <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
            Compare what each plan carries.
          </h2>
        </Reveal>
        <Reveal delay={180}>
          <div className="mt-8 overflow-x-auto rounded-xl border border-ink-900/12 bg-paper-card shadow-[0_25px_60px_-40px_rgba(6,15,24,0.35)]">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink-900/10">
                  <th className="px-6 py-4 font-mono text-[10.5px] uppercase tracking-[0.2em] text-ink-400">
                    Capability
                  </th>
                  {TIERS.map((t) => (
                    <th
                      key={t.id}
                      className={`px-6 py-4 text-center font-display text-[15px] font-semibold tracking-tight ${
                        t.featured ? "text-pulse-600" : "text-ink-900"
                      }`}
                    >
                      {t.name}
                      {t.featured && (
                        <span className="ml-2 rounded-full bg-pulse-100 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-pulse-700">
                          rec.
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, ri) => (
                  <tr
                    key={row[0]}
                    className={`border-b border-ink-900/[0.06] transition-colors hover:bg-pulse-100/40 ${
                      ri % 2 === 1 ? "bg-ink-900/[0.02]" : ""
                    }`}
                  >
                    <td className="px-6 py-3.5 text-[13.5px] font-medium text-ink-700">{row[0]}</td>
                    {row.slice(1).map((v, ci) => (
                      <td key={ci} className="px-6 py-3.5 text-center">
                        <ComparisonCell value={v} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 font-mono text-[10.5px] tracking-wide text-ink-400">
            All ceilings are deliberate — no plan is unlimited. Figures are preliminary.
          </p>
        </Reveal>

        {/* FAQ */}
        <div className="mt-20 grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <Eyebrow className="text-pulse-600">Questions</Eyebrow>
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              Before you commit to anything.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-600">
              Honest answers for a platform in its first phase. More questions open with the{" "}
              <span className="font-mono text-[13px] text-pulse-700">/contact</span> module.
            </p>
          </Reveal>
          <div className="lg:col-span-8">
            {FAQS.map((f, i) => {
              const isOpen = open === i;
              return (
                <Reveal key={f.q} delay={i * 80}>
                  <div
                    className={`border-b border-ink-900/10 transition-colors ${
                      isOpen ? "bg-paper-card" : "hover:bg-paper-card/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="flex w-full items-center justify-between gap-6 px-2 py-5 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="font-display text-[17px] font-semibold tracking-tight text-ink-900">
                        {f.q}
                      </span>
                      <IconChevron
                        size={18}
                        className={`shrink-0 text-pulse-600 transition-transform duration-300 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <div
                      className={`grid transition-all duration-400 ease-out ${
                        isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="max-w-2xl px-2 pb-6 text-[14.5px] leading-relaxed text-ink-600">
                          {f.a}
                        </p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>

        {/* closing */}
        <Reveal className="mt-20">
          <div className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-950 px-8 py-12 text-paper sm:px-12">
            <div className="bg-grid-dark absolute inset-0" />
            <div className="absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(18,163,146,0.18),transparent_65%)]" />
            <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
              <div>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.24em] text-pulse-300">
                  Phase 1 — free to explore
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Reserve your place before the engines come online.
                </h2>
              </div>
              <div className="flex flex-wrap gap-4">
                <ButtonLink to="/signup" variant="primary" arrow>
                  Get Started
                </ButtonLink>
                <ButtonLink to="/login" variant="outline-light">
                  Login
                </ButtonLink>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
