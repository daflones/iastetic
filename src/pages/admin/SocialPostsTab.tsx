import { useEffect, useState } from 'react'
import { CalendarClock, Download, Heart, Image as ImageIcon, Loader2, Megaphone, MessageCircle, Send, Sparkles, Trash2, Unplug } from 'lucide-react'

function Instagram({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
}
import { callFn, fmtDate, FUNCTIONS_URL } from '@/lib/supabase'
import { useDraft } from '@/hooks/useDraft'
import clsx from 'clsx'

type Slide = { role: 'dor' | 'solucao' | 'cta'; headline: string; sub: string; image_url?: string; image_prompt?: string }
type Draft = { title: string; slides: Slide[]; caption: string; hashtags: string[]; scheduled_at?: string }
type SocialPost = { id: string; title: string; slides: Slide[]; caption: string; hashtags: string[]; status: 'rascunho' | 'pronto' | 'publicado'; created_at: string; scheduled_at?: string | null; ig_media_id?: string | null; published_at?: string | null; publish_error?: string | null }
type IgStatus = { connected: boolean; username?: string; avatar?: string | null; expires_at?: string; app_id?: string | null; expired?: boolean; profile?: { name?: string; bio?: string; website?: string; followers?: number; following?: number; posts?: number } }
type IgMedia = { id: string; caption?: string; media_url?: string; thumbnail_url?: string; like_count?: number; comments_count?: number; timestamp: string; permalink: string; media_type: string }

const ROLE_META: Record<string, { label: string; cls: string }> = {
  dor: { label: 'A DOR', cls: 'bg-red-500/90' },
  solucao: { label: 'A SOLUÇÃO', cls: 'bg-emerald-500/90' },
  cta: { label: 'CTA', cls: 'bg-brand-500/90' },
}
const STATUS: Record<string, string> = { rascunho: 'bg-slate-100 text-slate-600', pronto: 'bg-emerald-100 text-emerald-700', publicado: 'bg-brand-100 text-brand-700' }

/** Compõe o slide final (imagem + textos) num canvas 1080×1920. */
async function composeSlide(post: SocialPost, idx: number): Promise<HTMLCanvasElement | null> {
  const sl = post.slides[idx]; if (!sl?.image_url) return null
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
  return cv
}

async function downloadSlide(post: SocialPost, idx: number) {
  const cv = await composeSlide(post, idx); if (!cv) return
  const a = document.createElement('a')
  a.href = cv.toDataURL('image/png')
  a.download = `${post.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-slide${idx + 1}.png`
  a.click()
}

/** Compõe os slides com texto e sobe pro storage — Instagram publica a arte final, não a imagem crua. */
async function uploadComposed(post: SocialPost) {
  for (let i = 0; i < post.slides.length; i++) {
    if (!post.slides[i]?.image_url) continue
    const cv = await composeSlide(post, i)
    if (!cv) continue
    await callFn('admin', { action: 'social_upload_slide', post_id: post.id, index: i, data_url: cv.toDataURL('image/png') })
  }
}


function IgConnection({ ig, onChange }: { ig: IgStatus | null; onChange: () => void }) {
  const connectUrl = ig?.app_id
    ? `https://www.instagram.com/oauth/authorize?client_id=${ig.app_id}&redirect_uri=${encodeURIComponent(FUNCTIONS_URL + '/instagram-auth')}&response_type=code&scope=instagram_business_basic,instagram_business_manage_comments,instagram_business_content_publish&force_reauth=true`
    : null
  const p = ig?.profile
  return (
    <div className="card-lux p-5">
      <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
        <span className={clsx('h-20 w-20 sm:h-24 sm:w-24 rounded-full grid place-items-center overflow-hidden shrink-0 p-[3px]', ig?.connected ? 'bg-gradient-to-tr from-amber-400 via-pink-500 to-brand-500' : 'bg-gradient-to-br from-brand-100 to-accent-100')}>
          <span className="h-full w-full rounded-full bg-surface grid place-items-center overflow-hidden">
            {ig?.avatar ? <img src={ig.avatar} className="h-full w-full object-cover" /> : <Instagram className="h-7 w-7 text-brand-600" />}
          </span>
        </span>
        <div className="flex-1 min-w-[200px]">
          <p className="font-bold text-lg">@{ig?.username ?? '…'} <span className="text-emerald-600 text-xs font-normal">{ig?.connected ? '· conectado' : ''}</span></p>
          {p?.name && <p className="text-sm text-ink-soft">{p.name}</p>}
          {p?.bio && <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{p.bio}</p>}
          {p?.website && <a href={p.website} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">{p.website.replace(/^https?:\/\//, '')}</a>}
        </div>
        {ig?.connected && p && (
          <div className="flex gap-5 sm:gap-7 text-center">
            <div><p className="font-bold text-lg">{p.posts ?? 0}</p><p className="text-[10px] text-ink-muted uppercase tracking-wide">posts</p></div>
            <div><p className="font-bold text-lg">{p.followers ?? 0}</p><p className="text-[10px] text-ink-muted uppercase tracking-wide">seguidores</p></div>
            <div><p className="font-bold text-lg">{p.following ?? 0}</p><p className="text-[10px] text-ink-muted uppercase tracking-wide">seguindo</p></div>
          </div>
        )}
        <div className="w-full sm:w-auto">
          {ig?.connected
            ? <button className="btn-ghost text-xs" onClick={async () => { await callFn('admin', { action: 'ig_disconnect' }); onChange() }}><Unplug className="h-3.5 w-3.5" /> Desconectar</button>
            : connectUrl
              ? <a href={connectUrl} className="btn-primary text-xs !py-2"><Instagram className="h-4 w-4" /> Conectar Instagram</a>
              : <p className="text-[11px] text-ink-muted">Configure IG_APP_ID/IG_APP_SECRET em Integrações</p>}
        </div>
      </div>
      {ig?.connected && <p className="text-[10px] text-ink-muted mt-3">token renova automaticamente · expira {ig.expires_at ? fmtDate(ig.expires_at) : '—'}</p>}
    </div>
  )
}

function IgFeed() {
  const [media, setMedia] = useState<IgMedia[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, { username: string; text: string; timestamp: string }[]>>({})

  useEffect(() => {
    callFn<IgMedia[]>('admin', { action: 'ig_media' }).then(setMedia).catch(() => setMedia([]))
  }, [])

  async function openPost(id: string) {
    setOpen(id)
    if (!comments[id]) {
      const c = await callFn<{ username: string; text: string; timestamp: string }[]>('admin', { action: 'ig_comments', media_id: id }).catch(() => [])
      setComments(prev => ({ ...prev, [id]: c ?? [] }))
    }
  }

  if (media === null) return <div className="card-lux p-6 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-brand-400" /></div>
  const sel = media.find(m => m.id === open)

  return (
    <div className="card-lux p-5">
      <p className="font-semibold text-sm mb-3 flex items-center gap-2"><Instagram className="h-4 w-4 text-brand-500" /> Feed do Instagram ({media.length})</p>
      {!media.length && <p className="text-sm text-ink-muted text-center py-4">Nenhum post no perfil ainda — publica o primeiro pela Marqueteira!</p>}
      <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
        {media.map(m => (
          <button key={m.id} onClick={() => openPost(m.id)} className="relative aspect-square overflow-hidden group text-left">
            <img src={m.thumbnail_url ?? m.media_url} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
              <span className="flex items-center gap-4 text-white text-sm font-semibold">
                <span className="flex items-center gap-1"><Heart className="h-4 w-4 fill-white" />{m.like_count ?? 0}</span>
                <span className="flex items-center gap-1"><MessageCircle className="h-4 w-4 fill-white" />{m.comments_count ?? 0}</span>
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* detalhe do post — estilo modal do Instagram */}
      {sel && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={() => setOpen(null)}>
          <div className="bg-surface rounded-2xl overflow-hidden max-w-3xl w-full max-h-[90vh] grid sm:grid-cols-2 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="bg-black grid place-items-center">
              <img src={sel.media_url ?? sel.thumbnail_url} className="w-full h-full object-contain max-h-[50vh] sm:max-h-[90vh]" />
            </div>
            <div className="flex flex-col max-h-[90vh]">
              <div className="p-4 border-b border-line flex items-center gap-2">
                <Instagram className="h-4 w-4 text-brand-500" />
                <span className="text-sm font-semibold">Post</span>
                <a href={sel.permalink} target="_blank" rel="noreferrer" className="ml-auto text-xs text-brand-600 hover:underline">abrir no insta</a>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {sel.caption && <p className="text-xs text-ink-soft whitespace-pre-wrap leading-relaxed">{sel.caption}</p>}
                <div className="flex items-center gap-4 text-xs text-ink-muted pt-1">
                  <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5 text-red-400" />{sel.like_count ?? 0} curtidas</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5 text-brand-400" />{sel.comments_count ?? 0} comentários</span>
                  <span className="ml-auto">{fmtDate(sel.timestamp)}</span>
                </div>
                <div className="pt-2 border-t border-line">
                  <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mb-2">Comentários</p>
                  {(comments[sel.id] ?? []).length === 0 && <p className="text-xs text-ink-muted">Nenhum comentário ainda.</p>}
                  {(comments[sel.id] ?? []).map((c, i) => (
                    <div key={i} className="text-xs py-1.5">
                      <span className="font-semibold text-brand-700">@{c.username}</span> <span className="text-ink-soft">{c.text}</span>
                      <span className="block text-[10px] text-ink-muted mt-0.5">{fmtDate(c.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
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
  const [msgs, setMsgs] = useDraft<{ role: 'user' | 'assistant'; content: string; draft?: Draft; plan?: Draft[] }[]>('marqueteira:msgs', [])
  const [input, setInput] = useDraft('marqueteira:input', '')
  const [busy, setBusy] = useState(false)
  const [gen, setGen] = useState<string | null>(null)
  const [ig, setIg] = useState<IgStatus | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [schedFor, setSchedFor] = useState<string | null>(null)
  const [schedAt, setSchedAt] = useState('')

  useEffect(() => { load(); loadIg() }, [])
  async function loadIg() {
    const r = await callFn<IgStatus>('admin', { action: 'ig_status' }).catch(() => null)
    if (r) setIg(r)
  }
  async function genImages(post: SocialPost) {
    if (gen) return
    try {
      for (let i = 0; i < post.slides.length; i++) {
        if (!post.slides[i]?.image_url) {
          setGen(`Gerando imagem ${i + 1}/${post.slides.length}…`)
          await callFn('admin', { action: 'social_gen_slide', post_id: post.id, index: i })
        }
      }
      await load()
    } catch (e) { alert(`Falhou: ${(e as Error).message}`) }
    setGen(null)
  }

  async function publishNow(post: SocialPost) {
    setPublishing(post.id)
    try {
      await uploadComposed(post)
      await callFn('admin', { action: 'social_publish', post_id: post.id })
      await load()
    } catch (e) { alert((e as Error).message) }
    setPublishing(null)
  }
  async function schedule(post: SocialPost) {
    setPublishing(post.id)
    try {
      await uploadComposed(post)
      await callFn('admin', { action: 'social_schedule', post_id: post.id, scheduled_at: schedAt || null })
      setSchedFor(null); setSchedAt(''); load()
    } finally { setPublishing(null) }
  }
  async function load() {
    const r = await callFn<SocialPost[]>('admin', { action: 'social_posts' }).catch(() => null)
    if (r) setPosts(r)
  }

  async function send() {
    const t = input.trim(); if (!t || busy) return
    const next = [...msgs, { role: 'user' as const, content: t }]
    setMsgs(next); setInput(''); setBusy(true)
    try {
      const r = await callFn<{ say: string; draft: Draft | null; plan: Draft[] | null }>('admin', { action: 'social_assistant', history: next.slice(-14).map(m => ({ role: m.role, content: m.content })) })
      setMsgs([...next, { role: 'assistant', content: r.say || '…', draft: r.draft ?? undefined, plan: r.plan ?? undefined }])
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

  async function materializePlan(plan: Draft[]) {
    if (gen) return
    try {
      for (let d = 0; d < plan.length; d++) {
        const draft = plan[d]
        setGen(`Post ${d + 1}/${plan.length} — salvando…`)
        const r = await callFn<{ id: string }>('admin', { action: 'social_post_save', title: draft.title, slides: draft.slides, caption: draft.caption, hashtags: draft.hashtags, status: 'pronto', scheduled_at: draft.scheduled_at ?? null })
        for (let i = 0; i < draft.slides.length; i++) {
          setGen(`Post ${d + 1}/${plan.length} — imagem ${i + 1}/${draft.slides.length}…`)
          await callFn('admin', { action: 'social_gen_slide', post_id: r.id, index: i }).catch(() => {})
        }
      }
      setMsgs(m => [...m, { role: 'assistant', content: `Programação criada! ${plan.length} posts salvos e agendados → o cron publica cada um na hora marcada.` }])
      await load()
    } catch (e) { setMsgs(m => [...m, { role: 'assistant', content: `Falhou: ${(e as Error).message}` }]) }
    setGen(null)
  }

  return (
    <div className="space-y-5">
      <IgConnection ig={ig} onChange={loadIg} />
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
              {m.plan && (
                <div className="mt-2 rounded-2xl border border-brand-200 bg-brand-50/60 p-3 space-y-2">
                  <p className="text-xs font-semibold text-brand-800">Programação — {m.plan.length} posts</p>
                  <div className="space-y-1.5">
                    {m.plan.map((d, j) => (
                      <div key={j} className="flex items-center gap-2 text-xs bg-white/70 rounded-lg px-2.5 py-1.5">
                        <CalendarClock className="h-3.5 w-3.5 text-brand-500 shrink-0" />
                        <span className="font-medium flex-1">{d.title}</span>
                        <span className="text-[10px] text-ink-muted">{d.scheduled_at ? fmtDate(d.scheduled_at) : '—'}</span>
                      </div>
                    ))}
                  </div>
                  <button className="btn-primary !py-2 text-xs w-full" disabled={!!gen} onClick={() => materializePlan(m.plan!)}>
                    {gen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
                    {gen ? gen : `Criar os ${m.plan.length} posts e agendar`}
                  </button>
                </div>
              )}
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
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                {post.slides.some(x => !x.image_url) && (
                  <button className="btn-outline !py-1 !px-2.5 text-xs" disabled={!!gen} onClick={() => genImages(post)}>
                    {gen ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Gerar imagens
                  </button>
                )}
                {post.ig_media_id && <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">publicado no insta</span>}
                {post.scheduled_at && !post.ig_media_id && <span className="badge bg-amber-100 text-amber-700 text-[10px]"><CalendarClock className="h-3 w-3" /> {fmtDate(post.scheduled_at)}</span>}
                {post.publish_error && <span className="badge bg-red-100 text-red-600 text-[10px]" title={post.publish_error}>erro ao publicar</span>}
                {ig?.connected && !post.ig_media_id && post.slides.some(x => x.image_url) && (
                  <>
                    <button className="btn-primary !py-1 !px-2.5 text-xs" disabled={publishing === post.id} onClick={() => publishNow(post)}>
                      {publishing === post.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Instagram className="h-3 w-3" />} Publicar
                    </button>
                    <button className="btn-outline !py-1 !px-2.5 text-xs" onClick={() => setSchedFor(schedFor === post.id ? null : post.id)}>
                      <CalendarClock className="h-3 w-3" /> Agendar
                    </button>
                  </>
                )}
                <select className="input !py-1 !px-2 text-xs !w-auto" value={post.status}
                  onChange={async e => { await callFn('admin', { action: 'social_post_save', id: post.id, title: post.title, slides: post.slides, caption: post.caption, hashtags: post.hashtags, status: e.target.value }); load() }}>
                  {['rascunho', 'pronto', 'publicado'].map(st => <option key={st} value={st}>{st}</option>)}
                </select>
                <button className="btn-ghost !p-1.5 text-red-400" onClick={async () => { await callFn('admin', { action: 'social_post_delete', id: post.id }); load() }}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            {schedFor === post.id && (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-canvas p-3">
                <input type="datetime-local" className="input !py-1.5 text-xs !w-auto" value={schedAt} onChange={e => setSchedAt(e.target.value)} />
                <button className="btn-primary !py-1.5 text-xs" onClick={() => schedule(post)} disabled={!schedAt}>Confirmar</button>
                {post.scheduled_at && <button className="btn-ghost text-xs" onClick={async () => { await callFn('admin', { action: 'social_schedule', post_id: post.id, scheduled_at: null }); load() }}>cancelar</button>}
              </div>
            )}
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
      {ig?.connected && <IgFeed />}
    </div>
  )
}
