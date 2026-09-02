/* Central content registry — Phase 2 features will read from and extend this file. */

export const DOMAINS = [
  "Artificial Intelligence",
  "Neuroscience",
  "Oncology",
  "Molecular Biology",
  "Quantum Physics",
  "Organic Chemistry",
  "Cognitive Psychology",
  "Behavioral Economics",
  "Epidemiology",
  "Materials Science",
  "Genetics",
  "Linguistics",
  "Climate Science",
  "Pharmacology",
  "Robotics",
  "Astrophysics",
  "Sociology",
  "Mathematics",
];

export const NAV_LINKS: { label: string; to?: string; section?: string }[] = [
  { label: "Research", to: "/research" },
  { label: "Learn", to: "/learn" },
  { label: "Synapse", to: "/synapse" },
  { label: "NeuroSurgery", to: "/neurosurgery" },
  { label: "Pricing", to: "/pricing" },
];

export const FOOTER_GROUPS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: "Platform",
    links: [
      { label: "Synapse", to: "/synapse" },
      { label: "NeuroSurgery", to: "/neurosurgery" },
      { label: "Pricing", to: "/pricing" },
    ],
  },
  {
    title: "Explore",
    links: [
      { label: "Research", to: "/research" },
      { label: "Learn", to: "/learn" },
      { label: "Get started", to: "/signup" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
    ],
  },
];

export const STEPS = [
  {
    n: "01",
    title: "Discover",
    core: "Explore research and AI concepts.",
    detail: "Search across papers, domains, and model behaviors from one surface.",
  },
  {
    n: "02",
    title: "Understand",
    core: "Visualize relationships, architectures, evidence, and mechanisms.",
    detail: "Interactive graphs and views replace walls of static text.",
  },
  {
    n: "03",
    title: "Experiment",
    core: "Interact with models and learn by changing them.",
    detail: "Break things on purpose — then make them work again.",
  },
];

export type Tier = {
  id: string;
  name: string;
  price: string;
  per: string;
  tag: string;
  features: string[];
  cta: string;
  featured?: boolean;
  badge?: string;
};

export const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    per: "forever",
    tag: "Casual exploration",
    features: [
      "Limited research paper analyses",
      "Basic knowledge-graph visualizations",
      "Core NeuroSurgery challenges",
      "1 saved graph",
    ],
    cta: "Start free",
  },
  {
    id: "researcher",
    name: "Researcher",
    price: "$14",
    per: "expected / mo",
    tag: "For structured research",
    features: [
      "More paper analyses each month",
      "Saved research library",
      "Advanced graphs — layers, paths, evidence trails",
      "Research collections across papers",
    ],
    cta: "Choose Researcher",
    featured: true,
    badge: "Recommended",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$32",
    per: "expected / mo",
    tag: "Heavy experimentation",
    features: [
      "Advanced NeuroSurgery scenarios",
      "Higher usage ceilings",
      "Advanced research features",
      "Multi-paper analysis",
    ],
    cta: "Choose Pro",
  },
];

/** rows: [feature, free, researcher, pro] — "✓" renders a check, "—" a dash */
export const COMPARISON: string[][] = [
  ["Paper analyses / month", "3", "25", "100"],
  ["Saved graphs", "1", "50", "500"],
  ["Graph detail", "Basic", "Advanced", "Advanced +"],
  ["Research collections", "—", "✓", "✓"],
  ["Multi-paper analysis", "—", "—", "✓"],
  ["NeuroSurgery scenarios", "6 core", "12 mixed", "20+ advanced"],
  ["Usage ceiling", "Standard", "Elevated", "High"],
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: "Is billing live?",
    a: "No. Phase 1 is an interface preview — there are no accounts, charges, or payment processing yet. The pricing shown is preliminary and will be finalized before public launch.",
  },
  {
    q: "What counts as a paper analysis?",
    a: "One uploaded paper run through the Synapse pipeline: its knowledge graph, extracted claims, methodology map, and evidence trails. Per-plan limits are listed in the comparison table above — no plan is unlimited.",
  },
  {
    q: "Does Synapse only work on AI papers?",
    a: "No. Synapse is domain-agnostic by design — biology, medicine, physics, chemistry, psychology, economics, computer science, neuroscience, and other academic fields are all in scope.",
  },
  {
    q: "Do I need a GPU for NeuroSurgery?",
    a: "No. Scenarios are small, intentionally broken networks that run in lightweight browser environments built for learning and debugging — not for large-scale training.",
  },
  {
    q: "Will there be academic pricing?",
    a: "Pricing is preliminary. Student and academic tiers are planned to be evaluated before launch, alongside the final plan structure.",
  },
];

