import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'
import type { Profile } from '../types/domain'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  error: string | null
  sessionInterrupted: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  reloadProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data as Profile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionInterrupted, setSessionInterrupted] = useState(false)
  const profileRequest = useRef(0)
  const mountedRef = useRef(true)
  const sessionRef = useRef<Session | null>(null)
  const profileRef = useRef<Profile | null>(null)
  const hadAuthenticatedSessionRef = useRef(false)
  const deliberateSignOutRef = useRef(false)

  const loadProfile = useCallback(async (userId: string, blocking: boolean) => {
    const requestId = ++profileRequest.current
    if (blocking) setLoading(true)
    try {
      const nextProfile = await fetchProfile(userId)
      if (
        !mountedRef.current ||
        profileRequest.current !== requestId ||
        sessionRef.current?.user.id !== userId
      ) {
        return
      }
      profileRef.current = nextProfile
      setProfile(nextProfile)
      setError(null)
    } catch (caught) {
      if (!mountedRef.current || profileRequest.current !== requestId) return
      console.error('CRM profile load failed', caught)
      if (!profileRef.current) {
        setProfile(null)
        setError(
          'Your CRM profile could not be loaded. Ask the administrator to check your role.',
        )
      }
    } finally {
      if (mountedRef.current && profileRequest.current === requestId) setLoading(false)
    }
  }, [])

  const acceptSession = useCallback(
    (event: AuthChangeEvent, nextSession: Session | null) => {
      const previousUserId = sessionRef.current?.user.id ?? null
      const nextUserId = nextSession?.user.id ?? null
      const userChanged = previousUserId !== nextUserId
      const hadAuthenticatedSession = hadAuthenticatedSessionRef.current

      sessionRef.current = nextSession
      setSession(nextSession)

      if (!nextSession?.user) {
        hadAuthenticatedSessionRef.current = false
        if (hadAuthenticatedSession && !deliberateSignOutRef.current) {
          setSessionInterrupted(true)
        }
        profileRequest.current += 1
        profileRef.current = null
        setProfile(null)
        setError(null)
        setLoading(false)
        return
      }

      hadAuthenticatedSessionRef.current = true
      setSessionInterrupted(false)
      const userId = nextSession.user.id
      if (event === 'TOKEN_REFRESHED') return

      const hasCurrentProfile = profileRef.current?.id === userId
      if (event === 'SIGNED_IN' && hasCurrentProfile && !userChanged) return

      if (event === 'USER_UPDATED' && hasCurrentProfile && !userChanged) {
        queueMicrotask(() => {
          if (mountedRef.current) void loadProfile(userId, false)
        })
        return
      }

      if (!hasCurrentProfile || userChanged) {
        setError(null)
        queueMicrotask(() => {
          if (mountedRef.current) void loadProfile(userId, true)
        })
      }
    },
    [loadProfile],
  )

  useEffect(() => {
    const supabase = getSupabase()
    mountedRef.current = true
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mountedRef.current) return
      acceptSession(event, nextSession)
    })
    return () => {
      mountedRef.current = false
      profileRequest.current += 1
      data.subscription.unsubscribe()
    }
  }, [acceptSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      error,
      sessionInterrupted,
      signIn: async (email, password) => {
        const { data, error: signInError } = await getSupabase().auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        if (sessionRef.current?.user.id !== data.session?.user.id) {
          acceptSession('SIGNED_IN', data.session)
        }
      },
      signOut: async () => {
        deliberateSignOutRef.current = true
        try {
          const { error: signOutError } = await getSupabase().auth.signOut()
          if (signOutError) throw signOutError
          if (sessionRef.current) acceptSession('SIGNED_OUT', null)
        } finally {
          deliberateSignOutRef.current = false
        }
      },
      reloadProfile: async () => {
        if (!session?.user) return
        await loadProfile(session.user.id, !profileRef.current)
      },
    }),
    [session, profile, loading, error, sessionInterrupted, acceptSession, loadProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider.')
  return value
}
