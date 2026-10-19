import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, Download, Image as ImageIcon, Megaphone, Trash2, X } from 'lucide-react'
import { supabase, fmtDate } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import PostPreview from '@/components/ui/PostPreview'
import clsx from 'clsx'

type SocialPostRow = {
  id: string; title: string; caption: string; hashtags: string | null; image_url: string | null
  platform: 'instagram' | 'facebook'; format: 'feed' | 'story'
  used: boolean; used_at: string | null; created_at: string
}

export default function SocialPage() {
  const { company } = useAuth()
  const [posts, setPosts] = useState<SocialPostRow[]>([])
  const [platform, setPlatform] = useState('all')
  const [usedFilter, setUsedFilter] = useState<'all' | 'unused' | 'used'>('all')
  const [viewing, setViewing] = useState<SocialPostRow | null>(null)

  useEffect(() => { if (company) load() }, [company?.id])

  async function load() {
    const { data } = await supabase.from('social_posts').select('*').eq('company_id', company!.id)
      .order('created_at', { ascending: false })
    setPosts((data as SocialPostRow[]) ?? [])
  }

  async function toggleUsed(p: SocialPostRow) {
    const used = !p.used
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, used, used_at: used ? new Date().toISOString() : null } : x))
    await supabase.from('social_posts').update({ used, used_at: used ? new Date().toISOString() : null }).eq('id', p.id)
  }

  async function remove(id: string) {
    if (!confirm('Apagar este post da biblioteca?')) return
    setPosts(prev => prev.filter(p => p.id !== id))
    await supabase.from('social_posts').delete().eq('id', id)
  }

  const filtered = posts.filter(p =>
    (platform === 'all' || p.platform === platform) &&
    (usedFilter === 'all' || (usedFilter === 'used') === p.used))

  const unusedCount = posts.filter(p => !p.used).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h-display text-2xl sm:text-3xl flex items-center gap-2"><Megaphone className="h-7 w-7 text-brand-500" /> Social</h1>
          <p className="text-sm text-ink-muted">{posts.length} posts criados pela IA · {unusedCount} ainda não usados. Marque quando postar.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input !w-auto text-sm" value={platform} onChange={e => setPlatform(e.target.value)}>
            <option value="all">Todas as redes</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>
          <div className="flex rounded-xl border border-line overflow-hidden text-xs">
            {([['all', 'Todos'], ['unused', 'Não usados'], ['used', 'Usados']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setUsedFilter(k)}
                className={clsx('px-3 py-2 transition', usedFilter === k ? 'bg-brand-500 text-white' : 'text-ink-muted hover:bg-brand-50')}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card-lux p-12 text-center">
          <ImageIcon className="h-10 w-10 text-ink-muted/40 mx-auto mb-3" />
          <p className="font-medium">Nenhum post aqui ainda</p>
          <p className="text-sm text-ink-muted mt-1">Peça no <a href="/app/assistente" className="text-brand-600 underline">Assistente IA</a>: "cria um post de Instagram" ou "um story de promoção" — ele aparece aqui automaticamente.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }}
              className={clsx('card-lux overflow-hidden group', p.used && 'opacity-70')}>
              <button onClick={() => setViewing(p)} className="block w-full text-left relative">
                {p.image_url
                  ? <img src={p.image_url} alt={p.title} className={clsx('w-full object-cover', p.format === 'story' ? 'aspect-[9/16] max-h-64' : 'aspect-square')} />
                  : <div className="w-full aspect-square bg-gradient-to-br from-brand-100 to-accent-100 grid place-items-center p-4 text-center"><p className="font-display font-semibold text-brand-700 text-sm">{p.title}</p></div>}
                <div className="absolute top-2 left-2 flex gap-1">
                  <span className="badge bg-black/60 text-white !border-0 backdrop-blur text-[9px]">
                    {p.platform === 'facebook' ? 'Facebook' : 'Instagram'}{p.format === 'story' ? ' · Story' : ''}
                  </span>
                </div>
                {p.used && <span className="absolute top-2 right-2 badge bg-emerald-500 text-white !border-0 text-[9px]"><Check className="h-2.5 w-2.5" /> postado</span>}
              </button>
              <div className="p-3">
                <p className="font-semibold text-sm truncate">{p.title}</p>
                <p className="text-[11px] text-ink-muted line-clamp-2 mt-0.5">{p.caption}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-ink-muted">{fmtDate(p.created_at)}{p.used && p.used_at ? ` · usado ${fmtDate(p.used_at)}` : ''}</span>
                  <div className="flex gap-1">
                    <button onClick={() => toggleUsed(p)} title={p.used ? 'Marcar como não usado' : 'Marcar como postado'}
                      className={clsx('btn-ghost !p-1.5', p.used ? 'text-amber-600' : 'text-emerald-600')}>
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(p.id)} title="Apagar" className="btn-ghost !p-1.5 text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {viewing && <PostModal post={viewing} biz={company} onToggle={toggleUsed} onClose={() => { setViewing(null); load() }} />}
    </div>
  )
}

function PostModal({ post, biz, onToggle, onClose }: { post: SocialPostRow; biz: any; onToggle: (p: SocialPostRow) => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [used, setUsed] = useState(post.used)
  const fullText = `${post.title}\n\n${post.caption}${post.hashtags ? `\n\n${post.hashtags}` : ''}`

  async function copy() {
    try { await navigator.clipboard.writeText(fullText); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }
  async function download() {
    if (!post.image_url) return
    try {
      const blob = await fetch(post.image_url).then(r => r.blob())
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${post.title.replace(/[^\wÀ-ÿ -]+/g, '').slice(0, 40) || 'post'}.jpg`
      a.click(); URL.revokeObjectURL(a.href)
    } catch { window.open(post.image_url, '_blank') }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="card-lux w-full max-w-sm p-5 anim-pop max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold truncate">{post.title}</h3>
          <button className="btn-ghost !p-1.5" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <PostPreview post={{ ...post, hashtags: post.hashtags ?? '', image_url: post.image_url ?? undefined }} bizName={biz?.name ?? 'Seu negócio'} bizLogo={biz?.logo_url} bizHandle={biz?.instagram} />
        <div className="flex gap-2 mt-4">
          {post.image_url && <button onClick={download} className="btn-primary flex-1 !py-2 text-xs"><Download className="h-3.5 w-3.5" /> Baixar arte</button>}
          <button onClick={copy} className="btn-outline flex-1 !py-2 text-xs">{copied ? '✓ Copiada' : <><Copy className="h-3.5 w-3.5" /> Copiar legenda</>}</button>
        </div>
        <button onClick={async () => { await onToggle(post); setUsed(!used) }}
          className={clsx('w-full mt-2 rounded-xl py-2 text-xs font-semibold border transition',
            used ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700')}>
          {used ? '↩ Marcar como não usado' : '✓ Marcar como postado'}
        </button>
      </div>
    </div>
  )
}
