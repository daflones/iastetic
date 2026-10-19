import { cors, json, errorResponse, ApiError } from '../_shared/http.ts'
import { serviceClient } from '../_shared/db.ts'
import { sendText, sendMedia, sendAudio } from '../_shared/evolution.ts'
import { tryConsume } from '../_shared/quota.ts'
import { chatText, synthesizeSpeech, logUsage } from '../_shared/nvidia.ts'
import { getSecret } from '../_shared/secrets.ts'

// Executado por pg_cron: follow-ups a cada ~15 min; escalada de handoff a cada 1 min (body {"handoffs":true})
Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    const secret = await getSecret('CRON_SECRET')
    if (secret && req.headers.get('x-cron-secret') !== secret) throw new ApiError(401, 'UNAUTHORIZED', 'Cron não autorizado.')
    const db = serviceClient()
    const body = await req.json().catch(() => ({}))

    if (body?.handoffs) {
      const [escalated, campaignSent, prospectSent] = await Promise.all([escalateHandoffs(db), dispatchCampaignJobs(db), dispatchProspectJobs(db)])
      return json({ ok: true, escalated, campaign_sent: campaignSent, prospect_sent: prospectSent })
    }

    await generateJobs(db)
    await expireUnpaidAppointments(db)
    const [sent, campaignSent, prospectSent] = await Promise.all([dispatchJobs(db), dispatchCampaignJobs(db), dispatchProspectJobs(db)])
    return json({ ok: true, sent, campaign_sent: campaignSent, prospect_sent: prospectSent })
  } catch (e) { return errorResponse(e) }
})

