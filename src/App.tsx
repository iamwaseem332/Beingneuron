import { lazy, Suspense, useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, Outlet, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth, RedirectIfAuthed } from "./auth/RequireAuth";
import Nav from "./Nav";
import Footer from "./Footer";
import Landing from "./Landing";
import PricingPage from "./PricingPage";
import { LoginPage, SignupPage } from "./auth/AuthPages";
import { ForgotPasswordPage, ResetPasswordPage } from "./auth/PasswordResetPages";
import ProfilePage from "./auth/ProfilePage";
import SettingsPage from "./auth/SettingsPage";
import PlaceholderPage from "./Placeholder";
import PreviewPage from "./PreviewPage";
import RouteMeta from "./RouteMeta";
import AppLayout, { AppStandby } from "./app/AppLayout";
import { SynapseProvider } from "./app/SynapseProvider";
import { NsgProgressProvider } from "./app/nsgProgress";
import DashboardPage from "./app/DashboardPage";
import SynapsePage from "./app/SynapsePage";
import ResearchPage from "./app/ResearchPage";
import NeuroSurgeryPage from "./app/NeuroSurgeryPage";
import UsagePage from "./app/UsagePage";

/* Phase 8 — full research workspace (graph + inspector + analysis tabs).
   Heavy by nature, so it ships as its own chunk and only loads when an
   analyzed paper's workspace is opened. */
const WorkspacePage = lazy(() => import("./app/WorkspacePage"));
/* Phase 10 — NeuroSurgery simulation lab. Lazy-loaded so the engine ships
   only when a scenario is opened, not with the main bundle. */
const NeurosurgeryLab = lazy(() => import("./app/NeurosurgeryLab"));

function GraphFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-ink-400">
        <span className="spinner" style={{ borderTopColor: "var(--color-pulse-500)", borderColor: "rgba(11,26,38,0.15)" }} />
        <p className="font-mono text-[10.5px] uppercase tracking-[0.22em]">loading research workspace…</p>
      </div>
    </div>
  );
}

/** Phase 7's standalone graph URL now folds into the full workspace. */
function GraphRedirect() {
  const { jobId } = useParams<{ jobId: string }>();
  return <Navigate to={`/app/synapse/${jobId ?? ""}`} replace />;
}

function LabFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-ink-400">
        <span className="spinner" style={{ borderTopColor: "var(--color-pulse-500)", borderColor: "rgba(11,26,38,0.15)" }} />
        <p className="font-mono text-[10.5px] uppercase tracking-[0.22em]">scrubbing in · loading surgery lab…</p>
      </div>
    </div>
  );
}

/** Reset scroll on route change (section scrolls are handled by Landing via state). */
function ScrollManager() {
  const location = useLocation();
  useEffect(() => {
    const hasSectionTarget = Boolean((location.state as { scrollTo?: string } | null)?.scrollTo);
    if (!hasSectionTarget) window.scrollTo(0, 0);
  }, [location.pathname, location.state]);
  return null;
}

/**
 * The workspace (dashboard / app / usage) renders inside its own
 * application shell — no marketing nav or footer. Everything else
 * keeps the public-site chrome.
 */
function SiteChrome() {
  const { pathname } = useLocation();
  const inWorkspace =
    pathname === "/dashboard" ||
    pathname === "/usage" ||
    pathname.startsWith("/usage/") ||
    pathname === "/app" ||
    pathname.startsWith("/app/");

  if (inWorkspace) return <Outlet />;
  return (
    <>
      <Nav />
      <Outlet />
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <ScrollManager />
        <RouteMeta />
        <div className="relative min-h-screen bg-paper font-body text-ink-900">
          <Routes>
            <Route element={<SiteChrome />}>
              {/* ---------- public ---------- */}
              <Route path="/" element={<Landing />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route
                path="/login"
                element={
                  <RedirectIfAuthed>
                    <LoginPage />
                  </RedirectIfAuthed>
                }
              />
              <Route
                path="/signup"
                element={
                  <RedirectIfAuthed>
                    <SignupPage />
                  </RedirectIfAuthed>
                }
              />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/preview" element={<PreviewPage />} />

              {/* ---------- workspace (Phase 3 shell + Phase 4 intake) ---------- */}
              <Route
                element={
                  <RequireAuth>
                    <SynapseProvider>
                      <NsgProgressProvider>
                        <AppLayout />
                      </NsgProgressProvider>
                    </SynapseProvider>
                  </RequireAuth>
                }
              >
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/app" element={<Navigate to="/dashboard" replace />} />
                <Route path="/app/synapse" element={<SynapsePage />} />
                {/* Phase 8 workspace; Phase 7's graph URL redirects into it */}
                <Route
                  path="/app/synapse/:jobId"
                  element={
                    <Suspense fallback={<GraphFallback />}>
                      <WorkspacePage />
                    </Suspense>
                  }
                />
                <Route path="/app/synapse/graph/:jobId" element={<GraphRedirect />} />
                <Route path="/app/research" element={<ResearchPage />} />
                <Route path="/app/neurosurgery" element={<NeuroSurgeryPage />} />
                {/* Phase 10 surgery lab; must precede the :module catch-all */}
                <Route
                  path="/app/neurosurgery/:scenarioId"
                  element={
                    <Suspense fallback={<LabFallback />}>
                      <NeurosurgeryLab />
                    </Suspense>
                  }
                />
                <Route path="/app/:module" element={<AppStandby />} />
                <Route path="/usage" element={<UsagePage />} />
              </Route>

              {/* ---------- account pages (Phase 2, standalone) ---------- */}
              <Route
                path="/profile"
                element={
                  <RequireAuth>
                    <ProfilePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/settings"
                element={
                  <RequireAuth>
                    <SettingsPage />
                  </RequireAuth>
                }
              />

              {/* ---------- module-standby + 404 (public placeholders) ---------- */}
              <Route path="/:slug" element={<PlaceholderPage />} />
            </Route>
          </Routes>
          <div className="noise-layer" aria-hidden />
        </div>
      </AuthProvider>
    </HashRouter>
  );
}
