import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { recordHomeScreenUse, syncPushSubscription } from '@/lib/push'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithEmail: (email: string) => Promise<{ error: string | null }>
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Copy what she typed before she had an account into her profile, on sign-in.
//
// Fill blanks, never overwrite. This runs on every sign-in, and it used to upsert
// every field it didn't have as null. A name left behind by an abandoned signup
// was enough to trigger it, so a member who tapped Create account by mistake and
// then signed in would have had her age, city, sizes and fit wiped, and been
// marked as having finished onboarding she never went through.
async function syncLocalProfileToDb(userId: string) {
  const raw = localStorage.getItem('eleven_profile')
  const firstName = localStorage.getItem('eleven_first_name')
  if (!raw && !firstName) return

  const profile = raw ? JSON.parse(raw) : {}
  const { data: existing } = await supabase
    .from('profiles')
    .select('display_name, age, city, height_range, top_size, bottom_size, fit_preference, fit_details, silhouette_preference, style_aesthetics')
    .eq('id', userId)
    .maybeSingle()

  const candidate: Record<string, unknown> = {
    display_name: firstName ?? profile.display_name,
    age: profile.age,
    city: profile.city,
    height_range: profile.height,
    top_size: profile.top_size,
    bottom_size: profile.bottom_size,
    silhouette_preference: profile.silhouette,
    style_aesthetics: profile.style,
    fit_preference: profile.fit_preference,
    fit_details: profile.fit_details,
  }
  const blank = (v: unknown) =>
    v == null || v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)

  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(candidate)) {
    if (!blank(v) && blank((existing as Record<string, unknown> | null)?.[k])) patch[k] = v
  }
  // Onboarding is done only when she actually went through it on this device.
  // A name typed on the signup page doesn't count.
  if (raw) patch.onboarding_completed = true

  if (Object.keys(patch).length) {
    if (existing) await supabase.from('profiles').update(patch).eq('id', userId)
    else await supabase.from('profiles').upsert({ id: userId, ...patch })
  }

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
      // Note a home screen launch so we can see how many people installed it,
      // and re-register push, since iOS quietly hands out a new subscription and
      // never tells us the old one stopped working.
      if (session?.user) {
        recordHomeScreenUse(session.user.id)
        syncPushSubscription(session.user.id)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)

      // When she signs in, catch up everything that waited for an account.
      //
      // Not inside this callback. The auth library awaits every listener and
      // rethrows the first error, from inside signUp itself, so one failed side
      // effect here reports a signup the server already accepted as a failure.
      // Supabase's own guidance is to never call Supabase from in here. Deferring
      // one tick keeps all of this out of signup's way, and none of it may throw.
      if (event === 'SIGNED_IN' && session?.user) {
        const id = session.user.id
        setTimeout(() => {
          recordHomeScreenUse(id).catch(() => {})
          syncPushSubscription(id).catch(() => {})
          syncLocalProfileToDb(id).catch((e) => console.error('profile sync failed:', e))
          // Decisions are never synced from localStorage. They must be posted
          // while signed in so they always carry the right user_id.
          try { localStorage.removeItem('eleven_decisions') } catch { /* storage blocked */ }
        }, 0)
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
