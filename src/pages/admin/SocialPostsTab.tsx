import { useEffect, useState } from 'react'
import { Download, Image as ImageIcon, Loader2, Megaphone, Send, Sparkles, Trash2 } from 'lucide-react'
import { callFn, fmtDate } from '@/lib/supabase'
import clsx from 'clsx'

type Slide = { role: 'dor' | 'solucao' | 'cta'; headline: string; sub: string; image_url?: string; image_prompt?: string }
type Draft = { title: string; slides: Slide[]; caption: string; hashtags: string[] }
type SocialPost = { id: string; title: string; slides: Slide[]; caption: string; hashtags: string[]; status: 'rascunho' | 'pronto' | 'publicado'; created_at: string }

const ROLE_META: Record<string, { label: string; cls: string }> = {
  dor: { label: 'A DOR', cls: 'bg-red-500/90' },
  solucao: { label: 'A SOLUÇÃO', cls: 'bg-emerald-500/90' },
  cta: { label: 'CTA', cls: 'bg-brand-500/90' },
}
const STATUS: Record<string, string> = { rascunho: 'bg-slate-100 text-slate-600', pronto: 'bg-emerald-100 text-emerald-700', publicado: 'bg-brand-100 text-brand-700' }

/** Compõe o slide final (imagem + textos) num canvas 1080×1920 e baixa. */
async function downloadSlide(post: SocialPost, idx: number) {
  const sl = post.slides[idx]; if (!sl?.image_url) return
  const W = 1080, H = 1920
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')!
  const img = await new Promise<HTMLImageElement>((ok, err) => {
    const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = err; i.src = sl.image_url!
  })
  const sc = Math.max(W / img.width, H / img.height)
  ctx.drawImage(img, (W - img.width * sc) / 2, (H - img.height * sc) / 2, img.width * sc, img.height * sc)
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H)
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.82)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const meta = ROLE_META[sl.role] ?? ROLE_META.cta
  ctx.font = '600 30px Inter, system-ui, sans-serif'
  const badge = ` ${meta.label} `
  const bw = ctx.measureText(badge).width + 28
  ctx.fillStyle = sl.role === 'dor' ? 'rgba(239,68,68,0.92)' : sl.role === 'solucao' ? 'rgba(16,185,129,0.92)' : 'rgba(139,92,246,0.92)'
  ctx.beginPath(); ctx.roundRect(64, H - 470, bw, 58, 29); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.fillText(badge, 78, H - 470 + 41)
  const wrap = (t: string, max: number) => {
    const words = t.split(' '), lines: string[] = []; let cur = ''
    for (const w of words) {
      const tryL = cur ? cur + ' ' + w : w
      if (ctx.measureText(tryL).width > max && cur) { lines.push(cur); cur = w } else cur = tryL
    }
    if (cur) lines.push(cur)
    return lines
  }
  ctx.font = '800 88px Inter, system-ui, sans-serif'
  let y = H - 380
  for (const ln of wrap(sl.headline, W - 128)) { ctx.fillText(ln, 64, y); y += 100 }
  ctx.font = '500 44px Inter, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.92)'
  for (const ln of wrap(sl.sub, W - 128)) { ctx.fillText(ln, 64, y + 18); y += 58 }
  ctx.font = '600 30px Inter, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.fillText('iastetic.com.br · 7 dias grátis', 64, H - 60)
  const a = document.createElement('a')
  a.href = cv.toDataURL('image/png')
  a.download = `${post.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-slide${idx + 1}.png`
  a.click()
}

