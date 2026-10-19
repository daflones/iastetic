import { ApiError } from './http.ts'
import { serviceClient } from './db.ts'
import { getSecret, requireSecret } from './secrets.ts'

const BASE = 'https://integrate.api.nvidia.com/v1'
const OR_BASE = 'https://openrouter.ai/api/v1'

async function key() { return requireSecret('NVIDIA_API_KEY') }

/** Provedor de IA: 'openrouter' (se AI_PROVIDER=openrouter e houver key) ou 'nvidia' (padrão). */
async function aiEndpoint(): Promise<{ url: string; apiKey: string; viaOpenRouter: boolean }> {
  const provider = (await getSecret('AI_PROVIDER')) ?? 'auto'
  const orKey = await getSecret('OPENROUTER_API_KEY')
  if ((provider === 'openrouter' || (provider === 'auto' && orKey)) && orKey) {
    return { url: `${OR_BASE}/chat/completions`, apiKey: orKey, viaOpenRouter: true }
  }
  return { url: `${BASE}/chat/completions`, apiKey: await requireSecret('NVIDIA_API_KEY'), viaOpenRouter: false }
}

async function orHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
    'HTTP-Referer': (await getSecret('PUBLIC_SITE_URL')) ?? 'https://iastetic.com.br',
    'X-Title': 'IAstetic',
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}
export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface ChatOpts {
  model?: string
  messages: ChatMessage[]
  tools?: unknown[]
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
}

/** Chamada de texto (com tool calling) no endpoint OpenAI-compatible da NVIDIA. */
export async function chat(opts: ChatOpts): Promise<{ message: ChatMessage; usage: { prompt_tokens?: number; completion_tokens?: number } }> {
  const ep = await aiEndpoint()
  const model = opts.model ?? await getSecret('AI_MODEL') ?? (ep.viaOpenRouter ? 'google/gemini-2.5-flash' : 'z-ai/glm-5.3-flash')
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.6,
    top_p: 0.9,
    max_tokens: opts.maxTokens ?? 700,
    stream: false,
  }
  if (opts.tools?.length) { body.tools = opts.tools; body.tool_choice = 'auto' }
  if (!ep.viaOpenRouter && model.includes('glm')) {
    body.reasoning_effort = 'low'
    body.chat_template_kwargs = { clear_thinking: true, enable_thinking: false }
  }
  // gemini flash "thinking" pode ser desligado p/ latência menor via OR
  if (ep.viaOpenRouter && model.includes('gemini')) {
    body.reasoning = { effort: 'low' }
  }
  const res = await fetch(ep.url, {
    method: 'POST',
    headers: ep.viaOpenRouter ? await orHeaders(ep.apiKey) : { Authorization: `Bearer ${ep.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 150_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new ApiError(502, 'AI_FAILED', `IA indisponível (${res.status}): ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  const choice = data?.choices?.[0]
  return { message: choice?.message ?? { role: 'assistant', content: '' }, usage: data?.usage ?? {} }
}

/** Apenas texto simples (fallback rápido). */
export async function chatText(messages: ChatMessage[], maxTokens = 400, model?: string): Promise<string> {
  const { message } = await chat({ messages, maxTokens, model })
  return (message.content ?? '').trim()
}

/** Transcreve áudio → texto. Groq Whisper (REST, free tier) se GROQ_API_KEY; senão tenta NVIDIA. */
export async function transcribeAudio(base64Audio: string, mime = 'audio/ogg'): Promise<string> {
  const groqKey = await getSecret('GROQ_API_KEY')
  if (groqKey) return groqWhisper(base64Audio, mime, groqKey)
  return nvidiaAsr(base64Audio, mime)
}

async function groqWhisper(base64Audio: string, mime: string, apiKey: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))
  const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') || mime.includes('opus') ? 'ogg' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : 'mp3'
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mime }), `audio.${ext}`)
  form.append('model', (await getSecret('ASR_MODEL')) ?? 'whisper-large-v3-turbo')
  form.append('language', 'pt')
  form.append('response_format', 'json')
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new ApiError(502, 'ASR_FAILED', `ASR indisponível (${res.status}): ${t.slice(0, 150)}`)
  }
  const data = await res.json()
  return (data?.text ?? '').trim()
}

async function nvidiaAsr(base64Audio: string, mime: string): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await requireSecret('NVIDIA_ASR_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: (await getSecret('ASR_MODEL')) ?? 'nvidia/parakeet-1.1b-rnnt-multilingual-asr',
      messages: [{
        role: 'user',
        content: [{ type: 'audio_url', audio_url: { url: `data:${mime};base64,${base64Audio}` } }],
      }],
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new ApiError(502, 'ASR_FAILED', 'Não foi possível transcrever o áudio.')
  const data = await res.json()
  return (data?.choices?.[0]?.message?.content ?? '').trim()
}

