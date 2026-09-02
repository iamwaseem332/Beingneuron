import { Link } from "react-router-dom";
import { TIERS } from "./content";
import { ButtonLink, Eyebrow, Reveal } from "./ui";
import { IconArrowUpRight, IconCheck } from "./icons";

export default function PricingPreview() {
  return (
    <section id="pricing-preview" className="relative scroll-mt-20 border-y border-ink-900/10 bg-paper-deep py-24 lg:py-28">
      <div className="bg-grid-light absolute inset-0 opacity-50" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <Eyebrow className="text-pulse-600">Pricing preview</Eyebrow>
            <h2 className="mt-5 font-display text-3xl font-semibold leading-[1.06] tracking-tight text-ink-900 sm:text-4xl lg:text-[2.75rem]">
              Plans that scale with your research.
            </h2>
          </div>
          <Link
            to="/pricing"
            className="link-line inline-flex shrink-0 items-center gap-2 font-display text-[15px] font-semibold text-ink-900"
          >
            Full pricing <IconArrowUpRight size={16} />
          </Link>
        </div>

        <Reveal delay={120}>
          <div className="mt-8 flex items-start gap-3 rounded-lg border border-signal-500/35 bg-signal-300/15 px-4 py-3.5">
            <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rotate-45 bg-signal-500" />
            <p className="font-mono text-[11.5px] leading-relaxed tracking-wide text-ink-700">
              PRELIMINARY PRICING — tiers, prices, and limits are conceptual and may change before
              launch. No billing exists in Phase 1, and no plan claims unlimited usage.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {TIERS.map((tier, i) => (
            <Reveal key={tier.id} delay={i * 130}>
              <div
                className={`card-lift relative flex h-full flex-col overflow-hidden rounded-xl border p-8 ${
                  tier.featured
                    ? "border-ink-800 bg-ink-950 text-paper shadow-[0_35px_80px_-40px_rgba(6,15,24,0.7)]"
                    : "border-ink-900/12 bg-paper-card"
                }`}
              >
                {tier.featured && (
                  <>
                    <div className="bg-grid-dark absolute inset-0 opacity-60" />
                    <span className="absolute right-5 top-5 rounded-full bg-pulse-400 px-3 py-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.18em] text-ink-950">
                      {tier.badge}
                    </span>
                  </>
                )}
                <div className="relative">
                  <p className={`font-mono text-[10.5px] uppercase tracking-[0.22em] ${tier.featured ? "text-pulse-300" : "text-ink-400"}`}>
                    {tier.tag}
                  </p>
                  <h3 className={`mt-3 font-display text-2xl font-semibold tracking-tight ${tier.featured ? "text-paper" : "text-ink-900"}`}>
                    {tier.name}
                  </h3>
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
          ))}
        </div>

        <Reveal delay={200}>
          <p className="mt-8 text-center font-mono text-[11px] tracking-wide text-ink-400">
            Limits are intentionally defined per tier — see the full comparison on the{" "}
            <Link to="/pricing" className="text-pulse-600 underline decoration-pulse-500/40 underline-offset-4 hover:decoration-pulse-600">
              pricing page
            </Link>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}