function SlidePreview({ slide }: { slide: Slide }) {
  const meta = ROLE_META[slide.role] ?? ROLE_META.cta
  return (
    <div className="relative w-40 shrink-0 aspect-[9/16] rounded-xl overflow-hidden bg-ink/10 snap-start ring-1 ring-black/5">
      {slide.image_url
        ? <img src={slide.image_url} className="absolute inset-0 w-full h-full object-cover" />
        : <div className="absolute inset-0 grid place-items-center text-ink-muted"><ImageIcon className="h-6 w-6" /></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <span className={clsx('absolute top-2 left-2 text-[8px] font-bold text-white rounded-full px-2 py-0.5 tracking-wider', meta.cls)}>{meta.label}</span>
      <div className="absolute bottom-0 inset-x-0 p-2.5">
        <p className="text-white font-bold text-[13px] leading-tight drop-shadow">{slide.headline}</p>
        <p className="text-white/85 text-[10px] mt-0.5 leading-snug">{slide.sub}</p>
      </div>
    </div>
  )
}

export default function SocialPostsTab() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string; draft?: Draft }[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [gen, setGen] = useState<string | null>(null)

  useEffect(() => { load() }, [])
  async function load() {
    const r = await callFn<SocialPost[]>('admin', { action: 'social_posts' }).catch(() => null)
    if (r) setPosts(r)
  }

  async function send() {
    const t = input.trim(); if (!t || busy) return
    const next = [...msgs, { role: 'user' as const, content: t }]
    setMsgs(next); setInput(''); setBusy(true)
    try {
      const r = await callFn<{ say: string; draft: Draft | null }>('admin', { action: 'social_assistant', history: next.slice(-14).map(m => ({ role: m.role, content: m.content })) })
      setMsgs([...next, { role: 'assistant', content: r.say || '…', draft: r.draft ?? undefined }])
    } catch (e) { setMsgs([...next, { role: 'assistant', content: `Erro: ${(e as Error).message}` }]) }
    setBusy(false)
  }

  async function materialize(draft: Draft) {
    if (gen) return
    setGen('Salvando estrutura…')
    try {
      const r = await callFn<{ id: string }>('admin', { action: 'social_post_save', ...draft })
      const postId = r.id
      for (let i = 0; i < draft.slides.length; i++) {
        setGen(`Gerando imagem ${i + 1}/${draft.slides.length} — aguenta…`)
        await callFn('admin', { action: 'social_gen_slide', post_id: postId, index: i })
      }
      await callFn('admin', { action: 'social_post_save', id: postId, ...draft, status: 'pronto' })
      setMsgs(m => [...m, { role: 'assistant', content: 'Pronto! Carrossel gerado e salvo na galeria →' }])
      await load()
    } catch (e) { setMsgs(m => [...m, { role: 'assistant', content: `Falhou na geração: ${(e as Error).message}` }]) }
    setGen(null)
  }

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-5 items-start">
      {/* chat da Marqueteira */}
      <div className="card-lux flex flex-col h-[560px]">
        <div className="p-4 border-b border-line flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-brand-500" />
          <p className="font-semibold text-sm">Marqueteira</p>
          <p className="text-[11px] text-ink-muted ml-auto">carrosséis · legendas · 9:16</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {msgs.length === 0 && (
            <div className="text-center pt-8">
              <Megaphone className="h-10 w-10 text-brand-300 mx-auto" />
              <p className="text-sm text-ink-muted mt-3">Pede um carrossel — eu crio dor, solução e CTA:</p>
              <div className="flex gap-2 flex-wrap justify-center mt-3">
                {['Post sobre cliente que some (no-show)', 'Carrossel: responder WhatsApp de madrugada', 'Post pra dona de esmalteria'].map(x => (
                  <button key={x} className="badge bg-brand-50 text-brand-700 hover:bg-brand-100 text-xs" onClick={() => setInput(x)}>{x}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i}>
              <div className={clsx('max-w-[88%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap', m.role === 'user' ? 'bg-brand-500 text-white ml-auto' : 'bg-canvas border border-line')}>
                {m.content}
              </div>
              {m.draft && (
                <div className="mt-2 rounded-2xl border border-brand-200 bg-brand-50/60 p-3 space-y-2">
                  <p className="text-xs font-semibold text-brand-800">{m.draft.title} — {m.draft.slides.length} slides</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {m.draft.slides.map((sl, j) => <SlidePreview key={j} slide={sl} />)}
                  </div>
                  <button className="btn-primary !py-2 text-xs w-full" disabled={!!gen} onClick={() => materialize(m.draft!)}>
                    {gen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {gen ? gen : 'Gerar as 3 imagens e salvar'}
                  </button>
                </div>
              )}
            </div>
          ))}
          {busy && <div className="flex gap-1 px-4 py-2 bg-canvas rounded-2xl w-16">{[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 rounded-full bg-ink/40 animate-typing" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>}
        </div>
        <div className="p-3 border-t border-line flex gap-2">
          <input className="input !rounded-full text-sm flex-1" placeholder="Ex.: carrossel sobre agenda furada…"
            value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} disabled={busy || !!gen} />
          <button className="btn-primary !rounded-full h-10 w-10 !p-0 shrink-0" onClick={send} disabled={busy || !input.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* galeria */}
      <div className="space-y-5">
        {posts.length === 0 && (
          <div className="card-lux p-10 text-center text-ink-muted text-sm">Nenhum post ainda — pede um pra Marqueteira ali do lado.</div>
        )}
        {posts.map(post => (
          <div key={post.id} className="card-lux p-5">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <p className="font-semibold">{post.title}</p>
              <span className={clsx('badge text-[10px]', STATUS[post.status])}>{post.status}</span>
              <span className="text-[11px] text-ink-muted">{fmtDate(post.created_at)}</span>
              <div className="ml-auto flex items-center gap-2">
                <select className="input !py-1 !px-2 text-xs !w-auto" value={post.status}
                  onChange={async e => { await callFn('admin', { action: 'social_post_save', id: post.id, title: post.title, slides: post.slides, caption: post.caption, hashtags: post.hashtags, status: e.target.value }); load() }}>
                  {['rascunho', 'pronto', 'publicado'].map(st => <option key={st} value={st}>{st}</option>)}
                </select>
                <button className="btn-ghost !p-1.5 text-red-400" onClick={async () => { await callFn('admin', { action: 'social_post_delete', id: post.id }); load() }}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
              {post.slides.map((sl, i) => (
                <div key={i} className="relative shrink-0">
                  <SlidePreview slide={sl} />
                  {sl.image_url && (
                    <button onClick={() => downloadSlide(post, i)} title="Baixar em 1080×1920 com texto"
                      className="absolute bottom-2 right-2 h-7 w-7 rounded-full bg-white/90 shadow-soft grid place-items-center hover:scale-105 transition z-10">
                      <Download className="h-3.5 w-3.5 text-ink" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <details className="mt-2 group">
              <summary className="text-xs text-brand-600 font-medium cursor-pointer">ver legenda + hashtags</summary>
              <div className="mt-2 rounded-xl bg-canvas p-3.5 text-xs text-ink-soft whitespace-pre-wrap leading-relaxed">
                {post.caption}
                {post.hashtags?.length > 0 && <p className="mt-2 text-brand-600">{post.hashtags.join(' ')}</p>}
              </div>
              <button className="btn-outline !py-1.5 text-xs mt-2" onClick={() => navigator.clipboard.writeText(post.caption + '\n\n' + (post.hashtags ?? []).join(' '))}>Copiar legenda</button>
            </details>
          </div>
        ))}
      </div>
    </div>
  )
}