/** Descreve imagem — recebe URL pública ou data URL base64. OpenRouter (gemini vision) ou NVIDIA. */
export async function describeImage(imageUrl: string, question: string): Promise<string> {
  const ep = await aiEndpoint()
  const models = ep.viaOpenRouter
    ? [(await getSecret('VISION_MODEL')) ?? 'google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite']
    : [
      (await getSecret('VISION_MODEL')) ?? 'meta/llama-3.2-90b-vision-instruct',
      'meta/llama-3.2-11b-vision-instruct',
      'microsoft/phi-4-multimodal-instruct',
    ]
  let lastErr: unknown = null
  for (const model of [...new Set(models)]) {
    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: ep.viaOpenRouter ? await orHeaders(ep.apiKey) : { Authorization: `Bearer ${await requireSecret('NVIDIA_VISION_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: question },
          ] }],
          max_tokens: 512,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) { lastErr = new ApiError(502, 'VISION_FAILED', `${model}: ${res.status}`); continue }
      const data = await res.json()
      const text = (data?.choices?.[0]?.message?.content ?? '').trim()
      if (text) return text
    } catch (e) { lastErr = e }
  }
  throw lastErr instanceof Error ? lastErr : new ApiError(502, 'VISION_FAILED', 'Não foi possível analisar a imagem.')
}

/** Gera imagem a partir de texto. OpenRouter (gemini-2.5-flash-image) ou NVIDIA FLUX. Retorna base64. */
export async function generateImage(prompt: string, opts: { width?: number; height?: number; model?: string } = {}): Promise<{ base64: string; mime: string }> {
  const ep = await aiEndpoint()
  if (ep.viaOpenRouter) {
    const model = opts.model ?? (await getSecret('IMAGE_MODEL')) ?? 'google/gemini-2.5-flash-image'
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: await orHeaders(ep.apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: `Generate an image: ${prompt.slice(0, 4000)}` }],
        modalities: ['image', 'text'],
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new ApiError(502, 'IMAGE_FAILED', `Geração de imagem indisponível (${res.status}): ${t.slice(0, 150)}`)
    }
    const data = await res.json()
    const img = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? ''
    const b64 = img.startsWith('data:') ? img.split(',')[1] : img
    if (!b64) throw new ApiError(502, 'IMAGE_EMPTY', 'IA não retornou imagem.')
    return { base64: b64, mime: img.match(/^data:([^;]+)/)?.[1] ?? 'image/png' }
  }
  const model = opts.model ?? (await getSecret('IMAGE_MODEL')) ?? 'black-forest-labs/flux.2-klein-4b'
  const res = await fetch(`https://ai.api.nvidia.com/v1/genai/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await key()}`, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      prompt: prompt.slice(0, 10_000), mode: 'Image Generation',
      width: opts.width ?? 1024, height: opts.height ?? 1024,
      cfg_scale: 0, samples: 1, seed: 0, steps: 4,
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new ApiError(502, 'IMAGE_FAILED', `Geração de imagem indisponível (${res.status}): ${t.slice(0, 150)}`)
  }
  const data = await res.json()
  const b64 = data?.artifacts?.[0]?.base64 ?? data?.data?.[0]?.b64_json
  if (!b64) throw new ApiError(502, 'IMAGE_EMPTY', 'IA não retornou imagem.')
  return { base64: b64, mime: 'image/jpeg' }
}

/** TTS → retorna áudio mp3 em base64. Cadeia: ElevenLabs → OpenRouter (gpt-audio) → Google TTS.
 * TTS_PROVIDER no painel força um: 'elevenlabs' | 'openrouter' | 'google' | 'auto' (padrão). */
export async function synthesizeSpeech(text: string, lang = 'pt-BR'): Promise<{ base64: string; mime: string }> {
  const clean = text.replace(/[*_#`]/g, '').slice(0, 1200)
  const provider = (await getSecret('TTS_PROVIDER')) ?? 'auto'
  const elKey = await getSecret('ELEVENLABS_API_KEY')
  if (elKey && provider !== 'openrouter' && provider !== 'google') {
    try { return await elevenLabsTts(clean, elKey) } catch (e) { console.error('elevenlabs tts', e) }
  }
  const ep = await aiEndpoint()
  if (ep.viaOpenRouter && provider !== 'elevenlabs' && provider !== 'google') {
    try { return await openRouterTts(clean, ep) } catch (e) { console.error('openrouter tts', e) }
  }
  return googleTts(clean, lang)
}

/** TTS via OpenRouter — modelos com saída de áudio (openai/gpt-audio-mini: natural e barato, ótimo pt-BR).
 * O provider exige stream:true + formato pcm16 → acumulamos os chunks e empacotamos em WAV (24kHz mono). */
async function openRouterTts(text: string, ep: { url: string; apiKey: string }): Promise<{ base64: string; mime: string }> {
  const model = (await getSecret('TTS_MODEL')) ?? 'openai/gpt-audio-mini'
  const voice = (await getSecret('TTS_VOICE')) ?? 'coral'
  const res = await fetch(ep.url, {
    method: 'POST',
    headers: await orHeaders(ep.apiKey),
    body: JSON.stringify({
      model,
      stream: true,
      modalities: ['text', 'audio'],
      audio: { voice, format: 'pcm16' },
      messages: [
        { role: 'system', content: 'Você é uma recepcionista calorosa falando com uma cliente pelo WhatsApp. Leia o texto EXATAMENTE como enviado, em português brasileiro, com entonação natural, leve e humana — como uma mensagem de voz real.' },
        { role: 'user', content: text },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new ApiError(502, 'TTS_FAILED', `OpenRouter TTS ${res.status}: ${t.slice(0, 120)}`)
  }
  const reader = res.body?.getReader()
  if (!reader) throw new ApiError(502, 'TTS_EMPTY', 'Stream vazio.')
  const dec = new TextDecoder()
  let buf = '', audioB64 = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload)
        const a = j?.choices?.[0]?.delta?.audio
        if (a?.data) audioB64 += a.data
      } catch { /* chunk parcial */ }
    }
  }
  if (!audioB64) throw new ApiError(502, 'TTS_EMPTY', 'Modelo não retornou áudio.')
  const pcm = Uint8Array.from(atob(audioB64), c => c.charCodeAt(0))
  return { base64: bufToB64(pcmToWav(pcm)), mime: 'audio/wav' }
}

/** Empacota PCM 16-bit mono 24kHz em container WAV (RIFF). */
function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  const header = new ArrayBuffer(44)
  const v = new DataView(header)
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true)
  w(8, 'WAVE'); w(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, pcm.length, true)
  const out = new Uint8Array(44 + pcm.length)
  out.set(new Uint8Array(header)); out.set(pcm, 44)
  return out
}

async function elevenLabsTts(text: string, apiKey: string): Promise<{ base64: string; mime: string }> {
  // vozes premade funcionam no free; voices de biblioteca exigem plano pago (402)
  // ELEVENLABS_VOICE configurável no painel; fallback para a "Jessica" (quente, natural)
  const voice = (await getSecret('ELEVENLABS_VOICE')) ?? (await getSecret('ELEVENLABS_VOICE_ID')) ?? 'cgSgspJ2msm6clMCkdW9'
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      // tom humanizado: estabilidade moderada + estilo leve = voz expressiva mas natural
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true, speed: 0.98 },
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new ApiError(502, 'TTS_FAILED', `ElevenLabs ${res.status}: ${detail.slice(0, 120)}`)
  }
  return { base64: bufToB64(new Uint8Array(await res.arrayBuffer())), mime: 'audio/mpeg' }
}

