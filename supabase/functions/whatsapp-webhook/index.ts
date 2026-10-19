import { cors, json } from '../_shared/http.ts'
import { serviceClient } from '../_shared/db.ts'
import { parseIncoming, fetchMessageMedia, findProfilePicture } from '../_shared/evolution.ts'
import { transcribeAudio, describeImage } from '../_shared/nvidia.ts'
import { processUnresponded } from '../_shared/reply.ts'
import { getSecret } from '../_shared/secrets.ts'

const SECRET_HEADER = 'x-iastetic-hook'
const HISTORY_LEN = 14
const QUIET_MS = 10_000       // espera 10s de silêncio do cliente antes de responder
const MAX_RUNNER_MS = 110_000 // tempo máximo de vida do loop (limite do edge runtime)
const LOCK_TTL_MS = 180_000   // se um runner morrer, o lock expira em 3min

Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  if (req.method !== 'POST') return json({ ok: true })
  try {
    const expected = await getSecret('WEBHOOK_INGRESS_SECRET')
    if (expected && req.headers.get(SECRET_HEADER) !== expected) {
      return json({ ok: true }) // ignora silenciosamente
    }

    const body = await req.json().catch(() => null)
    const event = body?.event
    if (event === 'connection.update') { await onConnectionUpdate(body); return json({ ok: true }) }
    if (event === 'qrcode.updated') { await onQrUpdate(body); return json({ ok: true }) }
    if (event !== 'messages.upsert') return json({ ok: true })

    const incoming = parseIncoming(body)
    if (!incoming) return json({ ok: true })

    const db = serviceClient()
    const { data: instance } = await db.from('instances').select('*').eq('instance_name', incoming.instanceName).single()
    if (!instance) return json({ ok: true })

    if (incoming.fromMe) {
      const conv = await upsertConversation(db, instance, incoming.remoteJid, incoming.pushName)
      await db.from('messages').insert({
        conversation_id: conv.id, company_id: instance.company_id, direction: 'out', sender: 'human',
        type: incoming.type === 'unknown' ? 'text' : incoming.type, content: incoming.text ?? null, wa_message_id: incoming.messageId,
      }).catch(() => {})
      return json({ ok: true })
    }

    const contact = await upsertContact(db, instance, incoming.remoteJid, incoming.pushName)
    const conv = await upsertConversation(db, instance, incoming.remoteJid, incoming.pushName, contact.id)

    let text = incoming.text ?? ''
    let transcription: string | null = null
    let mediaNote: string | undefined
    if (incoming.type === 'audio') {
      const b64 = incoming.raw?.message?.base64 ?? await getMediaBase64(incoming)
      if (b64) {
        try { transcription = await transcribeAudio(b64, incoming.raw?.message?.audioMessage?.mimetype ?? 'audio/ogg') } catch (e) { console.error('asr', e) }
      }
      text = transcription || ''
      mediaNote = transcription
        ? 'o cliente mandou um ÁUDIO de voz (transcrito abaixo). Responda como quem conversa por voz: 1-3 frases curtas, naturais e calorosas — sem listas, sem markdown e sem formatação.'
        : 'cliente enviou um áudio que não pôde ser transcrito; peça para escrever'
    } else if (incoming.type === 'image') {
      try {
        const desc = await describeImageFromIncoming(incoming, text)
        mediaNote = `o cliente enviou uma IMAGEM${text ? ` com legenda "${text}"` : ''}. Descrição: ${desc}. Responda considerando a imagem.`
      } catch (e) { console.error('vision', e); mediaNote = 'cliente enviou uma imagem que não pôde ser analisada' }
    } else if (['video', 'document', 'sticker', 'location'].includes(incoming.type)) {
      mediaNote = `cliente enviou um ${incoming.type}${text ? ` com texto "${text}"` : ''}`
    }

    const { error: msgErr } = await db.from('messages').insert({
      conversation_id: conv.id, company_id: instance.company_id, direction: 'in', sender: 'contact',
      type: incoming.type === 'unknown' ? 'text' : incoming.type,
      content: text || null, transcription, wa_message_id: incoming.messageId,
      meta: { raw_type: incoming.type },
    })
    if (msgErr?.code === '23505') return json({ ok: true })

    if (conv.mode === 'human' || contact.ai_paused || !instance.ai_enabled) return json({ ok: true })

    const waitPromise = respondWithAi(db, instance, conv, contact, incoming, text, mediaNote)
    // @ts-ignore EdgeRuntime é global no runtime de edge functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(waitPromise)
    else await waitPromise
    return json({ ok: true })
  } catch (e) {
    console.error('webhook error', e)
    return json({ ok: true })
  }
})

async function getMediaBase64(incoming: any): Promise<string | null> {
  try {
    const b64 = incoming.raw?.message?.base64
    if (b64) return b64
    const data = await fetchMessageMedia(incoming.instanceName, incoming.raw)
    return data?.base64 ?? null
  } catch { return null }
}

async function describeImageFromIncoming(incoming: any, caption: string): Promise<string> {
  const b64 = await getMediaBase64(incoming)
  const url = b64 ? `data:${incoming.raw?.message?.imageMessage?.mimetype ?? 'image/jpeg'};base64,${b64}` : (incoming.raw?.message?.imageMessage?.url ?? '')
  if (!url) throw new Error('sem imagem')
  return describeImage(url, `Descreva em português, de forma objetiva, o que há nesta imagem${caption ? ` (o cliente escreveu: "${caption}")` : ''}, focando no que seria relevante para um atendimento de estética/beleza.`)
}

