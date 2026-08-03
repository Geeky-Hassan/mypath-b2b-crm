import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ROLE_LABELS, type UserRole } from '../../types/domain'
import { useToast } from '../ui/ToastProvider'

interface NavItem {
  path: string
  label: string
  marker: string
  roles: UserRole[]
}

const navigation: NavItem[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    marker: 'D',
    roles: ['founder', 'lead_generator'],
  },
  { path: '/leads', label: 'Leads', marker: 'L', roles: ['founder', 'lead_generator'] },
  {
    path: '/pipeline',
    label: 'Pipeline',
    marker: 'P',
    roles: ['founder', 'lead_generator'],
  },
  {
    path: '/analytics',
    label: 'Analytics',
    marker: 'A',
    roles: ['founder', 'lead_generator'],
  },
  {
    path: '/targets',
    label: 'Targets',
    marker: 'T',
    roles: ['founder', 'lead_generator'],
  },
  { path: '/tasks', label: 'Tasks', marker: 'K', roles: ['founder', 'lead_generator'] },
  { path: '/team', label: 'Team', marker: 'M', roles: ['founder'] },
  {
    path: '/import',
    label: 'Bulk import',
    marker: 'I',
    roles: ['founder', 'lead_generator'],
  },
  { path: '/settings', label: 'Settings', marker: 'S', roles: ['founder'] },
]

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/leads': 'Lead workspace',
  '/pipeline': 'Shared pipeline',
  '/analytics': 'Journey analytics',
  '/targets': 'Sales targets',
  '/tasks': 'Team tasks',
  '/team': 'Team operations',
  '/import': 'Import & export',
  '/settings': 'CRM settings',
}

function NavMarker({ marker }: { marker: string }) {
  const paths: Record<string, ReactNode> = {
    D: (
      <>
        <rect x="3" y="3" width="4" height="4" rx="1" />
        <rect x="11" y="3" width="4" height="4" rx="1" />
        <rect x="3" y="11" width="4" height="4" rx="1" />
        <rect x="11" y="11" width="4" height="4" rx="1" />
      </>
    ),
    L: (
      <>
        <circle cx="7" cy="6" r="2.5" />
        <path d="M2.8 14c.5-2.5 2-3.8 4.2-3.8s3.7 1.3 4.2 3.8" />
        <path d="M12 6.2h3.2M12 9.5h3.2" />
      </>
    ),
    P: (
      <>
        <rect x="2.5" y="3" width="3.5" height="12" rx="1" />
        <rect x="7.3" y="5" width="3.5" height="10" rx="1" />
        <rect x="12" y="7.5" width="3.5" height="7.5" rx="1" />
      </>
    ),
    A: (
      <>
        <path d="M3 14V9.5M8.8 14V5.5M14.6 14V3" />
        <path d="m3 7 5.8-3 5.8-2" />
      </>
    ),
    T: (
      <>
        <circle cx="9" cy="9" r="6" />
        <circle cx="9" cy="9" r="2.2" />
        <path d="m11 7 4-4M12.5 3H15v2.5" />
      </>
    ),
    K: (
      <>
        <rect x="3" y="3" width="12" height="12" rx="2" />
        <path d="m6 9 2 2 4-5" />
      </>
    ),
    M: (
      <>
        <circle cx="6" cy="6" r="2.2" />
        <circle cx="12.5" cy="7" r="1.8" />
        <path d="M2.5 14c.4-2.5 1.7-3.7 3.8-3.7s3.4 1.2 3.8 3.7M10 13.7c.3-1.7 1.2-2.6 2.8-2.6 1.5 0 2.4.9 2.7 2.6" />
      </>
    ),
    I: (
      <>
        <path d="M9 2.5v9M5.5 8 9 11.5 12.5 8" />
        <path d="M3 13v2h12v-2" />
      </>
    ),
    S: (
      <>
        <path d="M3 5h12M3 9h12M3 13h12" />
        <circle cx="6" cy="5" r="1.5" fill="white" />
        <circle cx="12" cy="9" r="1.5" fill="white" />
        <circle cx="8" cy="13" r="1.5" fill="white" />
      </>
    ),
  }

  return (
    <span className="flex size-5 items-center justify-center text-current opacity-75">
      <svg
        viewBox="0 0 18 18"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {paths[marker]}
      </svg>
    </span>
  )
}

export function AppShell() {
  const { profile, user, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const location = useLocation()
  const { toast } = useToast()
  if (!profile) return null

  const items = navigation.filter((item) => item.roles.includes(profile.role))

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      toast({ title: 'Signed out successfully.', tone: 'success' })
    } catch (caught) {
      toast({
        title: 'Sign out failed.',
        description:
          caught instanceof Error ? caught.message : 'Please try signing out again.',
        tone: 'error',
      })
    } finally {
      setSigningOut(false)
    }
  }

  const sidebar = (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-blue-100 px-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-700 to-cyan-500 text-[11px] font-black tracking-wide text-white shadow-[0_8px_20px_rgba(37,99,235,0.24)]">
          MP
        </div>
        <div>
          <p className="text-sm font-bold tracking-tight text-slate-900">MyPath CRM</p>
          <p className="text-[11px] text-slate-500">Revenue workspace</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3" aria-label="Primary navigation">
        <p className="px-2 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Workspace
        </p>
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${
                isActive
                  ? 'bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-800 shadow-[inset_0_0_0_1px_rgba(147,197,253,0.35)]'
                  : 'text-slate-600 hover:bg-blue-50/70 hover:text-blue-800'
              }`
            }
          >
            <NavMarker marker={item.marker} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-blue-100 bg-blue-50/30 p-4">
        <p className="truncate text-xs font-semibold text-slate-800">
          {profile.full_name}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {ROLE_LABELS[profile.role]}
        </p>
      </div>
    </>
  )

  return (
    <div className="app-ambient min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-blue-100 bg-white/90 shadow-[8px_0_30px_rgba(37,99,235,0.035)] backdrop-blur-xl lg:flex">
        {sidebar}
      </aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/25"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-64 flex-col border-r border-blue-100 bg-white">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-56">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-blue-100 bg-white/80 px-4 shadow-[0_6px_24px_rgba(37,99,235,0.035)] backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-lg border border-blue-100 bg-white text-base text-blue-700 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <svg
                viewBox="0 0 18 18"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3 5h12M3 9h12M3 13h12" />
              </svg>
            </button>
            <div>
              <p className="text-[11px] font-medium text-slate-500">MyPath CRM</p>
              <p className="text-[13px] font-semibold text-slate-900">
                {pageTitles[location.pathname] ?? 'Workspace'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-slate-800">{profile.full_name}</p>
              <p className="max-w-48 truncate text-[11px] text-slate-500">
                {user?.email}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="rounded-lg border border-blue-100 bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"
            >
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1480px] p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
