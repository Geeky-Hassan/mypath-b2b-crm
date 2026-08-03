import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Alert, PageLoader } from '../components/ui'
import { useAuth } from './AuthContext'
import { isFounder } from './permissions'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading, error, signOut } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader label="Opening your CRM…" />
  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from }} />
  }
  if (error || !profile) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <Alert tone="error" title="Your CRM profile is not ready">
          <p>
            {error ?? 'Ask the Supabase administrator to create your profile and role.'}
          </p>
          <p className="mt-2 text-xs">
            Your account may be disabled. Ask the Founder to check Users & access.
          </p>
          <button
            type="button"
            className="mt-3 text-xs font-bold underline"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </Alert>
      </div>
    )
  }
  if (profile.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  if (!profile.must_change_password && location.pathname === '/change-password') {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

export function FounderRoute({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  if (!isFounder(profile?.role)) return <Navigate to="/dashboard" replace />
  return children
}
