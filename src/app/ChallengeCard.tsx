import { Link } from "react-router-dom";
import type { ChallengeDef } from "./appData";
import { IconArrowUpRight } from "../icons";

/**
 * Reusable challenge / learning-path card.
 * Renders as a link when `to` is provided (dashboard), or a static
 * "upcoming" card otherwise (NeuroSurgery category grid).
 */
export default function ChallengeCard({
  def,
  to,
  statusLabel = "Upcoming · Phase 4",
}: {
  def: ChallengeDef;
  to?: string;
  statusLabel?: string;
}) {
  const Icon = def.icon;

  const body = (
    <>
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-signal-500/30 bg-signal-300/15 text-signal-600 transition-colors duration-300 group-hover:border-signal-500/60">
          <Icon size={19} />
        </span>
        <span className="font-mono text-[9.5px] tracking-[0.18em] text-ink-300">
          {def.slug.toUpperCase().slice(0, 8)}·{def.difficulty.toUpperCase()}
        </span>
      </div>
      <h3 className="mt-5 font-display text-[17px] font-semibold tracking-tight text-ink-900">
        {def.title}
      </h3>
      <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-ink-500">{def.desc}</p>
      <div className="mt-5 flex items-center justify-between border-t border-ink-900/[0.08] pt-4">
        <span className="rounded-full border border-signal-500/35 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-signal-600">
          {statusLabel}
        </span>
        {to && (
          <span className="inline-flex items-center gap-1.5 font-display text-[12.5px] font-semibold text-pulse-700 transition-colors group-hover:text-pulse-600">
            Explore
            <IconArrowUpRight
              size={14}
              className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </span>
        )}
      </div>
    </>
  );

  const cls =
    "card-lift group flex h-full flex-col rounded-xl border border-ink-900/12 bg-paper-card p-6 text-left hover:border-signal-500/40";

  if (to) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}
