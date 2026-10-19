// Gera as artes da landing em public/imagens/ via OpenRouter (gemini-2.5-flash-image).
// Uso: OPENROUTER_API_KEY=... node scripts/gen-art.mjs [nome1 nome2 ...]
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'

const STYLE = 'Premium beauty-tech SaaS aesthetic, soft 3D render style, glassmorphism, soft studio lighting, pastel gradients, clean minimal composition, high-end Brazilian beauty salon vibe, octane render quality, 8k. '

const ARTS = {
  'logo': `${STYLE}Minimalist logo mark for "IAstetic", an AI-powered beauty business platform. An elegant abstract monogram combining a subtle sparkle/star and a soft letter "A" shape, rounded geometric forms, gradient from mauve pink #C265A3 to lilac #A27AFF, flat vector style with subtle 3D depth, centered, isolated on plain white background, no text below.`,
  'hero-landing': `${STYLE}A premium smartphone floating at a slight angle showing a beautiful WhatsApp chat interface where an AI is booking a beauty appointment, around the phone float soft 3D elements: scissors, nail polish bottle, eyelash curler, calendar icon, chat bubbles, sparkles. Mauve pink #C265A3 and lilac #A27AFF palette, dreamy glassmorphism background shapes, portrait composition.`,
  'hero-textura': `${STYLE}Very subtle abstract wide background, flowing silk ribbons and soft gradient waves in pale mauve pink and lilac on near-white, ultra minimal, airy, lots of negative space, soft depth of field, wide panoramic.`,
  'passo-1': `${STYLE}Soft 3D illustration of a smartphone with a glowing green chat bubble and a connection beam linking to an AI orb, mauve pink palette, centered, white background.`,
  'passo-2': `${STYLE}Soft 3D illustration of a glowing AI orb absorbing a checklist of beauty services (scissors, polish, lashes icons floating into it), lilac palette, centered, white background.`,
  'passo-3': `${STYLE}Soft 3D illustration of a calendar page with a confirmed checkmark and celebration sparkles, a small coin beside, pink-to-lilac gradient, centered, white background.`,
  'cta-fundo': `${STYLE}Wide panoramic abstract gradient banner, flowing aurora waves of mauve pink, lilac and soft gold, elegant, minimal, no text.`,
  'niche-salao': `${STYLE}Photorealistic elegant hair salon interior: golden mirrors, caramel leather chairs, warm amber light, hairstylist tools, amber/gold #C68B2C palette on cream, wide 4:3 composition, no people faces, no text.`,
  'niche-unhas': `${STYLE}Photorealistic chic nail studio scene: manicure table with coral and mint nail polish bottles, soft rose lighting, delicate hands resting on cushion blurred in background, coral #E45454 and mint #48BEA0 accents, wide 4:3, no text.`,
  'niche-olhar': `${STYLE}Photorealistic lash and brow studio: treatment bed, ring light glow, eyelash extensions tools and brow palette, plum #885C90 and bronze #CC9C70 palette, dreamy soft focus, wide 4:3, no text.`,
  'niche-barbearia': `${STYLE}Photorealistic premium barbershop interior: vintage leather barber chairs, dark wood, exposed warm bulbs, straight razor and clippers on counter, copper and slate palette, moody masculine lighting, wide 4:3, no people faces, no text.`,
  'niche-clinica': `${STYLE}Photorealistic modern aesthetic clinic treatment room: clean white treatment bed, teal accent wall, skincare devices, eucalyptus plants, fresh clinical elegance, teal #3E9E9A palette, wide 4:3, no people faces, no text.`,
}

const key = process.env.OPENROUTER_API_KEY
if (!key) { console.error('OPENROUTER_API_KEY ausente'); process.exit(1) }
const only = process.argv.slice(2)
mkdirSync('public/imagens', { recursive: true })

for (const [name, prompt] of Object.entries(ARTS)) {
  if (only.length && !only.includes(name)) continue
  const out = `public/imagens/${name}.png`
  if (existsSync(out) && !process.env.FORCE) { console.log(`skip ${name} (existe; FORCE=1 pra refazer)`); continue }
  console.log(`gerando ${name}…`)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://iastetic.com.br', 'X-Title': 'IAstetic' },
      body: JSON.stringify({ model: 'google/gemini-2.5-flash-image', messages: [{ role: 'user', content: `Generate an image: ${prompt}` }], modalities: ['image', 'text'] }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) { console.log(`  ✗ ${res.status} ${(await res.text()).slice(0, 120)}`); continue }
    const data = await res.json()
    const img = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? ''
    const b64 = img.startsWith('data:') ? img.split(',')[1] : img
    if (!b64) { console.log('  ✗ sem imagem na resposta'); continue }
    writeFileSync(out, Buffer.from(b64, 'base64'))
    console.log(`  ✓ ${out}`)
  } catch (e) { console.log(`  ✗ ${e.message}`) }
}
console.log('pronto')
