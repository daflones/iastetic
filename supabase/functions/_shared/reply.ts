import { runAgent, type AgentContext } from './agent.ts'
import { sendText, sendMedia, sendAudio, sendPresence } from './evolution.ts'
import { synthesizeSpeech, logUsage, getSecret, type ChatMessage } from './nvidia.ts'
import { tryConsume } from './quota.ts'

const HISTORY_LEN = 12

/** Processa mensagens do cliente ainda não respondidas numa conversa (modo IA).
 * Usada pelo webhook (loop normal) e pelo chat-manage ao devolver a conversa à IA. */
export async function processUnresponded(opts: {
  db: any; company: any; instance: any; conv: any; contact: any;
  remoteJid: string; mediaNote?: string; fallbackText?: string;
}): Promise<boolean> {
  const { db, company, instance, conv, contact, remoteJid } = opts
  const { data: unresponded } = await db.from('messages').select('*')
    .eq('conversation_id', conv.id).eq('direction', 'in')
    .or('meta->>responded.is.null,meta->>responded.eq.false')
    .order('created_at').limit(30)
  if (!unresponded?.length) return false

  // marca como respondidas ANTES de chamar a IA (evita resposta dupla)
  for (const m of unresponded) {
    await db.from('messages').update({ meta: { ...(m.meta ?? {}), responded: true } }).eq('id', m.id)
  }

  const userText = unresponded.map((m: any) => m.content ?? m.transcription ?? `[${m.type}]`).join('\n') || (opts.fallbackText ?? '')

  const { data: hist } = await db.from('messages').select('direction,sender,type,content,transcription')
    .eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(HISTORY_LEN)
  const history: ChatMessage[] = (hist ?? []).reverse().map((m: any) => ({
    role: m.direction === 'in' ? 'user' : 'assistant',
    content: m.direction === 'in'
      ? (m.type === 'text' ? m.content : `[${m.type}${m.transcription ? ': ' + m.transcription : ''}] ${m.content ?? ''}`)
      : m.content,
  })).filter((m: ChatMessage) => m.content) as ChatMessage[]
  while (history.length && history[history.length - 1].role === 'user') history.pop()

  // cota de mensagens: esgotada -> avisa a empresa uma vez e não responde (evita cobrar sem limite)
  const msgGate = await tryConsume(db, company.id, 'messages')
  if (!msgGate.ok) {
    const { data: existing } = await db.from('notifications').select('id')
      .eq('company_id', company.id).eq('kind', 'quota').eq('read', false).limit(1)
    if (!existing?.length) {
      await db.from('notifications').insert({
        company_id: company.id, kind: 'quota',
        title: 'Limite de mensagens do plano atingido',
        body: `Você usou ${msgGate.used}/${msgGate.limit} mensagens para clientes este mês. A IA pausou as respostas — recarregue em "Meu Plano" ou aguarde a renovação.`,
        link: '/app/planos',
      })
    }
    console.error('quota messages exhausted', company.id)
    return false
  }

  await sendPresence(instance.instance_name, remoteJid, 'composing')
  const ctx: AgentContext = { company, instance, contact, conversation: conv, supabase: db }
  let result
  try {
    result = await runAgent(ctx, history, userText, opts.mediaNote)
  } catch (e) {
    console.error('agent failed', e)
    result = { text: 'Desculpa, estou com uma instabilidade rapidinha 😅 Pode repetir?', files: [], chargeExtras: [], usage: {} }
  }
  await logUsage(company.id, 'chat', (await getSecret('AI_MODEL')) ?? 'z-ai/glm-5.3-flash', result.usage)
  const clientAudio = unresponded.some((m: any) => m.type === 'audio')
  const sent = await sendParts(db, instance, conv, company, remoteJid, result, clientAudio)
  // conta cada mensagem real enviada ao cliente (texto, imagem, áudio) contra a quota do plano
  for (let i = 0; i < sent; i++) {
    await db.from('ai_usage').insert({ company_id: company.id, kind: 'msg_customer', model: 'quota' }).then(() => {}).catch(() => {})
  }
  return true
}

async function sendParts(db: any, instance: any, conv: any, company: any, remoteJid: string, result: any, clientAudio = false): Promise<number> {
  const companyId = instance.company_id
  const reply = (result.text || '').trim()
  const delay = Math.max(0, company.ai_config?.reply_delay_sec ?? 2) * 1000
  const parts: { kind: 'text' | 'image' | 'link'; body: string }[] = []

  if (reply) parts.push({ kind: 'text', body: reply })
  for (const f of result.files ?? []) {
    parts.push(f.kind === 'image'
      ? { kind: 'image', body: f.url + '|' + f.title }
      : { kind: 'link', body: `${f.title}: ${f.url}` })
  }
  for (const extra of result.chargeExtras ?? []) {
    if (extra.startsWith('PIX_COPIAECOLA:')) parts.push({ kind: 'text', body: 'Aqui está o Pix copia e cola 👇' }, { kind: 'text', body: extra.slice('PIX_COPIAECOLA:'.length) })
    if (extra.startsWith('LINK_PAGAMENTO:')) parts.push({ kind: 'text', body: `💳 Pague com cartão neste link seguro: ${extra.slice('LINK_PAGAMENTO:'.length)}` })
  }

  // Conversa por voz: se a cliente falou por áudio e send_audio está ligado, respondemos em voz
  // (limite maior — a IA já escreve curto por causa do mediaNote). Se falou por texto, alternamos:
  // a primeira parte curta e sem links sai como áudio; links, Pix, imagens e textos longos ficam em texto.
  const audioAllowed = company.ai_config?.send_audio === true && instance.ai_overrides?.send_audio !== false
  const audioCap = clientAudio ? 1100 : 500
  let audioUsed = false
  let sent = 0

  for (const part of parts) {
    if (delay) await new Promise(r => setTimeout(r, Math.min(delay, 3000)))
    try {
      if (part.kind === 'image') {
        const [url, caption] = part.body.split('|')
        await sendMedia(instance.instance_name, remoteJid, url, caption)
        await db.from('messages').insert({ conversation_id: conv.id, company_id: companyId, direction: 'out', sender: 'ai', type: 'image', content: caption, media_url: url })
        sent++
      } else {
        const canVoice = audioAllowed && !audioUsed && part.body.length <= audioCap && !part.body.includes('http')
        if (canVoice) {
          try {
            const gate = await tryConsume(db, companyId, 'customer_audio')
            if (!gate.ok) throw new Error('audio quota')
            const audio = await synthesizeSpeech(part.body, 'pt-BR')
            await sendAudio(instance.instance_name, remoteJid, `data:${audio.mime};base64,${audio.base64}`)
            await db.from('messages').insert({ conversation_id: conv.id, company_id: companyId, direction: 'out', sender: 'ai', type: 'audio', content: part.body, media_mime: audio.mime })
            await logUsage(companyId, 'tts_customer', 'elevenlabs/openrouter', { prompt_tokens: part.body.length })
            audioUsed = true
            sent++
            continue
          } catch (e) { console.error('tts fallback to text', e) }
        }
        await sendText(instance.instance_name, remoteJid, part.body)
        await db.from('messages').insert({ conversation_id: conv.id, company_id: companyId, direction: 'out', sender: 'ai', type: 'text', content: part.body })
        sent++
      }
    } catch (e) { console.error('send failed', e) }
  }
  return sent
}
