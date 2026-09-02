/**
 * Phase 13 — real usage measurement + cost monitoring.
 *
 * Every number on the Usage page is derived from records this user actually
 * produced: intake jobs, analysis usage rows, NeuroSurgery progress and the
 * append-only `usage_events` ledger. Nothing is projected or invented.
 *
 * Cost controls:
 *  · Supabase mode — daily quotas are enforced by a database trigger
 *    (`enforce_usage_quotas`), duplicate analysis billing is blocked by a
 *    unique index, and upload size is capped by the storage bucket.
 *  · Demo mode — the same caps are applied deterministically by the local
 *    ledger so the behaviour matches production.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "../auth/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import { useSynapse } from "./SynapseProvider";
import { useNsgProgress } from "./nsgProgress";

/* ================= types & caps ================= */

export type UsageKind =
  | "paper_upload"
  | "paper_analysis"
  | "ai_request"
  | "nsg_run"
  | "collection_create";

export type UsageEvent = {
  id: string;
  user_id: string;
  kind: UsageKind;
  quantity: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  bytes: number;
  ref_id: string | null;
  detail: string;
  created_at: string;
};

export type UsageAggregates = {
  papersUploaded: number;
  papersAnalyzed: number;
  aiRequests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  failedAiRequests: number;
  storageBytes: number; // temp intake + derived structure
  collections: number;
  nsgRuns: number;
  nsgRepairs: number;
};

/** Daily caps — mirrored by the `enforce_usage_quotas` DB trigger. */
export const DAILY_CAPS: Record<UsageKind, number> = {
  paper_upload: 60,
  paper_analysis: 40,
  ai_request: 400,
  nsg_run: 200,
  collection_create: 20,
};

export const KIND_LABEL: Record<UsageKind, string> = {
  paper_upload: "Paper uploaded",
  paper_analysis: "Paper analyzed",
  ai_request: "AI request",
  nsg_run: "NeuroSurgery run",
  collection_create: "Collection created",
};

export function friendlyQuotaError(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? "");
  const m = msg.match(/QUOTA_EXCEEDED:([a-z_]+)/i) ?? msg.match(/daily limit/i);
  if (m) {
    const kind = msg.match(/QUOTA_EXCEEDED:([a-z_]+)/i)?.[1] as UsageKind | undefined;
    const cap = kind ? DAILY_CAPS[kind] : null;
    return `Daily limit reached${kind ? ` for ${KIND_LABEL[kind].toLowerCase()}` : ""}${cap ? ` (${cap}/day)` : ""}. The counter resets at midnight — nothing was charged.`;
  }
  if (msg.includes("duplicate key") || msg.includes("usage_events_analysis_unique")) {
    return "This paper has already been billed for analysis today — duplicate runs are blocked to prevent repeated expensive processing.";
  }
  return "Usage couldn't be recorded. Try again in a moment.";
}

/* ================= ledger ================= */

interface UsageLedger {
  readonly mode: "supabase" | "demo";
  /** Append an event. Throws (friendly) when a quota blocks it. */
  record(userId: string, ev: Omit<UsageEvent, "id" | "created_at" | "user_id">): Promise<void>;
  today(userId: string): Promise<Record<UsageKind, number>>;
  recent(userId: string, limit: number): Promise<UsageEvent[]>;
  aggregates(userId: string): Promise<UsageAggregates>;
}

/* ---------- Supabase: real tables, trigger-enforced caps ---------- */

class SupabaseUsageLedger implements UsageLedger {
  readonly mode = "supabase" as const;
  private client = supabase!;

  async record(userId: string, ev: Omit<UsageEvent, "id" | "created_at" | "user_id">): Promise<void> {
    const { error } = await this.client.from("usage_events").insert({
      user_id: userId,
      kind: ev.kind,
      quantity: ev.quantity,
      prompt_tokens: ev.prompt_tokens,
      completion_tokens: ev.completion_tokens,
      cost_usd: ev.cost_usd,
      bytes: ev.bytes,
      ref_id: ev.ref_id,
      detail: ev.detail.slice(0, 140),
    });
    if (error) throw new Error(error.message);
  }

  async today(userId: string): Promise<Record<UsageKind, number>> {
    const out: Record<UsageKind, number> = {
      paper_upload: 0, paper_analysis: 0, ai_request: 0, nsg_run: 0, collection_create: 0,
    };
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const { data, error } = await this.client
      .from("usage_events")
      .select("kind,quantity")
      .eq("user_id", userId)
      .gte("created_at", dayStart.toISOString());
    if (error || !data) return out;
    for (const row of data as { kind: UsageKind; quantity: number }[]) {
      if (row.kind in out) out[row.kind] += row.kind === "ai_request" ? row.quantity : 1;
    }
    return out;
  }