async function googleTts(text: string, lang: string): Promise<{ base64: string; mime: string }> {
  // translate_tts aceita ~200 chars por chamada — divide em frases e concatena os mp3
  const chunks: string[] = []
  let rest = text.trim()
  while (rest.length) {
    if (rest.length <= 180) { chunks.push(rest); break }
    let cut = Math.max(rest.lastIndexOf('. ', 180), rest.lastIndexOf('! ', 180), rest.lastIndexOf('? ', 180), rest.lastIndexOf(', ', 180), rest.lastIndexOf(' ', 180))
    if (cut < 60) cut = 180
    chunks.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1).trim()
  }
  const parts: Uint8Array[] = []
  for (const c of chunks) {
    const res = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(c)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new ApiError(502, 'TTS_FAILED', `TTS indisponível (${res.status})`)
    parts.push(new Uint8Array(await res.arrayBuffer()))
  }
  const total = parts.reduce((a, p) => a + p.length, 0)
  const buf = new Uint8Array(total)
  let off = 0
  for (const p of parts) { buf.set(p, off); off += p.length }
  return { base64: bufToB64(buf), mime: 'audio/mpeg' }
}

function bufToB64(buf: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192))
  return btoa(bin)
}

export async function logUsage(companyId: string | null, kind: string, model: string, usage: { prompt_tokens?: number; completion_tokens?: number }) {
  try {
    await serviceClient().from('ai_usage').insert({
      company_id: companyId, kind, model,
      prompt_tokens: usage.prompt_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0,
    })
  } catch { /* log-only */ }
}
