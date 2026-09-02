import type { CSSProperties, ElementType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useReveal } from "./hooks";
import { IconArrowRight } from "./icons";

/* ---------- Reveal: scroll-triggered rise + fade ---------- */

export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: ElementType;
}) {
  const { ref, shown } = useReveal<HTMLElement>();
  const style: CSSProperties = { transitionDelay: `${delay}ms` };
  return (
    <Tag
      ref={ref}
      style={style}
      className={`${className} transition-all duration-700 ease-[cubic-bezier(.22,.61,.36,1)] ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-7"
      }`}
    >
      {children}
    </Tag>
  );
}

/* ---------- Eyebrow: mono instrument label ---------- */

export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.24em] ${className}`}
    >
      <span className="inline-block h-[7px] w-[7px] rotate-45 bg-current opacity-80" />
      {children}
    </p>
  );
}

/* ---------- SectionHead ---------- */

export function SectionHead({
  eyebrow,
  title,
  lede,
  dark = false,
  className = "",
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={`max-w-2xl ${className}`}>
      <Eyebrow className={dark ? "text-pulse-300" : "text-pulse-600"}>{eyebrow}</Eyebrow>
      <h2
        className={`mt-5 font-display text-3xl font-semibold leading-[1.06] tracking-tight sm:text-4xl lg:text-[2.75rem] ${
          dark ? "text-paper" : "text-ink-900"
        }`}
      >
        {title}
      </h2>
      {lede ? (
        <p className={`mt-5 text-lg leading-relaxed ${dark ? "text-paper/65" : "text-ink-600"}`}>
          {lede}
        </p>
      ) : null}
    </div>
  );
}

/* ---------- Tag: mono chip ---------- */

export function Tag({
  children,
  tone = "dark",
  className = "",
}: {
  children: ReactNode;
  tone?: "dark" | "light" | "amber";
  className?: string;
}) {
  const tones = {
    dark: "border-ink-900/15 text-ink-600 hover:border-pulse-500 hover:text-pulse-700",
    light: "border-paper/20 text-paper/70 hover:border-pulse-300 hover:text-pulse-200",
    amber: "border-signal-500/40 text-signal-600",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-[11px] tracking-wide transition-colors duration-300 ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ---------- ButtonLink ---------- */

type ButtonVariant = "primary" | "dark" | "outline-dark" | "outline-light" | "ghost-light";

export function ButtonLink({
  to,
  onClick,
  children,
  variant = "primary",
  className = "",
  arrow = false,
}: {
  to?: string;
  onClick?: () => void;
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  arrow?: boolean;
}) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      "bg-pulse-400 text-ink-950 hover:bg-pulse-300 shadow-[0_10px_30px_-12px_rgba(53,196,174,0.65)]",
    dark: "bg-ink-900 text-paper hover:bg-ink-700",
    "outline-dark":
      "border border-ink-900/25 text-ink-900 hover:border-ink-900 hover:bg-ink-900 hover:text-paper",
    "outline-light":
      "border border-paper/30 text-paper hover:border-paper hover:bg-paper hover:text-ink-950",
    "ghost-light": "text-paper/70 hover:text-pulse-300",
  };

  const cls = `group inline-flex items-center justify-center gap-2.5 rounded-full px-6 py-3 font-display text-[15px] font-semibold tracking-tight transition-all duration-300 active:scale-[0.98] ${styles[variant]} ${className}`;

  const inner = (
    <>
      {children}
      {arrow ? (
        <IconArrowRight
          size={17}
          className="transition-transform duration-300 group-hover:translate-x-1"
        />
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/* ---------- StatusLine: mono readout row ---------- */

export function StatusLine({
  marker,
  markerClass,
  children,
}: {
  marker?: string;
  markerClass?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2.5 font-mono text-[11px] tracking-wide">
      <span className={markerClass ?? "text-pulse-400"}>{marker ?? "▸"}</span>
      <span>{children}</span>
    </div>
  );
}