  async recent(userId: string, limit: number): Promise<UsageEvent[]> {
    const { data, error } = await this.client
      .from("usage_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as unknown as UsageEvent[]).map((r) => ({ ...r, ref_id: r.ref_id ?? null }));
  }

  async aggregates(userId: string): Promise<UsageAggregates> {
    const base: UsageAggregates = {
      papersUploaded: 0, papersAnalyzed: 0, aiRequests: 0, promptTokens: 0,
      completionTokens: 0, costUsd: 0, failedAiRequests: 0, storageBytes: 0,
      collections: 0, nsgRuns: 0, nsgRepairs: 0,
    };
    const c = this.client;

    const [uploads, analyzed, usageAgg, storage, docsAgg, collections, nsg] = await Promise.all([
      c.from("paper_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("source_type", "pdf"),
      c.from("paper_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", ["analyzed", "completed"]),
      c.from("ai_usage_log").select("requests,prompt_tokens,completion_tokens,cost_usd,failure").eq("user_id", userId),
      c.from("paper_jobs").select("file_size,temporary_file_path,source_purged").eq("user_id", userId),
      c.from("extracted_documents").select("char_count").eq("user_id", userId),
      c.from("research_collections").select("id", { count: "exact", head: true }).eq("user_id", userId),
      c.from("nsg_progress").select("attempts,completed").eq("user_id", userId),
    ]);

    base.papersUploaded = uploads.count ?? 0;
    base.papersAnalyzed = analyzed.count ?? 0;

    for (const row of (usageAgg.data ?? []) as {
      requests: number; prompt_tokens: number; completion_tokens: number; cost_usd: number; failure: boolean;
    }[]) {
      base.aiRequests += row.requests ?? 0;
      base.promptTokens += row.prompt_tokens ?? 0;
      base.completionTokens += row.completion_tokens ?? 0;
      base.costUsd += Number(row.cost_usd ?? 0);
      if (row.failure) base.failedAiRequests += 1;
    }

    for (const row of (storage.data ?? []) as {
      file_size: number | null; temporary_file_path: string | null; source_purged: boolean;
    }[]) {
      // only files still in temporary intake count toward storage
      if (row.temporary_file_path && !row.source_purged) base.storageBytes += row.file_size ?? 0;
    }
    for (const row of (docsAgg.data ?? []) as { char_count: number }[]) {
      base.storageBytes += row.char_count ?? 0; // derived structure (text) kept after originals are purged
    }

    base.collections = collections.count ?? 0;
    for (const row of (nsg.data ?? []) as { attempts: number; completed: boolean }[]) {
      base.nsgRuns += row.attempts ?? 0;
      if (row.completed) base.nsgRepairs += 1;
    }
    return base;
  }
}

/* ---------- Demo: deterministic local ledger over the same stores ---------- */

const DEMO_EVENTS_KEY = "bn_demo_usage_events_v1";

function readDemoEvents(): UsageEvent[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_EVENTS_KEY) ?? "[]") as UsageEvent[];
  } catch {
    return [];
  }
}
function writeDemoEvents(events: UsageEvent[]) {
  try {
    localStorage.setItem(DEMO_EVENTS_KEY, JSON.stringify(events.slice(0, 400)));
  } catch {
    /* non-fatal */
  }
}

function readJson<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

class DemoUsageLedger implements UsageLedger {
  readonly mode = "demo" as const;

  private filterOwn<T extends { user_id: string }>(rows: T[], userId: string): T[] {
    return rows.filter((r) => r.user_id === userId);
  }

  async record(userId: string, ev: Omit<UsageEvent, "id" | "created_at" | "user_id">): Promise<void> {
    // same caps the DB trigger enforces — applied deterministically
    const today = await this.today(userId);
    const used = today[ev.kind] + (ev.kind === "ai_request" ? ev.quantity : 1);
    if (used > DAILY_CAPS[ev.kind]) {
      throw new Error(`QUOTA_EXCEEDED:${ev.kind}: daily limit of ${DAILY_CAPS[ev.kind]} reached`);
    }
    // duplicate-analysis billing guard
    if (ev.kind === "paper_analysis" && ev.ref_id) {
      const dup = readDemoEvents().some(
        (e) => e.user_id === userId && e.kind === "paper_analysis" && e.ref_id === ev.ref_id,
      );
      if (dup) throw new Error("duplicate key value violates usage_events_analysis_unique");
    }
    const event: UsageEvent = {
      ...ev,
      user_id: userId,
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      created_at: new Date().toISOString(),
    };
    writeDemoEvents([event, ...readDemoEvents()]);
  }

  async today(userId: string): Promise<Record<UsageKind, number>> {
    const out: Record<UsageKind, number> = {
      paper_upload: 0, paper_analysis: 0, ai_request: 0, nsg_run: 0, collection_create: 0,
    };
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    for (const e of this.filterOwn(readDemoEvents(), userId)) {
      if (new Date(e.created_at) >= dayStart && e.kind in out) {
        out[e.kind] += e.kind === "ai_request" ? e.quantity : 1;
      }
    }
    return out;
  }