async function upsertContact(db: any, instance: any, remoteJid: string, pushName?: string) {
  const phone = remoteJid.split('@')[0].replace(/\D/g, '')
  const { data: existing } = await db.from('contacts').select('*').eq('company_id', instance.company_id).eq('phone', phone).maybeSingle()
  if (existing) {
    if (pushName && !existing.push_name) await db.from('contacts').update({ push_name: pushName }).eq('id', existing.id)
    return existing
  }
  let avatar: string | null = null
  try { const pic = await findProfilePicture(instance.instance_name, phone); avatar = pic?.profilePictureUrl ?? null } catch { /* ignore */ }
  const { data } = await db.from('contacts').insert({
    company_id: instance.company_id, phone, push_name: pushName ?? null, avatar_url: avatar, source: 'whatsapp',
  }).select().single()
  return data
}

async function upsertConversation(db: any, instance: any, remoteJid: string, pushName: string | undefined, contactId?: string) {
  const { data: existing } = await db.from('conversations').select('*').eq('company_id', instance.company_id).eq('remote_jid', remoteJid).maybeSingle()
  if (existing) return existing
  const cid = contactId ?? (await upsertContact(db, instance, remoteJid, pushName)).id
  const { data } = await db.from('conversations').insert({
    company_id: instance.company_id, contact_id: cid, instance_id: instance.id, remote_jid: remoteJid,
  }).select().single()
  return data
}

async function onConnectionUpdate(body: any) {
  const name = body?.instance; const state = body?.data?.state
  if (!name) return
  const status = state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected'
  await serviceClient().from('instances').update({ status, last_seen_at: new Date().toISOString() }).eq('instance_name', name)
}

async function onQrUpdate(body: any) {
  const name = body?.instance
  const qr = body?.data?.qrcode?.base64 ?? body?.data?.base64
  if (!name || !qr) return
  await serviceClient().from('instances').update({ qr_base64: qr, status: 'connecting' }).eq('instance_name', name)
}

// ---------- resposta da IA ----------
// Lock por conversa em ai_state.processing_since: só UMA execução responde por vez.
// As demais invocações só gravam a mensagem e saem — o runner ativo as recolhe.
async function respondWithAi(db: any, instance: any, conv: any, contact: any, incoming: any, text: string, mediaNote?: string) {
  const companyId = instance.company_id
  const { data: company } = await db.from('companies').select('*').eq('id', companyId).single()
  if (!company) return

  const subOk = company.subscription_status === 'active' ||
    (company.subscription_status === 'trial' && new Date(company.trial_until) > new Date()) ||
    (company.subscription_until && new Date(company.subscription_until) > new Date())
  if (!subOk) return

  // tenta adquirir o lock da conversa (claim atômico)
  const stale = new Date(Date.now() - LOCK_TTL_MS).toISOString()
  const { data: claimed } = await db.from('conversations')
    .update({ ai_state: { ...(conv.ai_state ?? {}), processing_since: new Date().toISOString() } })
    .eq('id', conv.id)
    .or(`ai_state->>processing_since.is.null,ai_state->>processing_since.lt.${stale}`)
    .select('id')
  if (!claimed?.length) return // outro runner já está respondendo — só deixa a mensagem pra ele

  const remoteJid = incoming.remoteJid
  const runnerStart = Date.now()
  let pendingMediaNote = mediaNote

  try {
    // loop do runner: espera 10s de silêncio → responde o que acumulou → repete
    // (se chegou mensagem enquanto a IA pensava, o próximo ciclo pega)
    while (Date.now() - runnerStart < MAX_RUNNER_MS) {
      // fase 1: esperar o cliente parar de digitar (10s sem msg nova)
      for (;;) {
        const { data: lastIn } = await db.from('messages').select('created_at')
          .eq('conversation_id', conv.id).eq('direction', 'in')
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        const lastAt = lastIn ? new Date(lastIn.created_at).getTime() : runnerStart
        const quietFor = Date.now() - lastAt
        if (quietFor >= QUIET_MS || Date.now() - runnerStart >= MAX_RUNNER_MS) break
        await new Promise(r => setTimeout(r, Math.min(QUIET_MS - quietFor + 800, QUIET_MS)))
        const { data: c } = await db.from('conversations').select('mode').eq('id', conv.id).single()
        if (c?.mode === 'human') return
      }

      // fase 2: responder mensagens ainda não respondidas (pipeline compartilhado)
      const replied = await processUnresponded({
        db, company, instance, conv, contact, remoteJid,
        mediaNote: pendingMediaNote, fallbackText: text,
      })
      pendingMediaNote = undefined
      if (!replied) break
    }
  } finally {
    // solta o lock
    try {
      const { data: cur } = await db.from('conversations').select('ai_state').eq('id', conv.id).single()
      const { processing_since: _drop, ...rest } = cur?.ai_state ?? {}
      await db.from('conversations').update({ ai_state: rest }).eq('id', conv.id)
    } catch { /* best effort */ }
  }
}