// ---------- campanhas: envio espaçado 1 a 1 ----------
async function dispatchCampaignJobs(db: any): Promise<number> {
  const { data: jobs } = await db.from('campaign_jobs')
    .select('*, campaigns(message,image_url,title,status)')
    .eq('status', 'pending').lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at').limit(10)
  let sent = 0
  for (const job of jobs ?? []) {
    const camp = job.campaigns
    if (!camp || camp.status === 'draft') { await db.from('campaign_jobs').update({ status: 'failed', error: 'campanha removida/rascunho' }).eq('id', job.id); continue }
    try {
      const { data: inst } = await db.from('instances').select('instance_name').eq('company_id', job.company_id).eq('status', 'connected').limit(1).maybeSingle()
      if (!inst) throw new Error('WhatsApp desconectado')
      const gate = await tryConsume(db, job.company_id, 'messages')
      if (!gate.ok) {
        // sem quota → adia o envio pra daqui a 30 min (retoma após recarga/renovação)
        await db.from('campaign_jobs').update({ scheduled_at: new Date(Date.now() + 30 * 60_000).toISOString() }).eq('id', job.id)
        continue
      }
      const jid = `${job.phone}@s.whatsapp.net`
      if (camp.image_url) await sendMedia(inst.instance_name, jid, camp.image_url, camp.message, 'campanha.jpg')
      else await sendText(inst.instance_name, jid, camp.message)
      await db.from('campaign_jobs').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', job.id)
      await logUsage(job.company_id, 'msg_customer', 'campaign', { prompt_tokens: 1 })
      const { count: done } = await db.from('campaign_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', job.campaign_id).eq('status', 'sent')
      await db.from('campaigns').update({ sent_count: done ?? 0 }).eq('id', job.campaign_id)
      sent++
    } catch (e) {
      await db.from('campaign_jobs').update({ status: 'failed', error: String((e as Error).message).slice(0, 200) }).eq('id', job.id)
    }
  }
  // marca campanhas concluídas
  const { data: open } = await db.from('campaigns').select('id').eq('status', 'sending').limit(20)
  for (const c of open ?? []) {
    const { count } = await db.from('campaign_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'pending')
    if (!count) await db.from('campaigns').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', c.id)
  }
  return sent
}

// ---------- escalada de handoff ----------
// Cliente pediu humano → notificação no painel já existe. Se ninguém responder em ~2min
// e a empresa habilitou, manda os dados do cliente pro WhatsApp do atendente.
async function escalateHandoffs(db: any): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString()
  const { data: convs } = await db.from('conversations')
    .select('id,company_id,ai_state,last_message_preview,contacts(name,push_name,phone),companies(name,ai_config)')
    .eq('mode', 'human').eq('status', 'open')
    .not('ai_state->handoff_at', 'is', null)
    .limit(50)

  let escalated = 0
  for (const conv of convs ?? []) {
    const st = conv.ai_state ?? {}
    const handoffAt = st.handoff_at as string
    if (!handoffAt || st.handoff_escalated === true || st.handoff_answered === true) continue
    if (handoffAt > cutoff) continue // ainda dentro da janela de 2min

    // se um humano já respondeu na conversa depois do pedido, marca como atendido
    const { count: humanCount } = await db.from('messages').select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id).eq('sender', 'human').gt('created_at', handoffAt)

    const company = conv.companies
    const contact = conv.contacts
    const patch: any = { ...st }

    if ((humanCount ?? 0) > 0) {
      patch.handoff_answered = true
      await db.from('conversations').update({ ai_state: patch }).eq('id', conv.id)
      continue
    }

    const cfg = company?.ai_config ?? {}
    const phone = String(cfg.handoff_phone ?? '').replace(/\D/g, '')
    if (!cfg.handoff_to_attendant || !phone) {
      patch.handoff_escalated = true // modo "só aviso no painel" — não reprocessa
      await db.from('conversations').update({ ai_state: patch }).eq('id', conv.id)
      continue
    }

    const { data: inst } = await db.from('instances').select('instance_name')
      .eq('company_id', conv.company_id).eq('status', 'connected').limit(1).maybeSingle()
    if (!inst) {
      patch.handoff_escalated = true
      await db.from('conversations').update({ ai_state: patch }).eq('id', conv.id)
      continue
    }

    const nome = contact?.name ?? contact?.push_name ?? 'Cliente'
    const tel = contact?.phone ?? ''
    const txt = `🆘 *Cliente pedindo atendimento* — ${company?.name ?? ''}\n\n` +
      `👤 ${nome}\n📱 ${tel}\n` +
      (st.handoff_reason ? `💬 Motivo: ${st.handoff_reason}\n` : '') +
      (conv.last_message_preview ? `Última msg: "${String(conv.last_message_preview).slice(0, 120)}"\n` : '') +
      `\nResponda pelo painel IAstetic (Chat) ou chame o cliente direto.`
    try {
      await sendText(inst.instance_name, phone, txt)
      patch.handoff_escalated = true
      await db.from('conversations').update({ ai_state: patch }).eq('id', conv.id)
      escalated++
    } catch (e) {
      console.error('handoff escalate', conv.id, e)
    }
  }
  return escalated
}

// ---------- geração de jobs ----------
async function generateJobs(db: any) {
  const { data: rules } = await db.from('followup_rules').select('*, companies(timezone)').eq('active', true)
  for (const rule of rules ?? []) {
    try { await generateForRule(db, rule) } catch (e) { console.error('rule', rule.id, e) }
  }
}

async function alreadyQueued(db: any, ruleId: string, contactId: string, appointmentId: string | null) {
  let q = db.from('followup_jobs').select('id', { count: 'exact', head: true }).eq('rule_id', ruleId).eq('contact_id', contactId).in('status', ['pending', 'sent'])
  if (appointmentId) q = q.eq('appointment_id', appointmentId)
  const { count } = await q
  return (count ?? 0) > 0
}

async function schedule(db: any, rule: any, contactId: string, at: Date, appointmentId: string | null = null) {
  if (await alreadyQueued(db, rule.id, contactId, appointmentId)) return
  await db.from('followup_jobs').insert({
    company_id: rule.company_id, rule_id: rule.id, contact_id: contactId,
    appointment_id: appointmentId, scheduled_at: at.toISOString(),
  })
}

