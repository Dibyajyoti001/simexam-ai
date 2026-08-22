import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"

interface PrivateRouteProps {
  children: React.ReactNode
  /** If specified, user must have this role. If omitted, any authenticated user passes. */
  role?: "admin" | "student" | "viewer"
}

/**
 * Wraps a route to require authentication. Redirects to /login if not authenticated.
 * Optionally enforces a role (admin, student). Shows loading spinner while auth state resolves.
 */
export function PrivateRoute({ children, role }: PrivateRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (role && user?.role !== role) {
    // Wrong role — redirect to their appropriate landing
    if (user?.role === "admin") return <Navigate to={`/${user.orgSlug}/admin`} replace />
    if (user?.role === "student") return <Navigate to="/dashboard" replace />
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
