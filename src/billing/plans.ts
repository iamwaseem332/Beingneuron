/**
 * Phase 14 — CENTRALIZED PLAN CONFIGURATION.
 *
 * This is the single source of truth for plans, limits and feature gates.
 * - The billing UI, pricing page, dashboard and usage meters all read from here.
 * - The database seeds `plan_limits` / `plan_features` to MATCH these values
 *   (see supabase/migrations/0011_billing.sql). Server-side enforcement reads
 *   the tables, so the two must stay in sync — edit both together.
 * - Stripe price IDs are deliberately NOT here: they live server-side
 *   (STRIPE_PRICE_RESEARCHER / STRIPE_PRICE_PRO) and are resolved by the
 *   `create-checkout` Edge Function. The client only ever sends a plan id.
 *
 * Every daily cap is finite on purpose — we do not promise unlimited usage
 * until real economics are validated.
 */

export type PlanId = "free" | "researcher" | "pro";

export type UsageKind =
  | "paper_upload"
  | "paper_analysis"
  | "ai_request"
  | "nsg_run"
  | "collection_create";

export type FeatureId = "collections" | "multi_paper" | "advanced_nsg";

export type Plan = {
  id: PlanId;
  name: string;
  monthlyUsd: number;
  tagline: string;
  /** Daily caps per usage kind. Mirrored by `plan_limits` in the DB. */
  dailyLimits: Record<UsageKind, number>;
  /** Feature gates. Mirrored by `plan_features` in the DB. */
  features: Record<FeatureId, boolean>;
  /** Human-readable rows for the feature matrix. */
  featureLines: string[];
  cta: string;
  featured?: boolean;
  badge?: string;
};

export const USAGE_KIND_LABELS: Record<UsageKind, string> = {
  paper_upload: "Papers uploaded",
  paper_analysis: "Papers analyzed",
  ai_request: "AI requests",
  nsg_run: "NeuroSurgery runs",
  collection_create: "Collections created",
};

export const FEATURE_LABELS: Record<FeatureId, string> = {
  collections: "Saved research collections",
  multi_paper: "Multi-paper analysis",
  advanced_nsg: "Advanced NeuroSurgery scenarios",
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthlyUsd: 0,
    tagline: "Casual exploration",
    dailyLimits: {
      paper_upload: 5,
      paper_analysis: 3,
      ai_request: 60,
      nsg_run: 25,
      collection_create: 1,
    },
    features: { collections: false, multi_paper: false, advanced_nsg: false },
    featureLines: [
      "Basic knowledge-graph visualizations",
      "Core NeuroSurgery challenges",
      "1 saved graph",
    ],
    cta: "Start free",
  },
  {
    id: "researcher",
    name: "Researcher",
    monthlyUsd: 14,
    tagline: "For structured research",
    dailyLimits: {
      paper_upload: 40,
      paper_analysis: 25,
      ai_request: 250,
      nsg_run: 100,
      collection_create: 10,
    },
    features: { collections: true, multi_paper: false, advanced_nsg: false },
    featureLines: [
      "Advanced graphs — layers, paths, evidence trails",
      "Saved research library & collections",
      "Higher analysis ceilings",
    ],
    cta: "Choose Researcher",
    featured: true,
    badge: "Recommended",
  },
  {
    id: "pro",
    name: "Pro",
    monthlyUsd: 32,
    tagline: "Heavy experimentation",
    dailyLimits: {
      paper_upload: 60,
      paper_analysis: 60,
      ai_request: 400,
      nsg_run: 200,
      collection_create: 20,
    },
    features: { collections: true, multi_paper: true, advanced_nsg: true },
    featureLines: [
      "Multi-paper analysis",
      "Advanced NeuroSurgery scenarios",
      "Highest usage ceilings",
    ],
    cta: "Choose Pro",
  },
];

export const getPlan = (id: PlanId | string | null | undefined): Plan =>
  PLANS.find((p) => p.id === id) ?? PLANS[0];

/** Default plan for any user without an active subscription. */
export const FREE_PLAN = PLANS[0];

/** True when a plan id maps to a paid Stripe tier (not "free"). */
export const isPaidPlan = (id: PlanId | string | null | undefined): boolean =>
  getPlan(id).monthlyUsd > 0;
