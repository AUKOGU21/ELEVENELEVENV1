import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithEmail: (email: string) => Promise<{ error: string | null }>
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Sync any locally stored onboarding profile to Supabase on auth
async function syncLocalProfileToDb(userId: string) {
  const raw = localStorage.getItem('eleven_profile')
  const firstName = localStorage.getItem('eleven_first_name')
  if (!raw && !firstName) return

  const profile = raw ? JSON.parse(raw) : {}

  await supabase.from('profiles').upsert({
    id: userId,
    display_name: firstName ?? profile.display_name ?? null,
    age: profile.age ?? null,
    city: profile.city ?? null,
    height_range: profile.height ?? null,
    top_size: profile.top_size ?? null,
    bottom_size: profile.bottom_size ?? null,
    silhouette_preference: profile.silhouette ?? [],
    style_aesthetics: profile.style ?? [],
    fit_preference: profile.fit_preference ?? null,
    fit_details: profile.fit_details ?? null,
    onboarding_completed: true,
  }).eq('id', userId)

  localStorage.removeItem('eleven_profile')
  localStorage.removeItem('eleven_first_name')
  localStorage.removeItem('eleven_email')
}

// Sync any locally saved decisions to Supabase on auth
async function syncLocalDecisionsToDb(userId: string) {
  const raw = localStorage.getItem('eleven_decisions')
  if (!raw) return
  const allDecisions = JSON.parse(raw)
  if (!allDecisions.length) return

  // Only sync decisions created in this session (after onboarding started)
  // If no session start is set, bail out — never sync without a valid timestamp
  const sessionStartRaw = localStorage.getItem('eleven_session_start')
  if (!sessionStartRaw) {
    localStorage.removeItem('eleven_decisions')
    return
  }
  const sessionStart = parseInt(sessionStartRaw)
  const decisions = allDecisions.filter((d: any) => d.timestamp >= sessionStart)

  if (decisions.length) {
    const rows = decisions.map((d: any) => ({
      user_id: userId,
      product_name: d.product?.name || null,
      brand_name: d.product?.brand || null,
      product_image_url: d.product?.image || null,
      confidence_score: d.confidence ?? 5,
      uncertainty_text: d.uncertainties?.join(', ') ?? null,
      is_public: true,
    }))
    await supabase.from('decisions').insert(rows)
  }

  // Always clear local decisions and session marker after sign-in
  localStorage.removeItem('eleven_decisions')
  localStorage.removeItem('eleven_session_start')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)

      // When a user signs in, sync their locally stored profile data
      if (event === 'SIGNED_IN' && session?.user) {
        syncLocalProfileToDb(session.user.id)
        // NOTE: decisions are never synced from localStorage — decisions must be
        // posted while authenticated so they always have the correct user_id.
        localStorage.removeItem('eleven_decisions')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithEmail = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/feed`,
      },
    })
    return { error: error?.message ?? null }
  }

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithEmail, signInWithPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
