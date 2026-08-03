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
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'
import type { Profile } from '../types/domain'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  error: string | null
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
  const profileRequest = useRef(0)

  const loadSession = useCallback(async (nextSession: Session | null) => {
    const requestId = ++profileRequest.current
    setSession(nextSession)
    setError(null)
    if (!nextSession?.user) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const nextProfile = await fetchProfile(nextSession.user.id)
      if (profileRequest.current !== requestId) return
      setProfile(nextProfile)
    } catch (caught) {
      if (profileRequest.current !== requestId) return
      console.error('CRM profile load failed', caught)
      setProfile(null)
      setError(
        'Your CRM profile could not be loaded. Ask the administrator to check your role.',
      )
    } finally {
      if (profileRequest.current === requestId) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const supabase = getSupabase()
    let active = true
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) {
        console.error('Supabase session restoration failed', sessionError)
        setError('Your session could not be restored. Sign in again.')
        setLoading(false)
        return
      }
      void loadSession(data.session)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      void loadSession(nextSession)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [loadSession])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      error,
      signIn: async (email, password) => {
        const { data, error: signInError } = await getSupabase().auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        await loadSession(data.session)
      },
      signOut: async () => {
        const { error: signOutError } = await getSupabase().auth.signOut()
        if (signOutError) throw signOutError
      },
      reloadProfile: async () => {
        if (!session?.user) return
        await loadSession(session)
      },
    }),
    [session, profile, loading, error, loadSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider.')
  return value
}
