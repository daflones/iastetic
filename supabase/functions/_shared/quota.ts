// Controle de cotas por plano + créditos de recarga.
// Cada recurso consome: primeiro a quota mensal do plano (contada em ai_usage),
// depois créditos comprados (companies.quota_credits[resource]).
export const QUOTA_RESOURCES: Record<string, { planCol: string; usageKind: string; label: string; def: number }> = {
  messages:        { planCol: 'monthly_messages_limit', usageKind: 'msg_customer',   label: 'mensagens enviadas a clientes',  def: 2000 },
  assistant_audio: { planCol: 'assistant_audio_quota',  usageKind: 'tts_assistant',  label: 'áudios da assistente',           def: 20 },
  customer_audio:  { planCol: 'customer_audio_quota',   usageKind: 'tts_customer',   label: 'áudios enviados a clientes',     def: 30 },
  images:          { planCol: 'image_quota',            usageKind: 'image_gen',      label: 'imagens geradas por IA',         def: 4 },
}

function monthStart() {
  const d = new Date()
  d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

async function planLimit(db: any, companyId: string, resource: string): Promise<number> {
  const r = QUOTA_RESOURCES[resource]
  const { data: c } = await db.from('companies').select(`plan_id, plans(${r.planCol})`).eq('id', companyId).single()
  return c?.plans?.[r.planCol] ?? r.def
}

/** Status de uso do mês + créditos disponíveis de um recurso. */
export async function quotaStatus(db: any, companyId: string, resource: string) {
  const r = QUOTA_RESOURCES[resource]
  const [limit, { count }, { data: c }] = await Promise.all([
    planLimit(db, companyId, resource),
    db.from('ai_usage').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('kind', r.usageKind).gte('created_at', monthStart()),
    db.from('companies').select('quota_credits').eq('id', companyId).single(),
  ])
  const credits = Number(c?.quota_credits?.[resource] ?? 0)
  return { resource, label: r.label, used: count ?? 0, limit, credits }
}

/** Tenta consumir n unidades do recurso. Usa a quota do plano; estourada, debita créditos. */
export async function tryConsume(db: any, companyId: string, resource: string, n = 1): Promise<{ ok: boolean; via?: 'plan' | 'credits'; used: number; limit: number; credits: number; label: string }> {
  const st = await quotaStatus(db, companyId, resource)
  if (st.used + n <= st.limit) return { ok: true, via: 'plan', ...st }
  if (st.credits >= n) {
    const { data: c } = await db.from('companies').select('quota_credits').eq('id', companyId).single()
    const next = { ...(c?.quota_credits ?? {}), [resource]: Math.max(0, Number(c?.quota_credits?.[resource] ?? 0) - n) }
    await db.from('companies').update({ quota_credits: next }).eq('id', companyId)
    return { ok: true, via: 'credits', ...st, credits: st.credits - n }
  }
  return { ok: false, ...st }
}

/** Aplica créditos comprados (chamado no settle do pagamento). */
export async function grantCredits(db: any, companyId: string, resource: string, amount: number) {
  const { data: c } = await db.from('companies').select('quota_credits').eq('id', companyId).single()
  const next = { ...(c?.quota_credits ?? {}), [resource]: Number(c?.quota_credits?.[resource] ?? 0) + amount }
  await db.from('companies').update({ quota_credits: next }).eq('id', companyId)
}
