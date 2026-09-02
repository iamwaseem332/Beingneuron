/**
 * Phase 11 — NeuroSurgery challenge progress.
 *
 * Per-user, per-scenario, per-difficulty records. Supabase mode persists to
 * the RLS-protected `nsg_progress` table (users can only ever read/write
 * their own rows); demo mode keeps an equivalent record in localStorage and
 * is clearly labelled in the UI. Attempts, completions, best metrics and
 * working diagnoses are tracked — nothing more, on purpose.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "../auth/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import type { Difficulty, DiagnosisId } from "./nnEngine";

/* ================= types ================= */

export type DiagnosisEntry = {
  at: string;
  suspect: DiagnosisId;
  matched: boolean | null; // null until the case is resolved
};

export type ScenarioRecord = {
  scenarioId: string;
  difficulty: Difficulty;
  attempts: number;
  completed: boolean;
  completedAt: string | null;
  bestValAcc: number | null;
  bestValLoss: number | null;
  bestSteps: number | null; // interventions needed for the first successful repair
  diagnoses: DiagnosisEntry[];
  updatedAt: string;
};

export type RunOutcome = {
  valAcc: number | null;
  valLoss: number | null;
  success: boolean;
};

export const recordKey = (scenarioId: string, difficulty: Difficulty): string =>
  `${scenarioId}::${difficulty}`;

function emptyRecord(scenarioId: string, difficulty: Difficulty): ScenarioRecord {
  return {
    scenarioId,
    difficulty,
    attempts: 0,
    completed: false,
    completedAt: null,
    bestValAcc: null,
    bestValLoss: null,
    bestSteps: null,
    diagnoses: [],
    updatedAt: new Date().toISOString(),
  };
}

/* ================= adapters ================= */

interface NsgAdapter {
  list(userId: string): Promise<ScenarioRecord[]>;
  upsert(userId: string, rec: ScenarioRecord): Promise<void>;
}

type DbRow = {
  user_id: string;
  scenario_id: string;
  difficulty: Difficulty;
  attempts: number;
  completed: boolean;
  completed_at: string | null;
  best_val_acc: number | null;
  best_val_loss: number | null;
  best_steps: number | null;
  diagnoses: DiagnosisEntry[];
  updated_at: string;
};

const rowToRecord = (r: DbRow): ScenarioRecord => ({
  scenarioId: r.scenario_id,
  difficulty: r.difficulty,
  attempts: r.attempts,
  completed: r.completed,
  completedAt: r.completed_at,
  bestValAcc: r.best_val_acc,
  bestValLoss: r.best_val_loss,
  bestSteps: r.best_steps,
  diagnoses: r.diagnoses ?? [],
  updatedAt: r.updated_at,
});

const recordToRow = (userId: string, rec: ScenarioRecord): DbRow => ({
  user_id: userId,
  scenario_id: rec.scenarioId,
  difficulty: rec.difficulty,
  attempts: rec.attempts,
  completed: rec.completed,
  completed_at: rec.completedAt,
  best_val_acc: rec.bestValAcc,
  best_val_loss: rec.bestValLoss,
  best_steps: rec.bestSteps,
  diagnoses: rec.diagnoses,
  updated_at: rec.updatedAt,
});

class SupabaseNsgAdapter implements NsgAdapter {
  private client = supabase!;

  async list(userId: string): Promise<ScenarioRecord[]> {
    const { data, error } = await this.client
      .from("nsg_progress")
      .select("*")
      .eq("user_id", userId);
    if (error) return []; // RLS/availability issue — progress still works locally
    return ((data as unknown as DbRow[]) ?? []).map(rowToRecord);
  }

  async upsert(userId: string, rec: ScenarioRecord): Promise<void> {
    await this.client.from("nsg_progress").upsert(recordToRow(userId, rec), {
      onConflict: "user_id,scenario_id,difficulty",
    });
  }
}

const DEMO_KEY = "bn_demo_nsg_v1";

function readDemo(): (DbRow & { user_id: string })[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? "[]") as DbRow[];
  } catch {
    return [];
  }
}
function writeDemo(rows: DbRow[]) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(rows));
  } catch {
    /* non-fatal */
  }
}

