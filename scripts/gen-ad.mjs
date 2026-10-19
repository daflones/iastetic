// Anúncio em vídeo p/ Meta Ads (Teresópolis) — Veo 3.1 via OpenRouter com áudio pt-BR embutido.
// Uso: node scripts/gen-ad.mjs   (lê a key de .orkey.tmp ou env OPENROUTER_API_KEY)
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

const OUT = 'C:/Users/Eduardo Daflon/Desktop/anuncio-iastetic'
mkdirSync(OUT, { recursive: true })
const KEY = process.env.OPENROUTER_API_KEY ?? readFileSync('.orkey.tmp', 'utf8').trim()
const MODEL = 'google/veo-3.1-fast' // áudio nativo, 9:16, ~$0.12/s
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

// personagem consistente nos 3 clipes
const PERSON = 'a Brazilian woman in her early 40s, wavy dark brown hair, warm olive skin, wearing a black apron over a beige blouse, friendly and trustworthy face'
const SALON = 'an elegant Brazilian hair salon with golden mirrors, caramel chairs, warm lighting'
const STYLE = 'Photorealistic, shot on smartphone vertical video, natural handheld feel, soft warm light, no subtitles, no text overlays, no watermark.'

const CLIPS = [
  {
    name: 'clip1-hook',
    prompt: `${STYLE} Vertical 9:16 video. ${PERSON}, inside ${SALON}. She leans toward the camera talking directly to it with urgency and empathy, like a WhatsApp video note. She says in Brazilian Portuguese with a warm Rio de Janeiro accent: "Ei, você de Teresópolis! Dona de salão de cabelo, manicure, sobrancelha ou cílios — ou dono de barbearia?" Natural gestures, realistic.`,
  },
  {
    name: 'clip2-dor',
    prompt: `${STYLE} Vertical 9:16 video. ${PERSON} sits at the salon reception, visibly tired, looking at her smartphone overflowing with WhatsApp notifications; an empty salon chair behind her. She sighs, looks up at the camera and says in Brazilian Portuguese: "Cansada de perder cliente no WhatsApp… e de agenda furada com cliente que não aparece?"`,
  },
  {
    name: 'clip3-solucao-cta',
    prompt: `${STYLE} Vertical 9:16 video. ${PERSON}, now smiling and confident, holds her smartphone up toward the camera showing it, standing in ${SALON}. She says in Brazilian Portuguese, upbeat: "A IAstetic coloca uma recepcionista com IA no seu WhatsApp — ela agenda, cobra e lembra seus clientes sozinha. Clica em Saiba Mais e teste grátis!"`,
  },
]

async function submit(prompt) {
  const res = await fetch('https://openrouter.ai/api/v1/videos', {
    method: 'POST', headers: H,
    body: JSON.stringify({ model: MODEL, prompt, aspect_ratio: '9:16', duration: 8, resolution: '720p', generate_audio: true }),
  })
  if (!res.ok) throw new Error(`submit ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  return j.polling_url ?? `/api/v1/videos/${j.id}`
}

async function poll(pollingUrl) {
  const url = pollingUrl.startsWith('http') ? pollingUrl : `https://openrouter.ai${pollingUrl}`
  for (let i = 0; i < 120; i++) {
    const j = await (await fetch(url, { headers: H })).json()
    if (j.status === 'completed') return j.urls?.[0] ?? j.unsigned_urls?.[0]
    if (['failed', 'cancelled', 'expired'].includes(j.status)) throw new Error(`job ${j.status}: ${JSON.stringify(j).slice(0, 300)}`)
    await new Promise(r => setTimeout(r, 5000))
  }
  throw new Error('timeout no polling')
}

// 1) gera os 3 clipes em paralelo
const files = []
for (const c of CLIPS) {
  const f = `${OUT}/${c.name}.mp4`
  if (existsSync(f)) { console.log(`skip ${c.name}`); files.push(f); continue }
  console.log(`submetendo ${c.name}…`)
  const polling = await submit(c.prompt)
  console.log(`  job: ${polling}`)
  const videoUrl = await poll(polling)
  console.log(`  baixando…`)
  const buf = Buffer.from(await (await fetch(videoUrl, { headers: { Authorization: `Bearer ${KEY}` } })).arrayBuffer())
  writeFileSync(f, buf)
  console.log(`  ✓ ${f} (${(buf.length / 1e6).toFixed(1)}MB)`)
  files.push(f)
}

// 2) concatena + legenda CTA fixa embaixo
const list = `${OUT}/_list.txt`
writeFileSync(list, files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'))
const merged = `${OUT}/_merged.mp4`
execFileSync(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', merged])

const final = `${OUT}/iastetic-teresopolis-9x16.mp4`
const font = 'C\\:/Windows/Fonts/arialbd.ttf'
execFileSync(ffmpegPath, [
  '-y', '-i', merged,
  '-vf', `drawtext=fontfile='${font}':text='iastetic.com.br  •  teste grátis 7 dias':fontcolor=white:fontsize=34:borderw=2:bordercolor=black@0.55:x=(w-text_w)/2:y=h-110:enable='gte(t,15)'`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', final,
])
console.log(`\n✓ PRONTO: ${final}`)
