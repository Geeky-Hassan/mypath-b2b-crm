import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { FounderRoute, ProtectedRoute } from './auth/RouteGuards'
import { AppShell } from './components/layout/AppShell'
import { Alert, Button, PageLoader } from './components/ui'
import { ToastProvider } from './components/ui/ToastProvider'
import { BrandMark } from './components/BrandMark'
import { env, envIssues } from './lib/config'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const LeadsPage = lazy(() => import('./pages/LeadsPage'))
const PipelinePage = lazy(() => import('./pages/PipelinePage'))
const TargetsPage = lazy(() => import('./pages/TargetsPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const ImportPage = lazy(() => import('./pages/ImportPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const TasksPage = lazy(() => import('./pages/TasksPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled CRM error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-xl">
          <Alert tone="error" title="The CRM hit an unexpected error">
            <p>{this.state.error.message}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Reload application
            </Button>
          </Alert>
        </div>
      </div>
    )
  }
}

function ConfigurationScreen() {
  return (
    <main className="app-ambient flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-7 shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
        <BrandMark className="mb-5 h-10 w-14" />
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">
          Setup required
        </p>
        <h1 className="mt-2 text-xl font-bold text-slate-950">Connect MyPath CRM</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Copy <code>.env.example</code> to <code>.env</code>, add the Supabase project
          URL and anon key, then restart the development server.
        </p>
        <div className="mt-5 rounded-md bg-slate-950 p-4 font-mono text-xs text-slate-200">
          <p>VITE_SUPABASE_URL=…</p>
          <p>VITE_SUPABASE_ANON_KEY=…</p>
        </div>
        {envIssues.length ? (
          <p className="mt-4 text-xs text-slate-500">
            Missing or invalid: {envIssues.join(', ')}
          </p>
        ) : null}
      </div>
    </main>
  )
}

function PublicLoginRoute() {
  const location = useLocation()
  return <LoginPage returnTo={(location.state as { from?: string } | null)?.from} />
}

function App() {
  if (!env) return <ConfigurationScreen />

  return (
    <ToastProvider>
      <ErrorBoundary>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/login" element={<PublicLoginRoute />} />
                <Route
                  path="/change-password"
                  element={
                    <ProtectedRoute>
                      <ChangePasswordPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/leads" element={<LeadsPage />} />
                  <Route path="/pipeline" element={<PipelinePage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/targets" element={<TargetsPage />} />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/import" element={<ImportPage />} />
                  <Route
                    path="/team"
                    element={
                      <FounderRoute>
                        <TeamPage />
                      </FounderRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <FounderRoute>
                        <SettingsPage />
                      </FounderRoute>
                    }
                  />
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ErrorBoundary>
    </ToastProvider>
  )
}

export default App