async function generateForRule(db: any, rule: any) {
  const delayMs = (rule.delay_hours || 24) * 3600_000
  const now = Date.now()

  if (rule.trigger === 'after_appointment' || rule.trigger === 'maintenance' || rule.trigger === 'no_show') {
    const statusFilter = rule.trigger === 'no_show' ? 'no_show' : 'done'
    const from = new Date(now - 45 * 86_400_000).toISOString()
    const to = new Date(now - delayMs).toISOString()
    let q = db.from('appointments').select('id,contact_id,ends_at,service_id').eq('company_id', rule.company_id).eq('status', statusFilter)
      .gte('ends_at', from).lte('ends_at', to)
    if (rule.service_ids?.length) q = q.in('service_id', rule.service_ids)
    const { data } = await q.limit(200)
    for (const a of data ?? []) {
      if (!a.contact_id) continue
      await schedule(db, rule, a.contact_id, new Date(new Date(a.ends_at).getTime() + delayMs), a.id)
    }
  }

  if (rule.trigger === 'inactive_days' || rule.trigger === 'abandoned_lead') {
    const cutoff = new Date(now - delayMs).toISOString()
    let q = db.from('contacts').select('id').eq('company_id', rule.company_id).lt('last_message_at', cutoff)
    if (rule.only_stage?.length) q = q.in('stage', rule.only_stage)
    else if (rule.trigger === 'abandoned_lead') q = q.in('stage', ['novo', 'interessado'])
    const { data } = await q.limit(200)
    for (const ct of data ?? []) await schedule(db, rule, ct.id, new Date(now + 60_000))
  }

  if (rule.trigger === 'birthday') {
    const nowTz = now - 3 * 3600_000 // aproximação BRT
    const md = new Date(nowTz).toISOString().slice(5, 10)
    const { data } = await db.from('contacts').select('id').eq('company_id', rule.company_id).not('birthday', 'is', null)
    for (const ct of data ?? []) {
      const { data: c } = await db.from('contacts').select('birthday').eq('id', ct.id).single()
      if (c?.birthday?.slice(5, 10) === md) await schedule(db, rule, ct.id, new Date(now + 60_000))
    }
  }
}

// ---------- libera vagas "aguardando sinal" que nunca foram pagas ----------
async function expireUnpaidAppointments(db: any) {
  // passou do horário OU reservada há mais de 24h sem pagar → cancela
  const { data: stale } = await db.from('appointments')
    .select('id,company_id,contact_id,service_name,starts_at,notes')
    .eq('status', 'awaiting_payment')
    .or(`starts_at.lt.${new Date().toISOString()},created_at.lt.${new Date(Date.now() - 24 * 3600_000).toISOString()}`)
    .limit(50)
  for (const a of stale ?? []) {
    await db.from('appointments').update({
      status: 'cancelled',
      notes: `${a.notes ?? ''} [auto] cancelado: sinal não pago.`.trim(),
    }).eq('id', a.id).eq('status', 'awaiting_payment')
    await db.from('notifications').insert({
      company_id: a.company_id, kind: 'cancelled',
      title: 'Agendamento cancelado (sinal não pago)',
      body: `${a.service_name} • ${a.starts_at ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(a.starts_at)) : ''} — a vaga foi liberada.`,
      link: '/app/agenda',
    })
  }
}