  async recent(userId: string, limit: number): Promise<UsageEvent[]> {
    return this.filterOwn(readDemoEvents(), userId).slice(0, limit);
  }

  async aggregates(userId: string): Promise<UsageAggregates> {
    const base: UsageAggregates = {
      papersUploaded: 0, papersAnalyzed: 0, aiRequests: 0, promptTokens: 0,
      completionTokens: 0, costUsd: 0, failedAiRequests: 0, storageBytes: 0,
      collections: 0, nsgRuns: 0, nsgRepairs: 0,
    };
    type JobRow = { user_id: string; source_type: string; status: string; file_size: number | null; temporary_file_path: string | null; source_purged?: boolean };
    type AnalysisRow = { user_id: string; usage: { requests: number; prompt_tokens: number; completion_tokens: number; cost_usd: number; failures: number } };
    type DocRow = { user_id: string; doc: { charCount: number } };
    type NsgRow = { user_id: string; attempts: number; completed: boolean };

    const jobs = this.filterOwn(readJson<JobRow>("bn_demo_jobs_v1"), userId);
    const analyses = this.filterOwn(readJson<AnalysisRow>("bn_demo_analyses_v1"), userId);
    const docs = this.filterOwn(readJson<DocRow>("bn_demo_docs_v1"), userId);
    const nsg = this.filterOwn(readJson<NsgRow>("bn_demo_nsg_v1"), userId);
    const collections = this.filterOwn(readJson<{ user_id: string }>("bn_demo_collections_v1"), userId);

    base.papersUploaded = jobs.filter((j) => j.source_type === "pdf").length;
    base.papersAnalyzed = jobs.filter((j) => j.status === "analyzed" || j.status === "completed").length;
    for (const a of analyses) {
      base.aiRequests += a.usage?.requests ?? 0;
      base.promptTokens += a.usage?.prompt_tokens ?? 0;
      base.completionTokens += a.usage?.completion_tokens ?? 0;
      base.costUsd += a.usage?.cost_usd ?? 0;
      base.failedAiRequests += a.usage?.failures ?? 0;
    }
    for (const j of jobs) {
      if (j.temporary_file_path && !j.source_purged) base.storageBytes += j.file_size ?? 0;
    }
    for (const d of docs) base.storageBytes += d.doc?.charCount ?? 0;
    base.collections = collections.length;
    for (const n of nsg) {
      base.nsgRuns += n.attempts ?? 0;
      if (n.completed) base.nsgRepairs += 1;
    }
    return base;
  }
}

let ledgerSingleton: UsageLedger | null = null;
export function getUsageLedger(): UsageLedger {
  ledgerSingleton ??= isSupabaseConfigured ? new SupabaseUsageLedger() : new DemoUsageLedger();
  return ledgerSingleton;
}

/* ================= formatting ================= */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/* ================= the hook ================= */

export type UsageState = {
  mode: "supabase" | "demo";
  loading: boolean;
  aggregates: UsageAggregates;
  today: Record<UsageKind, number>;
  events: UsageEvent[];
  refresh: () => Promise<void>;
};

export function useUsage(): UsageState {
  const { user } = useAuth();
  const { jobs } = useSynapse();
  const { totals } = useNsgProgress();
  const ledger = getUsageLedger();

  const [loading, setLoading] = useState(true);
  const [aggregates, setAggregates] = useState<UsageAggregates>({
    papersUploaded: 0, papersAnalyzed: 0, aiRequests: 0, promptTokens: 0,
    completionTokens: 0, costUsd: 0, failedAiRequests: 0, storageBytes: 0,
    collections: 0, nsgRuns: 0, nsgRepairs: 0,
  });
  const [today, setToday] = useState<Record<UsageKind, number>>({
    paper_upload: 0, paper_analysis: 0, ai_request: 0, nsg_run: 0, collection_create: 0,
  });
  const [events, setEvents] = useState<UsageEvent[]>([]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [agg, day, evts] = await Promise.all([
        ledger.aggregates(user.id),
        ledger.today(user.id),
        ledger.recent(user.id, 14),
      ]);
      setAggregates(agg);
      setToday(day);
      setEvents(evts);
    } finally {
      setLoading(false);
    }
  }, [ledger, user]);

  // re-measure whenever the user's real activity changes
  useEffect(() => {
    if (user) void refresh();
  }, [user?.id, jobs.length, totals.attempted, refresh, user]);

  return useMemo(
    () => ({ mode: ledger.mode, loading, aggregates, today, events, refresh }),
    [ledger.mode, loading, aggregates, today, events, refresh],
  );
}
