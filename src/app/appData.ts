import type { ComponentType } from "react";
import {
  IconDoc,
  IconGauge,
  IconGraph,
  IconGrid,
  IconLens,
  IconLibrary,
  IconPulse,
  IconSliders,
  IconSettings,
  IconWrench,
} from "../icons";

export type IconType = ComponentType<{ size?: number; className?: string }>;

/* ---------- navigation tree (mirrors the Phase 3 spec) ---------- */

export type AppNavItem = {
  label: string;
  to: string;
  icon: IconType;
  code?: string;
};

export type AppNavGroup = { label: string; items: AppNavItem[] };

export const APP_TOP: AppNavItem = { label: "Dashboard", to: "/dashboard", icon: IconGrid };

export const APP_GROUPS: AppNavGroup[] = [
  {
    label: "Research",
    items: [
      { label: "Synapse", to: "/app/synapse", icon: IconGraph, code: "SYN" },
      { label: "Research Library", to: "/app/research", icon: IconLibrary, code: "LIB" },
    ],
  },
  {
    label: "Learn & Experiment",
    items: [{ label: "NeuroSurgery", to: "/app/neurosurgery", icon: IconWrench, code: "NSG" }],
  },
];

export const APP_BOTTOM: AppNavItem[] = [
  { label: "Usage", to: "/usage", icon: IconGauge },
  { label: "Settings", to: "/settings", icon: IconSettings },
];

/* ---------- header meta per route ---------- */

export type PageMeta = { crumbs: string[]; title: string };

export const PAGE_META: Record<string, PageMeta> = {
  "/dashboard": { crumbs: ["Workspace"], title: "Dashboard" },
  "/app/synapse": { crumbs: ["Workspace", "Research"], title: "Synapse" },
  "/app/research": { crumbs: ["Workspace", "Research"], title: "Research Library" },
  "/app/neurosurgery": { crumbs: ["Workspace", "Learn & Experiment"], title: "NeuroSurgery" },
  "/usage": { crumbs: ["Workspace", "Account"], title: "Usage" },
};

/* ---------- NeuroSurgery challenge categories ---------- */

export type ChallengeDef = {
  slug: string;
  title: string;
  desc: string;
  difficulty: "intro" | "core" | "advanced";
  icon: IconType;
  /** Route to the live lab — scenarios without one render as upcoming. */
  to?: string;
  live?: boolean;
};

export const CHALLENGES: ChallengeDef[] = [
  {
    slug: "overfitting",
    title: "Overfitting",
    desc: "Training loss collapses while validation loss climbs. Regularize the memorization away.",
    difficulty: "core",
    icon: IconLens,
    to: "/app/neurosurgery/overfitting",
    live: true,
  },
  {
    slug: "underfitting",
    title: "Underfitting",
    desc: "The boundary is too weak for the data. Add capacity and non-linearity until it learns.",
    difficulty: "intro",
    icon: IconSliders,
    to: "/app/neurosurgery/underfitting",
    live: true,
  },
  {
    slug: "lr-high",
    title: "Learning Rate Too High",
    desc: "Every update overshoots the minimum. Loss oscillates, then diverges to NaN.",
    difficulty: "intro",
    icon: IconPulse,
    to: "/app/neurosurgery/lr-high",
    live: true,
  },
  {
    slug: "lr-low",
    title: "Learning Rate Too Low",
    desc: "The model is healthy but frozen — updates too small to descend the loss surface.",
    difficulty: "intro",
    icon: IconGauge,
    to: "/app/neurosurgery/lr-low",
    live: true,
  },
  {
    slug: "dead-relus",
    title: "Dead ReLUs",
    desc: "Biases pinned negative silence most units forever. Revive the layer.",
    difficulty: "core",
    icon: IconGrid,
    to: "/app/neurosurgery/dead-relus",
    live: true,
  },
  {
    slug: "vanishing-gradients",
    title: "Vanishing Gradients",
    desc: "The error signal decays to nothing across five sigmoid layers. Restore the flow.",
    difficulty: "advanced",
    icon: IconDoc,
    to: "/app/neurosurgery/vanishing-gradients",
    live: true,
  },
  {
    slug: "exploding-gradients",
    title: "Exploding Gradients",
    desc: "Oversized initialization amplifies activations until loss and gradients blow up.",
    difficulty: "advanced",
    icon: IconGraph,
    to: "/app/neurosurgery/exploding-gradients",
    live: true,
  },
];

/* ---------- dashboard learning paths ---------- */

export const LEARNING_PATHS: ChallengeDef[] = [
  {
    slug: "model-basics",
    title: "Model Basics",
    desc: "What a network is made of — layers, activations, loss, and updates.",
    difficulty: "intro",
    icon: IconDoc,
    to: "/app/neurosurgery/underfitting",
    live: true,
  },
  {
    slug: "overfitting",
    title: "Overfitting",
    desc: "Read train vs. validation curves and intervene before memorization wins.",
    difficulty: "core",
    icon: IconLens,
    to: "/app/neurosurgery/overfitting",
    live: true,
  },
  {
    slug: "activation-problems",
    title: "Activation Problems",
    desc: "Dead ReLUs and saturated units — when neurons go quiet and why.",
    difficulty: "core",
    icon: IconGrid,
    to: "/app/neurosurgery/dead-relus",
    live: true,
  },
  {
    slug: "gradient-failures",
    title: "Gradient Failures",
    desc: "Vanishing and exploding gradients, traced layer by layer.",
    difficulty: "advanced",
    icon: IconPulse,
    to: "/app/neurosurgery/vanishing-gradients",
    live: true,
  },
];

/* ---------- model vitals (measured live in the surgery lab) ---------- */

export const VITALS = [
  { label: "Training Loss", note: "measured per run" },
  { label: "Validation Loss", note: "held-out set" },
  { label: "Gradient Norm", note: "full-batch, log scale" },
  { label: "Dead Neuron Ratio", note: "silent ReLU census" },
  { label: "Validation Accuracy", note: "held-out set" },
];

/* ---------- quick start journey ---------- */

export const QUICK_START = [
  {
    n: "01",
    title: "Explore a paper",
    desc: "Bring a research paper into Synapse — any academic domain.",
    to: "/app/synapse",
  },
  {
    n: "02",
    title: "Discover how concepts connect",
    desc: "Traverse claims, methods, and evidence as an interactive graph.",
    to: "/app/synapse",
  },
  {
    n: "03",
    title: "Experiment with AI systems",
    desc: "Break a model on purpose, then repair it in NeuroSurgery.",
    to: "/app/neurosurgery",
  },
];

/* ---------- synapse pipeline (how it will work) ---------- */

export const SYNAPSE_PIPELINE = [
  { step: "01", label: "Intake", desc: "Upload a PDF or paste an arXiv link", live: true, phase: "phase 4" },
  { step: "02", label: "Extraction", desc: "Pages, structure, sections, captions — with source locations", live: true, phase: "phase 5" },
  { step: "03", label: "Chunking", desc: "Order-preserving, section-aware chunks for analysis", live: true, phase: "phase 5" },
  { step: "04", label: "Analysis", desc: "Concepts, claims & evidence mapped into a graph", live: false, phase: "phase 6" },
];
