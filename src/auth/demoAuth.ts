import type { AuthAdapter, AuthResult, Profile, ProfilePatch, SessionUser } from "./authTypes";

/**
 * DEMO ADAPTER — active only when Supabase env vars are not configured.
 *
 * Accounts live exclusively in this browser's localStorage. Passwords are
 * SHA-256 hashed for hygiene, but this is NOT a production auth system —
 * it exists so every Phase 2 flow (signup, login, reset, profile, settings,
 * protected routes, session restore) can be exercised end-to-end before
 * Supabase credentials are attached. The UI labels demo mode everywhere.
 */

type StoredUser = {
  id: string;
  email: string;
  name: string;
  hash: string;
  createdAt: string;
};

const USERS_KEY = "bn_demo_users_v1";
const SESSION_KEY = "bn_demo_session_v1";

function readUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]") as StoredUser[];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function makeId(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function hashPassword(password: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bn-demo::${password}`));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // extremely defensive fallback (non-secure contexts) — demo mode only
    return `plain::${password.length}::${btoa(encodeURIComponent(password))}`;
  }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const RETENTION_KEY = "bn_demo_retention_v1";

function readRetention(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(RETENTION_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function writeRetention(map: Record<string, string>) {
  try {
    localStorage.setItem(RETENTION_KEY, JSON.stringify(map));
  } catch {
    /* non-fatal */
  }
}

function toProfile(u: StoredUser): Profile {
  const r = readRetention()[u.id];
  return {
    id: u.id,
    full_name: u.name,
    email: u.email,
    avatar_url: null,
    retention_policy:
      r === "keep_originals" || r === "purge_after_processing" ? (r as Profile["retention_policy"]) : null,
    created_at: u.createdAt,
    updated_at: u.createdAt,
  };
}

/* ---------- rate limiting (demo parity with Supabase's native throttling) ---------- */

const RATE_KEY = "bn_demo_auth_rate_v1";
type RateState = Record<string, { fails: number; lockedUntil: number; actions: number[] }>;

function readRate(): RateState {
  try {
    return JSON.parse(localStorage.getItem(RATE_KEY) ?? "{}") as RateState;
  } catch {
    return {};
  }
}
function writeRate(s: RateState) {
  try {
    localStorage.setItem(RATE_KEY, JSON.stringify(s));
  } catch {
    /* non-fatal */
  }
}

function lockRemaining(key: string, maxFails: number): number {
  const s = readRate()[key];
  if (!s) return 0;
  if (s.lockedUntil > Date.now()) return Math.ceil((s.lockedUntil - Date.now()) / 60000);
  return s.fails >= maxFails ? 15 : 0;
}

export class DemoAdapter implements AuthAdapter {
  readonly mode = "demo" as const;
  private listeners = new Set<(user: SessionUser | null) => void>();

  private currentUserId(): string | null {
    return localStorage.getItem(SESSION_KEY);
  }

  private findUser(email: string): StoredUser | undefined {
    const norm = email.trim().toLowerCase();
    return readUsers().find((u) => u.email === norm);
  }

  private emit() {
    const id = this.currentUserId();
    const user = id ? readUsers().find((u) => u.id === id) : undefined;
    const session = user ? { id: user.id, email: user.email } : null;
    this.listeners.forEach((cb) => cb(session));
  }

  async getSession(): Promise<SessionUser | null> {
    await delay(350); // make the boot loading state perceptible
    const id = this.currentUserId();
    if (!id) return null;
    const user = readUsers().find((u) => u.id === id);
    return user ? { id: user.id, email: user.email } : null;
  }

  onAuthChange(cb: (user: SessionUser | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async signUp(input: { fullName: string; email: string; password: string }): Promise<AuthResult> {
    await delay(650);
    if (this.findUser(input.email)) {
      return {
        status: "error",
        message: "An account already exists with this email. Try logging in instead.",
      };
    }
    const user: StoredUser = {
      id: makeId(),
      email: input.email.trim().toLowerCase(),
      name: input.fullName.trim(),
      hash: await hashPassword(input.password),
      createdAt: new Date().toISOString(),
    };
    writeUsers([...readUsers(), user]);
    localStorage.setItem(SESSION_KEY, user.id);
    this.emit();
    // Demo has no email confirmation — behaves like Supabase with confirmation disabled.
    return { status: "signed_in", user: { id: user.id, email: user.email } };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    await delay(650);
    const key = `login::${email.trim().toLowerCase()}`;
    const locked = lockRemaining(key, 5);
    if (locked > 0) {
      return {
        status: "error",
        message: `Too many failed attempts. Try again in ~${locked} minute${locked === 1 ? "" : "s"}.`,
      };
    }
    const user = this.findUser(email);
    if (!user || user.hash !== (await hashPassword(password))) {
      const rate = readRate();
      const cur = rate[key] ?? { fails: 0, lockedUntil: 0, actions: [] };
      const fails = cur.lockedUntil > Date.now() ? cur.fails : cur.fails + 1;
      rate[key] = {
        ...cur,
        fails,
        lockedUntil: fails >= 5 ? Date.now() + 15 * 60_000 : cur.lockedUntil,
      };
      writeRate(rate);
      if (fails >= 5) {
        return { status: "error", message: "Too many failed attempts. Login locked for 15 minutes." };
      }
      return { status: "error", message: "Incorrect email or password." };
    }
    const rate = readRate();
    delete rate[key];
    writeRate(rate);
    localStorage.setItem(SESSION_KEY, user.id);
    this.emit();
    return { status: "signed_in", user: { id: user.id, email: user.email } };
  }

  async signOut(): Promise<void> {
    await delay(250);
    localStorage.removeItem(SESSION_KEY);
    this.emit();
  }

  async requestPasswordReset(_email: string): Promise<void> {
    await delay(550); // neutral by design — no existence check revealed
  }

  async completePasswordReset(input: { email?: string; newPassword: string }): Promise<void> {
    await delay(600);
    const email = input.email ?? "";
    const users = readUsers();
    const idx = users.findIndex((u) => u.email === email.trim().toLowerCase());
    if (idx === -1) throw new Error("No demo account matches that email address.");
    users[idx] = { ...users[idx], hash: await hashPassword(input.newPassword) };
    writeUsers(users);
  }

  async changePassword(newPassword: string): Promise<void> {
    await delay(550);
    const id = this.currentUserId();
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error("Your session has expired. Please log in again.");
    users[idx] = { ...users[idx], hash: await hashPassword(newPassword) };
    writeUsers(users);
  }

  async getProfile(userId: string): Promise<Profile | null> {
    await delay(300);
    const user = readUsers().find((u) => u.id === userId);
    return user ? toProfile(user) : null;
  }

  async ensureProfile(user: SessionUser, fullName = ""): Promise<Profile> {
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx === -1) {
      const created: StoredUser = {
        id: user.id,
        email: user.email,
        name: fullName,
        hash: "",
        createdAt: new Date().toISOString(),
      };
      writeUsers([...users, created]);
      return toProfile(created);
    }
    if (fullName && !users[idx].name) {
      users[idx] = { ...users[idx], name: fullName };
      writeUsers(users);
    }
    return toProfile(users[idx]);
  }

  async updateProfile(userId: string, patch: ProfilePatch): Promise<Profile> {
    await delay(450);
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) throw new Error("Your session has expired. Please log in again.");
    const next = { ...users[idx] };
    if (patch.full_name !== undefined) next.name = patch.full_name.trim().slice(0, 120);
    if (patch.retention_policy !== undefined) {
      const map = readRetention();
      map[userId] = patch.retention_policy;
      writeRetention(map);
    }
    users[idx] = next;
    writeUsers(users);
    return toProfile(next);
  }

  async deleteAccount(userId: string): Promise<void> {
    await delay(600);
    // Remove this user from the demo user list and their retention choice.
    writeUsers(readUsers().filter((u) => u.id !== userId));
    const retentionMap = readRetention();
    delete retentionMap[userId];
    writeRetention(retentionMap);
    localStorage.removeItem(SESSION_KEY);

    // Wipe every browser-local demo store (jobs, analyses, docs, graphs,
    // architectures, NSG progress, usage, rate state, collections). These are
    // keyed per-browser in demo mode, so a full clear is the correct scope.
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith("bn_demo_")) doomed.push(key);
      }
      doomed.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* best effort */
    }

    // Best-effort drop of the IndexedDB blob store (temporary PDFs).
    try {
      if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase("bn-demo-intake");
    } catch {
      /* best effort */
    }

    this.listeners.forEach((cb) => cb(null));
  }
}
