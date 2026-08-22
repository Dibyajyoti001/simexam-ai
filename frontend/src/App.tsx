import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom"
import { PrivateRoute } from "./components/PrivateRoute"
import { useAuth } from "./hooks/useAuth"
import LandingPage from "./app/page"
import WorkspacePage from "./app/workspace/page"
import ResultsPage from "./app/results/page"
import LoginPage from "./app/login/page"
import StudentDashboard from "./app/student/page"
import IntakePage from "./app/intake/page"
import AdminDashboardPage from "./app/org/AdminDashboardPage"
import AdminConfigPage from "./app/org/AdminConfigPage"
import AdminSessionPage from "./app/org/AdminSessionPage"

/**
 * Smart redirect for /admin root route.
 * Redirects admin to their org dashboard, or to login if not logged in.
 */
function AdminRouteRedirect() {
  const { isAuthenticated, user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
      </div>
    )
  }

  if (isAuthenticated && user?.role === "admin") {
    return <Navigate to={`/${user.orgSlug}/admin`} replace />
  }

  return <Navigate to="/login" replace />
}

/**
 * Smart redirect for /:orgSlug root.
 * If user is admin for this org -> admin dashboard, otherwise -> intake.
 */
function OrgRootRedirect() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const { isAuthenticated, user } = useAuth()

  if (isAuthenticated && user?.role === "admin" && user.orgSlug === orgSlug) {
    return <Navigate to={`/${orgSlug}/admin`} replace />
  }

  return <Navigate to={`/${orgSlug || "demo"}/intake`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Smart redirects */}
        <Route path="/admin" element={<AdminRouteRedirect />} />
        <Route path="/:orgSlug" element={<OrgRootRedirect />} />

        {/* Student & Learner routes */}
        <Route path="/dashboard" element={
          <PrivateRoute>
            <StudentDashboard />
          </PrivateRoute>
        } />
        <Route path="/learn" element={
          <PrivateRoute>
            <StudentDashboard />
          </PrivateRoute>
        } />

        {/* Assessment Intake & Setup */}
        <Route path="/:orgSlug/intake" element={
          <PrivateRoute>
            <IntakePage />
          </PrivateRoute>
        } />
        <Route path="/:orgSlug/intake/:token" element={
          <PrivateRoute>
            <IntakePage />
          </PrivateRoute>
        } />

        {/* Dynamic Workspace */}
        <Route path="/exam" element={<Navigate to="/demo/exam" replace />} />
        <Route path="/:orgSlug/exam" element={
          <PrivateRoute>
            <WorkspacePage />
          </PrivateRoute>
        } />
        <Route path="/:orgSlug/exam/:token" element={
          <PrivateRoute>
            <WorkspacePage />
          </PrivateRoute>
        } />

        {/* Evaluation & Results */}
        <Route path="/results" element={
          <PrivateRoute>
            <ResultsPage />
          </PrivateRoute>
        } />
        <Route path="/:orgSlug/results" element={
          <PrivateRoute>
            <ResultsPage />
          </PrivateRoute>
        } />

        {/* Organization / Admin routes */}
        <Route path="/:orgSlug/admin" element={
          <PrivateRoute role="admin">
            <AdminDashboardPage />
          </PrivateRoute>
        } />
        <Route path="/:orgSlug/admin/config" element={
          <PrivateRoute role="admin">
            <AdminConfigPage />
          </PrivateRoute>
        } />
        <Route path="/:orgSlug/admin/session/:sessionId" element={
          <PrivateRoute role="admin">
            <AdminSessionPage />
          </PrivateRoute>
        } />

        {/* Fallback */}
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  )
}
