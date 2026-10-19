import { cors, json, errorResponse, ApiError, str, requireEnv } from '../_shared/http.ts'
import { requireCompany, serviceClient } from '../_shared/db.ts'
import { createInstance, setWebhook, connectInstance, connectionState, logoutInstance, deleteInstance, restartInstance } from '../_shared/evolution.ts'
import { getSecret } from '../_shared/secrets.ts'

const WEBHOOK_PATH = '/functions/v1/whatsapp-webhook'

Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    const { companyId } = await requireCompany(req)
    const db = serviceClient()
    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')

    const hookUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '') + WEBHOOK_PATH
    const secret = await getSecret('WEBHOOK_INGRESS_SECRET')

    if (action === 'list') {
      const { data } = await db.from('instances').select('*').eq('company_id', companyId).order('created_at')
      return json({ ok: true, data })
    }

    if (action === 'create') {
      const { data: comp } = await db.from('companies').select('name,ai_config,plan_id, plans(instances_limit)').eq('id', companyId).single()
      const limit = (comp?.plans as any)?.instances_limit ?? 1
      const { count } = await db.from('instances').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
      if ((count ?? 0) >= limit) throw new ApiError(403, 'LIMIT', `Seu plano permite ${limit} número(s). Faça upgrade para adicionar mais.`)
      // nome amigável: o que a empresa escolher, senão o nome da atendente IA cadastrada
      const chosen = str(body.display_name, 40) || (comp?.ai_config as any)?.name || 'atendimento'
      const label = `${comp?.name ?? 'Empresa'} · ${chosen}`
      const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'x'
      const name = `ias-${slug(comp?.name ?? 'empresa')}-${slug(chosen)}-${Date.now().toString(36)}`
      await createInstance(name, body.number ? str(body.number, 20) : undefined)
      await setWebhook(name, hookUrl, secret ?? undefined)
      const { data: inst, error } = await db.from('instances').insert({
        company_id: companyId, instance_name: name, label, status: 'connecting',
      }).select().single()
      if (error) throw new ApiError(500, 'DB', error.message)
      try {
        const conn = await connectInstance(name)
        const qr = conn?.base64 ?? conn?.qrcode?.base64 ?? conn?.code ?? null
        if (qr) await db.from('instances').update({ qr_base64: qr }).eq('id', inst.id)
        return json({ ok: true, data: { ...inst, qr_base64: qr } })
      } catch { return json({ ok: true, data: inst }) }
    }

    const inst = await getInstance(db, companyId, body)

    if (action === 'connect') {
      const conn = await connectInstance(inst.instance_name)
      const qr = conn?.base64 ?? conn?.qrcode?.base64 ?? conn?.code ?? inst.qr_base64
      const pairing = conn?.pairingCode ?? null
      await db.from('instances').update({ qr_base64: qr, pairing_code: pairing, status: 'connecting' }).eq('id', inst.id)
      return json({ ok: true, data: { qr_base64: qr, pairing_code: pairing } })
    }

    if (action === 'status') {
      let state = 'close'
      try { const s = await connectionState(inst.instance_name); state = s?.instance?.state ?? s?.state ?? 'close' } catch { /* offline */ }
      const status = state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected'
      await db.from('instances').update({ status, last_seen_at: new Date().toISOString(), ...(status === 'connected' ? { qr_base64: null } : {}) }).eq('id', inst.id)
      return json({ ok: true, data: { status } })
    }

    if (action === 'restart') { await restartInstance(inst.instance_name); return json({ ok: true }) }

    if (action === 'disconnect') {
      try { await logoutInstance(inst.instance_name) } catch { /* já desconectada */ }
      await db.from('instances').update({ status: 'disconnected', qr_base64: null, phone: null }).eq('id', inst.id)
      return json({ ok: true })
    }

    if (action === 'delete') {
      try { await deleteInstance(inst.instance_name) } catch { /* pode já não existir */ }
      await db.from('instances').delete().eq('id', inst.id)
      return json({ ok: true })
    }

    if (action === 'toggle_ai') {
      await db.from('instances').update({ ai_enabled: body.ai_enabled !== false }).eq('id', inst.id)
      return json({ ok: true })
    }

    if (action === 'update') {
      await db.from('instances').update({ label: str(body.label, 60) || inst.label, ai_overrides: body.ai_overrides ?? inst.ai_overrides }).eq('id', inst.id)
      return json({ ok: true })
    }

    throw new ApiError(400, 'BAD_ACTION', 'Ação desconhecida.')
  } catch (e) { return errorResponse(e) }
})

async function getInstance(db: any, companyId: string, body: any) {
  const id = str(body.instance_id, 64)
  if (!id) throw new ApiError(400, 'INSTANCE_REQUIRED', 'Informe a instância.')
  const { data } = await db.from('instances').select('*').eq('id', id).eq('company_id', companyId).single()
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'Instância não encontrada.')
  return data
}
