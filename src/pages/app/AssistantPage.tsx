import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Download, FileBarChart, Loader2, Mic, RotateCcw, Send, Sparkles, Square, Volume2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAssistant, type AssistantPost } from '@/hooks/useAssistant'
import PostPreview from '@/components/ui/PostPreview'
import clsx from 'clsx'

// renderiza **negrito** e listas com "-" de forma rica (o modelo responde em markdown leve)
function rich(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p)
    const isItem = /^\s*[-•]/.test(line)
    return <div key={i} className={clsx(isItem && 'pl-3 relative before:content-["•"] before:absolute before:left-0', line.trim() === '' && 'h-2')}>{parts}</div>
  })
}

const SUGGESTIONS = [
  'Como foi minha semana? Resumo com números.',
  'Quais clientes estão sumidas há mais de 30 dias?',
  'Sugira uma campanha inteligente com base nos meus dados.',
  'Escreve uma legenda de Instagram pro meu serviço mais vendido.',
  'Gera uma imagem de post promocional pro Instagram.',
  'Crie uma campanha de reativação pra clientes sumidas.',
  'Monte um relatório do mês para eu ver rápido.',
]

export default function AssistantPage() {
  const { plan, features, company } = useAuth()
  const { msgs, input, setInput, voice, setVoice, busy, recording, send, toggleMic, reset } = useAssistant()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  if (plan && !features.assistant) {
    return (
      <div className="card-lux p-10 text-center max-w-md mx-auto mt-10">
        <Sparkles className="h-10 w-10 text-brand-400 mx-auto mb-3" />
        <h2 className="font-display font-semibold text-lg">Assistente de Negócios</h2>
        <p className="text-sm text-ink-muted mt-2">Disponível no plano Premium. Pergunte sobre seu negócio, crie campanhas, posts e imagens para o Instagram.</p>
        <a href="/app/planos" className="btn-primary mt-5 inline-flex">Ver planos</a>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="h-display text-2xl sm:text-3xl flex items-center gap-2"><FileBarChart className="h-7 w-7 text-brand-500" /> Assistente</h1>
          <p className="text-sm text-ink-muted">Negócio, marketing, campanhas e imagens — a conversa continua mesmo se você trocar de tela.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} title="Nova conversa" className="btn-outline !py-2 !px-3 text-xs"><RotateCcw className="h-4 w-4" /></button>
          <button onClick={() => setVoice(!voice)} className={clsx('btn-outline !py-2 text-xs', voice && '!bg-brand-50 !border-brand-400 text-brand-700')}>
            {voice ? <Volume2 className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {voice ? 'Áudio ligado' : 'Responder em áudio'}
          </button>
        </div>
      </div>

      <div className="card-lux flex-1 overflow-y-auto p-4 space-y-3 texture-dots">
        {msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.28, ease: 'easeOut' }}
            className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={clsx('max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap shadow-sm',
              m.role === 'user' ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-br-md' : 'bg-surface border border-line rounded-bl-md')}>
              {rich(m.text)}
              {m.images?.map((im, j) => (
                <a key={j} href={im.url} target="_blank" rel="noreferrer" className="block mt-2 group">
                  <img src={im.url} alt={im.prompt} className="rounded-xl max-w-xs w-full border border-line group-hover:opacity-90 transition" />
                  <span className="text-[10px] text-ink-muted group-hover:text-brand-600 transition">abrir em tamanho original ↗</span>
                </a>
              ))}
              {m.posts?.map((p, j) => <PostCard key={j} post={p} biz={company} />)}
              {m.audio && (
                <audio controls src={m.audio} className="mt-2 w-56 h-8" />
              )}
              {m.audioBlocked && (
                <p className="mt-2 text-[11px] text-amber-600 italic">Limite de áudios do plano atingido — <a href="/app/planos" className="underline">recarregue em Meu Plano</a>.</p>
              )}
            </div>
          </motion.div>
        ))}
        {busy && (
          <div className="flex"><div className="bg-surface border border-line rounded-2xl rounded-bl-md px-4 py-3 text-sm text-ink-muted flex items-center gap-2 shimmer">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> trabalhando nisso…
          </div></div>
        )}
        <div ref={endRef} />
      </div>

      {msgs.length <= 2 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => send(s)} className="text-xs rounded-full border border-line px-3 py-1.5 text-ink-soft hover:border-brand-400 hover:text-brand-600 transition">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input className="input flex-1" placeholder={recording ? 'Ouvindo… clique no ⬛ para enviar' : 'Peça um post, uma campanha, uma imagem… ou pergunte do negócio'} value={input}
          onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} disabled={recording} />
        <button onClick={toggleMic} disabled={busy} title={recording ? 'Parar e enviar' : 'Falar'}
          className={clsx('!px-4 rounded-xl transition-all', recording ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30' : 'btn-outline')}>
          {recording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
        </button>
        <button className="btn-primary !px-4" onClick={() => send()} disabled={busy || !input.trim() || recording}><Send className="h-4 w-4" /></button>
      </div>
    </div>
  )
}

/** Card de post: preview realista da rede social + botões copiar legenda / baixar arte. */
function PostCard({ post, biz }: { post: AssistantPost; biz: any }) {
  const [copied, setCopied] = useState(false)
  const fullText = `${post.title ? post.title + '\n\n' : ''}${post.caption}${post.hashtags ? `\n\n${post.hashtags}` : ''}`
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
    } catch { window.open(post.image_url!, '_blank') }
  }
  return (
    <div className="not-prose">
      <p className="text-[10px] text-ink-muted mt-2 mb-0.5 font-medium">{post.title} — prévia de como sai na rede:</p>
      <PostPreview post={post} bizName={biz?.name ?? 'Seu negócio'} bizLogo={biz?.logo_url} bizHandle={biz?.instagram} />
      <div className="flex gap-2 mt-2 max-w-[320px]">
        {post.image_url && (
          <button onClick={download} className="btn-primary flex-1 !py-1.5 text-xs"><Download className="h-3.5 w-3.5" /> Baixar arte</button>
        )}
        <button onClick={copy} className="btn-outline flex-1 !py-1.5 text-xs">
          {copied ? <><Sparkles className="h-3.5 w-3.5" /> Copiada</> : <><Copy className="h-3.5 w-3.5" /> Copiar legenda</>}
        </button>
      </div>
    </div>
  )
}
