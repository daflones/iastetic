import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { applyNicheTheme, isNiche } from '@/lib/niches'
import type { Company, Plan } from '@/lib/types'

interface AuthState {
  session: Session | null
  loading: boolean
  company: Company | null
  plan: Plan | null
  features: Record<string, boolean>
  isAdmin: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>({
  session: null, loading: true, company: null, plan: null, features: {}, isAdmin: false,
  refresh: async () => {}, signOut: async () => {},
})

const ALL_FEATURES = { audio: true, images: true, payments: true, assistant: true, followups: true, priority: true }

/** Trial libera tudo por 7 dias; depois vale o que o plano contratado permite. Empresa sem plano (cortesia/admin) não tem bloqueio. */
function effectiveFeatures(company: Company | null, plan: Plan | null): Record<string, boolean> {
  const trial = company?.subscription_status === 'trial' && company.trial_until && new Date(company.trial_until) > new Date()
  if (trial || !plan) return ALL_FEATURES
  const f = plan.features as unknown
  // planos salvos pelo admin guardam features como array de flags
  if (Array.isArray(f)) return Object.fromEntries(Object.keys(ALL_FEATURES).map(k => [k, f.includes(k)]))
  return (f as Record<string, boolean>) ?? {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadCompany() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCompany(null); setPlan(null); setIsAdmin(false); applyNicheTheme('estetica'); return }
    const { data: profile } = await supabase.from('profiles').select('company_id,is_admin').eq('id', user.id).maybeSingle()
    setIsAdmin(!!profile?.is_admin)
    if (profile?.company_id) {
      const { data: comp } = await supabase.from('companies').select('*, plans(*)').eq('id', profile.company_id).maybeSingle()
      const c = comp as any
      setCompany(c ?? null)
      setPlan(c?.plans ?? null)
      if (c?.niche && isNiche(c.niche)) applyNicheTheme(c.niche)
    } else {
      setCompany(null); setPlan(null); applyNicheTheme('estetica')
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadCompany().finally(() => setLoading(false))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) loadCompany()
      else { setCompany(null); setPlan(null); setIsAdmin(false); applyNicheTheme('estetica') }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <Ctx.Provider value={{
      session, loading, company, plan, features: effectiveFeatures(company, plan), isAdmin,
      refresh: loadCompany,
      signOut: async () => { await supabase.auth.signOut() },
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
