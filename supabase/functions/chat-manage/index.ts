import { cors, json, errorResponse, ApiError, str } from '../_shared/http.ts'
import { requireCompany, serviceClient } from '../_shared/db.ts'
import { sendText, sendMedia } from '../_shared/evolution.ts'
import { processUnresponded } from '../_shared/reply.ts'

async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Ações do painel: enviar mensagem como humano, assumir/devolver conversa para a IA
// com identidade de operador (profissional + PIN opcional) registrada em cada envio.
Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    const { companyId } = await requireCompany(req)
    const db = serviceClient()
    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')
    const convId = str(body.conversation_id, 64)

    const { data: conv } = await db.from('conversations').select('*, contacts(phone)').eq('id', convId).eq('company_id', companyId).single()
    if (!conv) throw new ApiError(404, 'NOT_FOUND', 'Conversa não encontrada.')
    const jid = conv.remote_jid
    const { data: inst } = await db.from('instances').select('*').eq('id', conv.instance_id).maybeSingle()
    if (!inst) throw new ApiError(400, 'NO_INSTANCE', 'Instância não encontrada para esta conversa.')

    const markAnswered = () => {
      const st = conv.ai_state ?? {}
      if (st.handoff_at && !st.handoff_answered) {
        db.from('conversations').update({ ai_state: { ...st, handoff_answered: true } }).eq('id', conv.id)
      }
    }

    // valida o PIN do profissional e devolve {id, name, color}; dono (sem id) também exige PIN se configurado
    const resolveOperator = async () => {
      const profId = str(body.professional_id, 64)
      if (!profId) {
        const { data: c } = await db.from('companies').select('owner_pin_hash').eq('id', companyId).single()
        if (c?.owner_pin_hash) {
          const pin = str(body.pin, 64)
          if (!pin) throw new ApiError(401, 'PIN_REQUIRED', 'O proprietário exige senha.')
          if (await hashPin(pin) !== c.owner_pin_hash) throw new ApiError(403, 'WRONG_PIN', 'Senha incorreta.')
        }
        return { id: null, name: 'Proprietário(a)', color: '#a78bfa' }
      }
      const { data: prof } = await db.from('professionals').select('id,name,color,pin_hash')
        .eq('id', profId).eq('company_id', companyId).maybeSingle()
      if (!prof) throw new ApiError(404, 'NO_PROF', 'Profissional não encontrado.')
      if (prof.pin_hash) {
        const pin = str(body.pin, 64)
        if (!pin) throw new ApiError(401, 'PIN_REQUIRED', 'Este profissional exige senha.')
        if (await hashPin(pin) !== prof.pin_hash) throw new ApiError(403, 'WRONG_PIN', 'Senha incorreta.')
      }
      return { id: prof.id, name: prof.name, color: prof.color ?? '#a78bfa' }
    }

    // quem está atendendo agora (registrado no takeover)
    const takenBy = conv.ai_state?.taken_by ?? null

    if (action === 'verify_operator') {
      return json({ ok: true, data: await resolveOperator() })
    }

    if (action === 'send') {
      const text = str(body.text, 4000)
      if (!text) throw new ApiError(400, 'EMPTY', 'Mensagem vazia.')
      await sendText(inst.instance_name, jid, text)
      await db.from('messages').insert({
        conversation_id: conv.id, company_id: companyId, direction: 'out', sender: 'human', type: 'text', content: text,
        operator_id: takenBy?.id ?? null, operator_name: takenBy?.name ?? null,
        meta: takenBy ? { operator_color: takenBy.color } : {},
      })
      markAnswered()
      return json({ ok: true })
    }

    if (action === 'send_media') {
      const url = str(body.url, 2000), caption = str(body.caption, 500)
      if (!url) throw new ApiError(400, 'EMPTY', 'URL da mídia obrigatória.')
      await sendMedia(inst.instance_name, jid, url, caption)
      await db.from('messages').insert({
        conversation_id: conv.id, company_id: companyId, direction: 'out', sender: 'human', type: 'image', content: caption, media_url: url,
        operator_id: takenBy?.id ?? null, operator_name: takenBy?.name ?? null,
        meta: takenBy ? { operator_color: takenBy.color } : {},
      })
      markAnswered()
      return json({ ok: true })
    }

    if (action === 'takeover') {
      const op = await resolveOperator()
      const st = conv.ai_state ?? {}
      await db.from('conversations').update({
        mode: 'human',
        ai_state: { ...st, handoff_answered: true, taken_by: { id: op.id, name: op.name, color: op.color, at: new Date().toISOString() } },
      }).eq('id', conv.id)
      await db.from('messages').insert({
        conversation_id: conv.id, company_id: companyId, direction: 'out', sender: 'system', type: 'system',
        content: `${op.name} assumiu o atendimento. IA pausada.`,
        operator_id: op.id, operator_name: op.name, meta: { operator_color: op.color },
      })
      return json({ ok: true, data: { operator: op } })
    }

    if (action === 'release') {
      const st = conv.ai_state ?? {}
      delete st.handoff_at; delete st.handoff_escalated; delete st.handoff_answered; delete st.handoff_reason; delete st.taken_by
      await db.from('conversations').update({ mode: 'ai', ai_state: st }).eq('id', conv.id)
      await db.from('messages').insert({ conversation_id: conv.id, company_id: companyId, direction: 'out', sender: 'system', type: 'system', content: 'IA retomou o atendimento.' })
      // responde mensagens que a cliente mandou enquanto o humano estava assumido
      try {
        const [{ data: company }, { data: contact }] = await Promise.all([
          db.from('companies').select('*').eq('id', companyId).single(),
          db.from('contacts').select('*').eq('id', conv.contact_id).single(),
        ])
        if (company && contact) {
          await processUnresponded({ db, company, instance: inst, conv: { ...conv, mode: 'ai' }, contact, remoteJid: jid })
        }
      } catch (e) { console.error('release pending reply', e) }
      return json({ ok: true })
    }

    if (action === 'mark_read') {
      await db.from('conversations').update({ unread_count: 0 }).eq('id', conv.id)
      return json({ ok: true })
    }

    if (action === 'close' || action === 'reopen') {
      await db.from('conversations').update({ status: action === 'close' ? 'closed' : 'open' }).eq('id', conv.id)
      return json({ ok: true })
    }

    throw new ApiError(400, 'BAD_ACTION', 'Ação desconhecida.')
  } catch (e) { return errorResponse(e) }
})