class DemoNsgAdapter implements NsgAdapter {
  private delay(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  async list(userId: string): Promise<ScenarioRecord[]> {
    await this.delay(180);
    return readDemo()
      .filter((r) => r.user_id === userId)
      .map(rowToRecord);
  }

  async upsert(userId: string, rec: ScenarioRecord): Promise<void> {
    await this.delay(120);
    const rows = readDemo().filter(
      (r) => !(r.user_id === userId && r.scenario_id === rec.scenarioId && r.difficulty === rec.difficulty),
    );
    rows.push(recordToRow(userId, rec));
    writeDemo(rows);
  }
}

/* ================= context ================= */

export type NsgTotals = {
  attempted: number; // distinct scenario+difficulty pairs with ≥1 attempt
  completed: number; // pairs repaired at least once
  repairs: number; // total successful repairs (== completed here)
  bestSteps: number | null; // smallest intervention count to a repair
};

type NsgValue = {
  mode: "supabase" | "demo";
  records: Record<string, ScenarioRecord>;
  loading: boolean;
  totals: NsgTotals;
  recordRun: (scenarioId: string, difficulty: Difficulty, outcome: RunOutcome) => Promise<void>;
  recordDiagnosis: (
    scenarioId: string,
    difficulty: Difficulty,
    suspect: DiagnosisId,
    truth: DiagnosisId,
  ) => Promise<void>;
};

const NsgContext = createContext<NsgValue | null>(null);

export function NsgProgressProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const adapter = useMemo<NsgAdapter>(
    () => (isSupabaseConfigured ? new SupabaseNsgAdapter() : new DemoNsgAdapter()),
    [],
  );
  const mode: NsgValue["mode"] = isSupabaseConfigured ? "supabase" : "demo";

  const [records, setRecords] = useState<Record<string, ScenarioRecord>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setRecords({});
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    adapter
      .list(user.id)
      .then((recs) => {
        if (!active) return;
        setRecords(Object.fromEntries(recs.map((r) => [recordKey(r.scenarioId, r.difficulty), r])));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [adapter, user?.id, user]);

  const merge = useCallback((rec: ScenarioRecord) => {
    setRecords((prev) => ({ ...prev, [recordKey(rec.scenarioId, rec.difficulty)]: rec }));
  }, []);

  const recordRun = useCallback<NsgValue["recordRun"]>(
    async (scenarioId, difficulty, outcome) => {
      if (!user) return;
      const key = recordKey(scenarioId, difficulty);
      const prev = records[key] ?? emptyRecord(scenarioId, difficulty);
      const attempts = prev.attempts + 1;

      const better = (a: number | null, b: number | null, min: boolean) => {
        if (a === null) return b;
        if (b === null || !Number.isFinite(b)) return a;
        return min ? Math.min(a, b) : Math.max(a, b);
      };

      const rec: ScenarioRecord = {
        ...prev,
        attempts,
        bestValAcc: better(prev.bestValAcc, outcome.valAcc, false),
        bestValLoss: better(prev.bestValLoss, outcome.valLoss, true),
        completed: prev.completed || outcome.success,
        completedAt: !prev.completed && outcome.success ? new Date().toISOString() : prev.completedAt,
        bestSteps: !prev.completed && outcome.success ? attempts : prev.bestSteps,
        // once the case is resolved, stamp the recorded diagnoses with the truth match
        diagnoses:
          outcome.success && prev.diagnoses.some((d) => d.matched === null)
            ? prev.diagnoses.map((d) => (d.matched === null ? { ...d, matched: d.suspect === truthOf(scenarioId) } : d))
            : prev.diagnoses,
        updatedAt: new Date().toISOString(),
      };
      merge(rec);
      void adapter.upsert(user.id, rec).catch(() => undefined);
    },
    [adapter, user, records, merge],
  );

  const recordDiagnosis = useCallback<NsgValue["recordDiagnosis"]>(
    async (scenarioId, difficulty, suspect, truth) => {
      if (!user) return;
      const key = recordKey(scenarioId, difficulty);
      const prev = records[key] ?? emptyRecord(scenarioId, difficulty);
      const rec: ScenarioRecord = {
        ...prev,
        diagnoses: [
          ...prev.diagnoses.filter((d) => !(d.suspect === suspect && d.matched === null)),
          { at: new Date().toISOString(), suspect, matched: prev.completed ? suspect === truth : null },
        ].slice(-20),
        updatedAt: new Date().toISOString(),
      };
      merge(rec);
      void adapter.upsert(user.id, rec).catch(() => undefined);
    },
    [adapter, user, records, merge],
  );

  const totals = useMemo<NsgTotals>(() => {
    const recs = Object.values(records);
    const attempted = recs.filter((r) => r.attempts > 0).length;
    const completed = recs.filter((r) => r.completed).length;
    const steps = recs.map((r) => r.bestSteps).filter((s): s is number => s !== null);
    return {
      attempted,
      completed,
      repairs: completed,
      bestSteps: steps.length ? Math.min(...steps) : null,
    };
  }, [records]);

  const value = useMemo<NsgValue>(
    () => ({ mode, records, loading, totals, recordRun, recordDiagnosis }),
    [mode, records, loading, totals, recordRun, recordDiagnosis],
  );

  return <NsgContext.Provider value={value}>{children}</NsgContext.Provider>;
}

/* scenario id → canonical fault used to grade working diagnoses */
function truthOf(scenarioId: string): DiagnosisId {
  return scenarioId === "lr-high" || scenarioId === "lr-low" ? "lr-problem" : (scenarioId as DiagnosisId);
}

export function useNsgProgress(): NsgValue {
  const ctx = useContext(NsgContext);
  if (!ctx) throw new Error("useNsgProgress must be used inside <NsgProgressProvider>");
  return ctx;
}
