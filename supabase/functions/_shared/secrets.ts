import { serviceClient } from './db.ts'
import { ApiError } from './http.ts'

/**
 * Lê um secret: primeiro Deno.env, depois platform_secrets (configurável no painel admin).
 * Cache de 60s por instância pra não bater no banco a cada chamada.
 */
const cache = new Map<string, { v: string | null; t: number }>()

export async function getSecret(name: string): Promise<string | null> {
  const env = Deno.env.get(name)
  if (env) return env
  const hit = cache.get(name)
  if (hit && Date.now() - hit.t < 60_000) return hit.v
  try {
    const { data } = await serviceClient().from('platform_secrets').select('value').eq('name', name).maybeSingle()
    const v = typeof data?.value === 'string' && data.value ? data.value : null
    cache.set(name, { v, t: Date.now() })
    return v
  } catch { return null }
}

export async function requireSecret(name: string): Promise<string> {
  const v = await getSecret(name)
  if (!v) throw new ApiError(503, 'NOT_CONFIGURED', `${name} não configurado (painel admin → Integrações).`)
  return v
}

/** Invalida o cache local (chamar após escrever). */
export function clearSecretCache() { cache.clear() }
