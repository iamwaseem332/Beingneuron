import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

/** Brand mark — soma with dendrites ending in synaptic nodes. */
export function LogoMark({ size = 30, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden {...props}>
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.85">
        <path d="M14.5 17.5 6.5 7.5" />
        <path d="M16 15.5 23 6.5" />
        <path d="M17.5 18 26 19.5" />
        <path d="M15 20.5 10 26.5" />
      </g>
      <circle cx="16" cy="17" r="4.4" fill="currentColor" />
      <circle cx="6.5" cy="7.5" r="1.9" fill="currentColor" opacity="0.75" />
      <circle cx="23" cy="6.5" r="1.9" fill="currentColor" opacity="0.75" />
      <circle cx="26" cy="19.5" r="1.9" fill="currentColor" opacity="0.75" />
      <circle cx="10" cy="26.5" r="1.9" fill="currentColor" opacity="0.75" />
      <circle cx="16" cy="17" r="1.5" fill="var(--color-ink-950)" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 12h15" />
      <path d="m13.5 6.5 5.5 5.5-5.5 5.5" />
    </svg>
  );
}

export function IconArrowUpRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 17 17 7" />
      <path d="M8.5 7H17v8.5" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function IconMinus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 12h12" />
    </svg>
  );
}

export function IconCompass(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m14.9 9.1-1.8 5.9-5.9 1.8 1.8-5.9z" />
    </svg>
  );
}

export function IconLens(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10.5" cy="10.5" r="6.2" />
      <path d="m15.2 15.2 4.8 4.8" />
      <circle cx="8.6" cy="9.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12.3" cy="8.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10.8" cy="12.4" r="0.9" fill="currentColor" stroke="none" />
      <path d="M8.6 9.4l3.7-1.2M8.6 9.4l2.2 3M12.3 8.2l-1.5 4.2" strokeWidth="0.9" />
    </svg>
  );
}

export function IconSliders(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7.5h16" />
      <circle cx="9.5" cy="7.5" r="1.9" fill="var(--bn-knob, none)" />
      <path d="M4 12h16" />
      <circle cx="15" cy="12" r="1.9" fill="var(--bn-knob, none)" />
      <path d="M4 16.5h16" />
      <circle cx="7" cy="16.5" r="1.9" fill="var(--bn-knob, none)" />
    </svg>
  );
}

export function IconGraph(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="5.5" cy="6" r="2" />
      <circle cx="18" cy="5" r="2" />
      <circle cx="12" cy="12.5" r="2.2" />
      <circle cx="6" cy="18.5" r="2" />
      <circle cx="18.5" cy="18" r="2" />
      <path d="M7.2 7.2 10.4 11M16.4 6.3l-2.9 4.7M10.9 14.3l-3.6 2.9M13.8 13.9l3.3 2.9" />
    </svg>
  );
}

export function IconPulse(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12.5h4l2-5.5 4 10 2-4.5h6" />
    </svg>
  );
}

export function IconDoc(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3.5h7l4 4v13H7z" />
      <path d="M14 3.5v4h4" />
      <path d="M9.5 12h6M9.5 15.5h6" />
    </svg>
  );
}

export function IconScan(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <path d="M7 12h10" />
    </svg>
  );
}

export function IconWrench(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14.9 6.2a4.1 4.1 0 0 0-5.5 5.5L4 17.1 6.9 20l5.4-5.4a4.1 4.1 0 0 0 5.5-5.5L15.4 11.5l-3-3z" />
    </svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7.5h16M4 12h16M4 16.5h9" />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 4.5 20 19.5" />
      <path d="M9.4 6.4A9.6 9.6 0 0 1 12 5.8c6 0 9.5 6.2 9.5 6.2a17.5 17.5 0 0 1-3 3.6M6.1 8.3A16.9 16.9 0 0 0 2.5 12S6 18.2 12 18.2a9.4 9.4 0 0 0 3.4-.6" />
    </svg>
  );
}

export function IconUpload(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 15V4.5" />
      <path d="m7.5 9 4.5-4.5L16.5 9" />
      <path d="M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </svg>
  );
}

export function IconLibrary(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 4.5v15M9 4.5v15" />
      <path d="m13 5 4.6 14.2" />
      <path d="M4.5 8h4.5M4.5 16h4.5" strokeWidth="1.1" />
    </svg>
  );
}

export function IconGauge(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 18.5a8.5 8.5 0 1 1 14 0" />
      <path d="m12 13.5 3.5-4.5" />
      <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 5.5v13l10-6.5z" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.5 13.5a3.8 3.8 0 0 0 5.4 0l2.6-2.6a3.8 3.8 0 1 0-5.4-5.4L11.8 6.8" />
      <path d="M13.5 10.5a3.8 3.8 0 0 0-5.4 0l-2.6 2.6a3.8 3.8 0 1 0 5.4 5.4l1.3-1.3" />
    </svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.6" r="0.4" fill="currentColor" />
    </svg>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 13.5 6.5 5.5h11L20 13.5" />
      <path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 6.5h15" />
      <path d="M8.5 6.5v-2h7v2" />
      <path d="M6.5 6.5 7.5 19.5h9l1-13" />
      <path d="M10 10v6M14 10v6" />
    </svg>
  );
}

/** Small filled node used as a separator / list marker. */
export function NodeDot({ size = 6, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" className={className} aria-hidden>
      <circle cx="4" cy="4" r="3" fill="currentColor" />
    </svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 19.6c1.4-3.1 4-4.6 7.2-4.6s5.8 1.5 7.2 4.6" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13.5 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20h7" />
      <path d="M15.5 8.5 19 12l-3.5 3.5M9.5 12H19" />
    </svg>
  );
}

export function IconKey(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="15.5" r="4" />
      <path d="m10.8 12.7 8.7-8.7M16 7.5l2.6 2.6M13.4 10.1l2 2" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.2 5 5.8v5.4c0 4.4 2.9 7.5 7 9.6 4.1-2.1 7-5.2 7-9.6V5.8z" />
      <path d="m9 11.8 2.2 2.2 4-4.3" />
    </svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.6" />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
    </svg>
  );
}

export function IconGrid(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="6.6" height="6.6" rx="1.2" />
      <rect x="13.4" y="4" width="6.6" height="6.6" rx="1.2" />
      <rect x="4" y="13.4" width="6.6" height="6.6" rx="1.2" />
      <rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.2" />
    </svg>
  );
}
