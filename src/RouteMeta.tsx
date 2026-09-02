import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Phase 17 — SEO & document metadata.
 *
 * Public marketing routes are indexable; everything behind authentication
 * (workspace, account, auth flows) is explicitly noindex/nofollow so private
 * research never reaches a crawler. Titles are set per route for readable
 * tabs and correct social previews.
 */

type Meta = { title: string; index: boolean };

const PUBLIC_SITE = "BeingNeuron";

function resolve(pathname: string): Meta {
  /* ---- indexable public pages ---- */
  if (pathname === "/") return { title: `${PUBLIC_SITE} — AI Research & Learning Platform`, index: true };
  if (pathname === "/pricing") return { title: `Pricing — ${PUBLIC_SITE}`, index: true };
  if (pathname === "/preview") return { title: `Project Preview — ${PUBLIC_SITE}`, index: true };

  /* ---- noindex: auth flows ---- */
  if (pathname === "/login") return { title: `Login — ${PUBLIC_SITE}`, index: false };
  if (pathname === "/signup") return { title: `Create account — ${PUBLIC_SITE}`, index: false };
  if (pathname === "/forgot-password") return { title: `Reset password — ${PUBLIC_SITE}`, index: false };
  if (pathname === "/reset-password") return { title: `Choose a new password — ${PUBLIC_SITE}`, index: false };

  /* ---- noindex: authenticated workspace ---- */
  if (pathname === "/dashboard") return { title: `Dashboard — ${PUBLIC_SITE}`, index: false };
  if (pathname === "/usage") return { title: `Usage & billing — ${PUBLIC_SITE}`, index: false };
  if (pathname === "/profile") return { title: `Profile — ${PUBLIC_SITE}`, index: false };
  if (pathname === "/settings") return { title: `Settings — ${PUBLIC_SITE}`, index: false };
  if (pathname.startsWith("/app/synapse")) return { title: `Synapse — ${PUBLIC_SITE}`, index: false };
  if (pathname.startsWith("/app/neurosurgery")) return { title: `NeuroSurgery — ${PUBLIC_SITE}`, index: false };
  if (pathname.startsWith("/app/research")) return { title: `Research Library — ${PUBLIC_SITE}`, index: false };
  if (pathname.startsWith("/app")) return { title: `Workspace — ${PUBLIC_SITE}`, index: false };

  /* standby / unknown modules stay public but generic */
  return { title: PUBLIC_SITE, index: false };
}

function upsertMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export default function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = resolve(pathname);
    document.title = meta.title;
    upsertMeta("robots", meta.index ? "index,follow" : "noindex,nofollow");
  }, [pathname]);

  return null;
}
