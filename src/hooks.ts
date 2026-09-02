import { useEffect, useRef, useState } from "react";

/** Respect the user's motion preference across all animated components. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== "undefined" && "matchMedia" in window
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(() => {
    if (!("matchMedia" in window)) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}

/** One-shot IntersectionObserver reveal. */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.14) {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold, rootMargin: "0px 0px -7% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, shown };
}

const GLYPHS = "∙◦≡+×∴△01·";

/** Signature motion: scramble-decode a string in place (layout-stable). */
export function useScramble(text: string, delay = 0, speed = 26): string {
  const reduced = usePrefersReducedMotion();
  const [out, setOut] = useState(() => (reduced ? text : text.replace(/[^\s]/g, "·")));

  useEffect(() => {
    if (reduced) {
      setOut(text);
      return;
    }
    let frame = 0;
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      interval = window.setInterval(() => {
        frame += 1;
        const reveal = Math.floor(frame / 2);
        if (reveal >= text.length) {
          setOut(text);
          if (interval) window.clearInterval(interval);
          return;
        }
        let s = "";
        for (let i = 0; i < text.length; i += 1) {
          const c = text[i];
          if (c === " ") {
            s += " ";
          } else if (i < reveal) {
            s += c;
          } else {
            s += GLYPHS[(i * 7 + frame * 3) % GLYPHS.length];
          }
        }
        setOut(s);
      }, speed);
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, [text, delay, speed, reduced]);

  return out;
}