// ---------- envio ----------
async function dispatchJobs(db: any): Promise<number> {
  const { data: jobs } = await db.from('followup_jobs')
    .select('*, followup_rules(*), contacts(name,phone,stage), companies(*)')
    .eq('status', 'pending').lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at').limit(50)

  let sent = 0
  for (const job of jobs ?? []) {
    try {
      const ok = await dispatchJob(db, job)
      await db.from('followup_jobs').update(ok ? { status: 'sent', sent_at: new Date().toISOString() } : { status: 'failed', error: 'envio falhou' }).eq('id', job.id)
      if (ok) sent++
    } catch (e) {
      await db.from('followup_jobs').update({ status: 'failed', error: String((e as Error).message).slice(0, 300) }).eq('id', job.id)
    }
  }
  return sent
}

function insideWindow(rule: any, tz: string): boolean {
  const w = rule.send_window ?? { from: '09:00', to: '20:00' }
  const now = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).format(new Date())
  return now >= (w.from ?? '00:00') && now <= (w.to ?? '23:59')
}

async function dispatchJob(db: any, job: any): Promise<boolean> {
  const rule = job.followup_rules, contact = job.contacts, company = job.companies
  if (!rule || !contact || !company) return false
  const tz = company.timezone || 'America/Sao_Paulo'

  // fora da janela → remarca em 1h
  if (!insideWindow(rule, tz)) {
    await db.from('followup_jobs').update({ scheduled_at: new Date(Date.now() + 3600_000).toISOString() }).eq('id', job.id)
    return true
  }

  const { data: inst } = await db.from('instances').select('*').eq('company_id', company.id).eq('status', 'connected').limit(1).maybeSingle()
  if (!inst) return false

  // cota de mensagens esgotada → remarca em 1h (envia quando recarregar/renovar)
  const gate = await tryConsume(db, company.id, 'messages')
  if (!gate.ok) {
    await db.from('followup_jobs').update({ scheduled_at: new Date(Date.now() + 3600_000).toISOString() }).eq('id', job.id)
    return true
  }

  const jid = `${contact.phone}@s.whatsapp.net`

  // variação de texto pela IA
  let text = rule.template
  if (rule.use_ai_variation) {
    try {
      text = await chatText([{
        role: 'user',
        content: `Reescreva esta mensagem de follow-up de forma natural e variada, mantendo o sentido, para enviar no WhatsApp em nome de "${company.name}". Cliente: ${contact.name ?? contact.phone}. Tom: ${company.ai_config?.tone ?? 'acolhedor'}. Mensagem original: """${rule.template}""". Responda apenas a mensagem final.`,
      }], 300)
      await logUsage(company.id, 'followup', 'glm', {})
    } catch { /* usa template */ }
  }

  const { data: conv } = await db.from('conversations').select('id').eq('company_id', company.id).eq('remote_jid', jid).maybeSingle()

  if (rule.channel === 'image' && rule.image_url) {
    await sendMedia(inst.instance_name, jid, rule.image_url, text)
    if (conv) await db.from('messages').insert({ conversation_id: conv.id, company_id: company.id, direction: 'out', sender: 'system', type: 'image', content: text, media_url: rule.image_url, meta: { followup: true } })
  } else if (rule.channel === 'audio') {
    try {
      const gate = await tryConsume(db, company.id, 'customer_audio')
      if (!gate.ok) throw new Error('audio quota')
      const audio = await synthesizeSpeech(text.replace(/[*_#]/g, ''), 'pt-BR')
      await sendAudio(inst.instance_name, jid, `data:audio/mpeg;base64,${audio.base64}`)
      if (conv) await db.from('messages').insert({ conversation_id: conv.id, company_id: company.id, direction: 'out', sender: 'system', type: 'audio', content: text, media_mime: 'audio/mpeg', meta: { followup: true } })
      await logUsage(company.id, 'tts_customer', 'elevenlabs/openrouter', { prompt_tokens: text.length })
    } catch {
      await sendText(inst.instance_name, jid, text)
      if (conv) await db.from('messages').insert({ conversation_id: conv.id, company_id: company.id, direction: 'out', sender: 'system', type: 'text', content: text, meta: { followup: true } })
    }
  } else {
    await sendText(inst.instance_name, jid, text)
    if (conv) await db.from('messages').insert({ conversation_id: conv.id, company_id: company.id, direction: 'out', sender: 'system', type: 'text', content: text, meta: { followup: true } })
  }
  await db.from('followup_jobs').update({ sent_content: text }).eq('id', job.id)
  await logUsage(company.id, 'msg_customer', 'followup', { prompt_tokens: 1 })
  return true
}

// ---------- prospecção: disparos da instância do admin ----------
async function dispatchProspectJobs(db: any): Promise<number> {
  const { data: jobs } = await db.from('prospect_jobs')
    .select('*, prospect_campaigns(message,image_url,status,vary_messages)')
    .eq('status', 'pending').lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at').limit(10)
  if (!jobs?.length) return 0
  const { data: cfg } = await db.from('platform_settings').select('value').eq('key', 'admin_whatsapp').single()
  const inst = cfg?.value?.instance_name
  if (!inst) {
    for (const j of jobs) await db.from('prospect_jobs').update({ status: 'failed', error: 'instância admin não conectada' }).eq('id', j.id)
    return 0
  }
  let sent = 0
  for (const job of jobs) {
    const camp = job.prospect_campaigns
    if (!camp || camp.status !== 'sending') { await db.from('prospect_jobs').update({ status: 'failed', error: 'campanha pausada/removida' }).eq('id', job.id); continue }
    try {
      const { data: lead } = await db.from('prospect_leads').select('name,city,niche').eq('id', job.lead_id).maybeSingle()
      let msg = String(camp.message)
        .replaceAll('{nome}', lead?.name ?? '')
        .replaceAll('{cidade}', lead?.city ?? '')
        .replaceAll('{nicho}', lead?.niche ?? '')
      // variação por IA — cada lead recebe redação diferente (anti-spam)
      if (camp.vary_messages) {
        try {
          const varied = await chatText([
            { role: 'system', content: 'Você reescreve mensagens de prospecção de WhatsApp. Mantenha o sentido, a oferta e a pergunta final (CTA), mas mude abertura, ordem e redação para não parecer mensagem em massa. pt-BR, tom humano e direto, no máximo 1 emoji. Responda APENAS a mensagem final, sem aspas.' },
            { role: 'user', content: `Lead: ${lead?.name ?? ''} (${lead?.niche ?? ''}, ${lead?.city ?? ''})\nMensagem base:\n${msg}` },
          ], 350)
          if (varied?.trim().length > 40) msg = varied.trim()
        } catch { /* mantém original */ }
      }
      const jid = `${job.phone}@s.whatsapp.net`
      if (camp.image_url) await sendMedia(inst, jid, camp.image_url, msg, 'iastetic.jpg')
      else await sendText(inst, jid, msg)
      await db.from('prospect_jobs').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', job.id)
      if (lead) await db.from('prospect_leads').update({ status: 'contatado', updated_at: new Date().toISOString() })
        .eq('id', job.lead_id).eq('status', 'novo')
      sent++
    } catch (e) {
      await db.from('prospect_jobs').update({ status: 'failed', error: String((e as Error).message).slice(0, 200) }).eq('id', job.id)
    }
  }
  // atualiza contadores e fecha campanhas concluídas
  const { data: open } = await db.from('prospect_campaigns').select('id').eq('status', 'sending').limit(20)
  for (const c of open ?? []) {
    const [{ count: sentC }, { count: failC }, { count: pendC }] = await Promise.all([
      db.from('prospect_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'sent'),
      db.from('prospect_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'failed'),
      db.from('prospect_jobs').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'pending'),
    ])
    const patch: Record<string, unknown> = { sent_count: sentC ?? 0, failed_count: failC ?? 0 }
    if (!pendC) { patch.status = 'sent'; patch.sent_at = new Date().toISOString() }
    await db.from('prospect_campaigns').update(patch).eq('id', c.id)
  }
  return sent
}