export type PlaceholderCopy = {
  name: string;
  code: string;
  desc: string;
  scope: string;
};

export const PLACEHOLDERS: Record<string, PlaceholderCopy> = {
  synapse: {
    name: "Synapse",
    code: "SYN·01",
    desc: "The research-paper intelligence workspace. Upload a paper from any academic domain and receive an interactive, evidence-backed knowledge graph — concepts, claims, methodology, and evidence you can traverse instead of read.",
    scope: "PDF intake · extraction pipeline · graph engine · citation trails",
  },
  neurosurgery: {
    name: "NeuroSurgery",
    code: "NSG·02",
    desc: "The model-debugging lab. Load intentionally broken neural networks, run diagnostics, and repair faults — dead neurons, vanishing or exploding gradients, unstable learning rates — until training is healthy again.",
    scope: "scenario runner · fault injection · diagnostics · repair tools",
  },
  research: {
    name: "Research",
    code: "RSR·03",
    desc: "A searchable index of analyzed papers and public knowledge graphs — discover work across domains, follow evidence trails, and build collections around the questions you care about.",
    scope: "search · public graphs · collections · cross-domain discovery",
  },
  learn: {
    name: "Learn",
    code: "LRN·04",
    desc: "Guided tracks that pair Synapse knowledge graphs with NeuroSurgery labs — structured paths from reading research to debugging real model behavior.",
    scope: "learning tracks · checkpoints · progress · exercises",
  },
  about: {
    name: "About",
    code: "ABT·05",
    desc: "BeingNeuron exists because research is hard to traverse and AI systems are hard to inspect. We build instruments for understanding — interactive knowledge for papers, and hands-on environments for models.",
    scope: "mission · team · research notes",
  },
  contact: {
    name: "Contact",
    code: "CTC·06",
    desc: "A direct line to the BeingNeuron team — questions about the platform, research collaborations, and early access. The channel opens with the Phase 2 backend.",
    scope: "support · collaboration · early access",
  },
  privacy: {
    name: "Privacy",
    code: "PRV·07",
    desc: "The formal policy ships with the Phase 2 backend. The short version for now: Phase 1 has no accounts, no databases, and no tracking — this preview stores nothing about you.",
    scope: "policy · data handling · cookies",
  },
  terms: {
    name: "Terms",
    code: "TRM·08",
    desc: "Terms of service are drafted alongside billing and accounts in a later phase. Until then, this preview is provided as-is for evaluation of the interface and concepts.",
    scope: "terms of service · acceptable use · licensing",
  },
};

export type AppModule = {
  slug: string;
  name: string;
  code: string;
  blurb: string;
};

export const APP_MODULES: AppModule[] = [
  { slug: "synapse", name: "Synapse", code: "SYN·01", blurb: "Research-paper intelligence & knowledge graphs." },
  { slug: "research", name: "Research", code: "RSR·03", blurb: "Analyzed papers, saved graphs, collections." },
  { slug: "neurosurgery", name: "NeuroSurgery", code: "NSG·02", blurb: "Model debugging labs & failure scenarios." },
  { slug: "learn", name: "Learn", code: "LRN·04", blurb: "Guided tracks across research and models." },
];

export const NEUROSURGERY_FAULTS = [
  "Overfitting",
  "Dead neurons",
  "Vanishing gradients",
  "Exploding gradients",
  "Runaway learning rates",
  "Loss plateaus",
];
