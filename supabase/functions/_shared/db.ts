import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { requireEnv, ApiError } from './http.ts'

let _service: SupabaseClient | null = null
export function serviceClient(): SupabaseClient {
  if (!_service) _service = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  return _service
}

/** Cliente autenticado como o usuário (RLS) a partir do JWT do header */
export function userClient(req: Request): SupabaseClient {
  const auth = req.headers.get('Authorization') ?? ''
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Retorna {user, companyId, isAdmin} ou lança 401/403 */
export async function requireUser(req: Request) {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Faça login para continuar.')
  const c = serviceClient()
  const { data: { user }, error } = await c.auth.getUser(token)
  if (error || !user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sessão inválida.')
  const { data: profile } = await c.from('profiles').select('company_id,is_admin,full_name').eq('id', user.id).maybeSingle()
  return { user, companyId: profile?.company_id ?? null, isAdmin: !!profile?.is_admin, name: profile?.full_name ?? null }
}

export async function requireCompany(req: Request) {
  const u = await requireUser(req)
  if (!u.companyId) throw new ApiError(403, 'NO_COMPANY', 'Conclua o cadastro da empresa.')
  return u as Required<typeof u> & { companyId: string }
}

export async function requireAdmin(req: Request) {
  const u = await requireUser(req)
  if (!u.isAdmin) throw new ApiError(403, 'FORBIDDEN', 'Acesso restrito ao administrador da plataforma.')
  return u
}
