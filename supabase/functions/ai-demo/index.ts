import { cors, json, errorResponse, ApiError, str } from '../_shared/http.ts'
import { serviceClient } from '../_shared/db.ts'
import { runAgent, type AgentContext, nowInTz } from '../_shared/agent.ts'
import { logUsage, synthesizeSpeech } from '../_shared/nvidia.ts'
import type { ChatMessage } from '../_shared/nvidia.ts'

const MAX_TURNS = 3
const MAX_PER_IP_PER_DAY = 3        // sessões novas por IP/dia
const MAX_MSGS_PER_IP_DAY = 9       // mensagens de IA no total por IP/dia
const REUSE_WINDOW_MS = 6 * 3600_000 // sessão aberta do mesmo IP é reaproveitada

Deno.serve(async (req) => {
  const pre = cors(req); if (pre) return pre
  try {
    if (req.method !== 'POST') throw new ApiError(405, 'METHOD', 'POST only')
    const body = await req.json().catch(() => ({}))
    const niche = ['salao', 'unhas', 'olhar', 'barbearia', 'clinica'].includes(body.niche) ? body.niche : 'olhar'
    const message = str(body.message, 800).trim()
    const ipHash = await hashIp(req)

    const db = serviceClient()
    let session: any = null
    if (body.session_id) {
      const { data } = await db.from('demo_sessions').select('*').eq('id', body.session_id).maybeSingle()
      session = data
    }
    if (!session) {
      // anti-refresh: reaproveita sessão aberta do mesmo IP em vez de criar outra
      const { data: open } = await db.from('demo_sessions').select('*')
        .eq('ip_hash', ipHash).lt('turns', MAX_TURNS)
        .gte('updated_at', new Date(Date.now() - REUSE_WINDOW_MS).toISOString())
        .order('updated_at', { ascending: false }).limit(1).maybeSingle()
      session = open
    }
    if (!session) {
      // tetos por IP/dia: quantidade de sessões E total de mensagens já gastas
      const { data: rows } = await db.from('demo_sessions').select('turns').eq('ip_hash', ipHash).gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
      const used = (rows ?? []).reduce((a: number, r: any) => a + (r.turns ?? 0), 0)
      if (used >= MAX_MSGS_PER_IP_DAY || (rows?.length ?? 0) >= MAX_PER_IP_PER_DAY)
        throw new ApiError(429, 'RATE_LIMIT', 'Você já explorou bastante a demo hoje 😊 Crie sua conta grátis pra continuar — são 7 dias de teste.')
      const { data } = await db.from('demo_sessions').insert({ niche, ip_hash: ipHash }).select().single()
      session = data
    }
    if (session.turns >= MAX_TURNS) {
      return json({ ok: true, data: { session_id: session.id, reply: 'Que tal ver isso na prática no seu negócio? 😊 Crie sua conta grátis e conecte seu WhatsApp — a IA já sai atendendo.', done: true } })
    }
    if (!message) return json({ ok: true, data: { session_id: session.id, reply: '', done: false } })

    const { data: company } = await db.from('companies').select('*').eq('niche', niche).eq('is_demo', true).limit(1).single()
    if (!company) throw new ApiError(503, 'NO_DEMO', 'Demonstração indisponível no momento.')

    const history: ChatMessage[] = (session.messages as any[]).map(m => ({ role: m.role, content: m.content })).slice(-12)

    const ctx: AgentContext = {
      company,
      contact: { id: null, phone: 'demo', name: 'Visitante' },
      conversation: { id: session.id, mode: 'ai' },
      supabase: db,
    }
    const result = await runAgent(ctx, history, message)
    await logUsage(null, 'demo', 'demo', result.usage)

    const newTurns = session.turns + 1
    const msgs = [...session.messages, { role: 'user', content: message }, { role: 'assistant', content: result.text }]
    await db.from('demo_sessions').update({ messages: msgs, turns: newTurns, updated_at: new Date().toISOString() }).eq('id', session.id)

    // 2ª resposta sai também em áudio — a pessoa ouve a fluidez do TTS (ElevenLabs -> OpenRouter -> Google)
    let audio_b64: string | undefined, audio_mime: string | undefined
    if (newTurns === 2) {
      try {
        const tts = await synthesizeSpeech(result.text.replace(/[*_#`]/g, ''), 'pt-BR')
        audio_b64 = tts.base64; audio_mime = tts.mime
        await logUsage(null, 'demo_tts', 'tts', { prompt_tokens: result.text.length })
      } catch (e) { console.error('demo tts', e) }
    }

    return json({ ok: true, data: { session_id: session.id, reply: result.text, audio_b64, audio_mime, done: newTurns >= MAX_TURNS } })
  } catch (e) { return errorResponse(e) }
})

async function hashIp(req: Request): Promise<string> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + '|iastetic-demo'))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
