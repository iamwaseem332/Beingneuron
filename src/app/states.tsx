import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePrefersReducedMotion } from "../hooks";
import { Reveal } from "../ui";
import { IconArrowRight } from "../icons";

/* ---------- PageHeader: eyebrow + line-mask title + lede ---------- */

export function MaskLines({
  lines,
  className = "",
  base = 0,
  step = 90,
}: {
  lines: ReactNode[];
  className?: string;
  base?: number;
  step?: number;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <>
      {lines.map((l, i) =>
        reduced ? (
          <span key={i} className={`block ${className}`}>
            {l}
          </span>
        ) : (
          <span key={i} className="mask-line">
            <span className={className} style={{ animationDelay: `${base + i * step}ms` } as CSSProperties}>
              {l}
            </span>
          </span>
        ),
      )}
    </>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: ReactNode[];
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
      <div className="max-w-2xl">
        <p className="flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-pulse-600">
          <span className="inline-block h-[7px] w-[7px] rotate-45 bg-current opacity-80" />
          {eyebrow}
        </p>
        <h1 className="mt-4 font-display text-[2.1rem] font-bold leading-[1.06] tracking-tight text-ink-900 sm:text-[2.6rem]">
          <MaskLines lines={title} />
        </h1>
        {lede ? <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-ink-600">{lede}</p> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

/* ---------- corner ticks: the app's signature frame detail ---------- */

function CornerTicks() {
  const c = "pointer-events-none absolute h-3 w-3 border-pulse-500/50";
  return (
    <>
      <span aria-hidden className={`${c} left-0 top-0 border-l border-t`} />
      <span aria-hidden className={`${c} right-0 top-0 border-r border-t`} />
      <span aria-hidden className={`${c} bottom-0 left-0 border-b border-l`} />
      <span aria-hidden className={`${c} bottom-0 right-0 border-b border-r`} />
    </>
  );
}

/* ---------- EmptyState ---------- */

export function EmptyState({
  icon: Icon,
  title,
  desc,
  action,
  secondary,
  className = "",
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  desc: ReactNode;
  action?: { label: string; to: string };
  secondary?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div className={`relative rounded-lg border border-dashed border-ink-900/20 bg-paper p-7 sm:p-9 ${className}`}>
      <CornerTicks />
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-start sm:gap-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-pulse-500/25 bg-pulse-100/70 text-pulse-700">
          <Icon size={22} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold tracking-tight text-ink-900">{title}</h3>
          <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-ink-500">{desc}</p>
          {(action || secondary) && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {action && (
                <Link
                  to={action.to}
                  className="group inline-flex items-center gap-2 rounded-full bg-pulse-400 px-5 py-2.5 font-display text-[13.5px] font-semibold text-ink-950 transition-all duration-300 hover:bg-pulse-300 active:scale-[0.98]"
                >
                  {action.label}
                  <IconArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              )}
              {secondary && (
                <button
                  type="button"
                  onClick={secondary.onClick}
                  className="link-line font-display text-[13.5px] font-semibold text-ink-600 hover:text-ink-900"
                >
                  {secondary.label}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- ErrorState (ready for Phase 4 failures) ---------- */

export function ErrorState({
  title = "Something went wrong",
  desc = "The request couldn't be completed. Your data is safe — try again, and if it keeps failing, the logs will tell us why.",
  onRetry,
}: {
  title?: string;
  desc?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="relative rounded-lg border border-signal-500/40 bg-signal-300/15 p-7">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-signal-600">error · handled</p>
      <h3 className="mt-2 font-display text-lg font-semibold tracking-tight text-ink-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-ink-600">{desc}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-full border border-signal-500/50 px-5 py-2.5 font-display text-[13.5px] font-semibold text-signal-600 transition-all hover:bg-signal-400 hover:text-ink-950"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/* ---------- Skeletons ---------- */

export function PanelSkeleton({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`rounded-xl border border-ink-900/10 bg-paper-card p-6 ${className}`}>
      <div className="skeleton-bar h-3 w-24" />
      <div className="skeleton-bar mt-4 h-5 w-2/3" />
      <div className="skeleton-bar mt-3 h-3 w-full" />
      <div className="skeleton-bar mt-2 h-3 w-5/6" />
    </div>
  );
}

/** Slim row-style skeleton for lists/queues (e.g. intake jobs loading). */
export function RowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-label="Loading" role="status" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-lg border border-ink-900/10 bg-paper-card p-4">
          <div className="flex items-center gap-3.5">
            <div className="skeleton-bar h-9 w-9 rounded-lg" />
            <div className="flex-1">
              <div className="skeleton-bar h-3.5 w-2/3" />
              <div className="skeleton-bar mt-2 h-2.5 w-2/5" />
            </div>
            <div className="skeleton-bar h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function GreetingSkeleton() {
  return (
    <div aria-label="Loading your workspace" role="status">
      <div className="skeleton-bar h-4 w-40" />
      <div className="skeleton-bar mt-4 h-9 w-72 max-w-full" />
      <div className="skeleton-bar mt-3 h-4 w-96 max-w-full" />
    </div>
  );
}

/* ---------- small shared panel header ---------- */

export function PanelHead({
  title,
  tag,
  right,
}: {
  title: string;
  tag?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink-900">{title}</h2>
        {tag && (
          <span className="rounded-full border border-ink-900/12 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-400">
            {tag}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}

/* ---------- staggered reveal for grids ---------- */

export function GridReveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <Reveal delay={delay} className={className}>
      {children}
    </Reveal>
  );
}

/* ---------- error boundary: a crash must never render a blank page ---------- */

export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // never surface internals to the UI — log only
    console.error(`[beingneuron] ${this.props.label ?? "workspace"} render failure:`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="mx-auto max-w-xl rounded-xl border border-signal-500/35 bg-signal-300/10 p-10 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-signal-600">render interrupted</p>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink-900">
            This view hit an unexpected error.
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-600">
            Your papers and analyses are safe — only this view needs another attempt. If it keeps
            happening, reload the page.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => this.setState({ failed: false })}
              className="rounded-full bg-ink-900 px-6 py-3 font-display text-[14px] font-semibold text-paper transition-colors hover:bg-ink-700"
            >
              Try again
            </button>
            <Link
              to="/app/synapse"
              className="rounded-full border border-ink-900/20 px-6 py-3 font-display text-[14px] font-semibold text-ink-800 transition-all hover:border-ink-900 hover:bg-ink-900 hover:text-paper"
            >
              Back to Synapse
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
