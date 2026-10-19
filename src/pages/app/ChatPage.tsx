import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bot, Hand, Loader2, Lock, MessageCircle, Search, Send, User, Volume2, Image as ImageIcon, Paperclip, Archive, ArchiveRestore, X, Bell, PanelRight } from 'lucide-react'
import { supabase, callFn, fmtPhone, fmtTime, fmtDate, brl } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useDraft } from '@/hooks/useDraft'
import { STAGES, stageInfo } from './ContactsPage'
import type { Conversation, Message } from '@/lib/types'
import clsx from 'clsx'

export default function ChatPage() {
  const { company } = useAuth()
  const [params] = useSearchParams()
  const [convs, setConvs] = useState<Conversation[]>([])
  const [active, setActive] = useState<Conversation | null>(null)
  const [msgs, setMsgs] = useState<Message[]>([])
  const [text, setText] = useDraft(`chat-msg:${active?.id ?? 'none'}`, '')
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [profs, setProfs] = useState<{ id: string; name: string; color: string | null; hasPin: boolean }[]>([])
  const [pickingOp, setPickingOp] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread' | 'attention' | 'ai' | 'human'>('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [showProfile, setShowProfile] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const needsAttention = (c: Conversation) =>
    c.mode === 'human' && !!(c as any).ai_state?.handoff_at && !(c as any).ai_state?.handoff_answered

  useEffect(() => { if (company) loadConvs() }, [company?.id, showClosed])

  useEffect(() => {
    if (!company) return
    supabase.from('professionals').select('id,name,color,pin_hash').eq('company_id', company.id).eq('active', true).order('name')
      .then(({ data }) => setProfs((data ?? []).map((p: any) => ({ id: p.id, name: p.name, color: p.color, hasPin: !!p.pin_hash }))))
  }, [company?.id])

  async function loadConvs() {
    const { data } = await supabase.from('conversations')
      .select('*, contacts(*)')
      .eq('company_id', company!.id)
      .eq('status', showClosed ? 'closed' : 'open')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(100)
    setConvs((data as any) ?? [])
  }

  // realtime: novas mensagens e conversas
  useEffect(() => {
    if (!company) return
    const ch = supabase.channel('chat-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `company_id=eq.${company.id}` },
        (p) => {
          const m = p.new as Message
          if (active && m.conversation_id === active.id) {
            setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
          }
          loadConvs()
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `company_id=eq.${company.id}` },
        () => loadConvs())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [company?.id, active?.id, showClosed])

  useEffect(() => {
    const id = params.get('c')
    if (id && convs.length && !active) {
      const found = convs.find(c => c.id === id)
      if (found) open(found)
    }
  }, [convs, params])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])

  async function open(c: Conversation) {
    setActive(c)
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', c.id).order('created_at').limit(300)
    setMsgs((data as Message[]) ?? [])
    if (c.unread_count > 0) callFn('chat-manage', { action: 'mark_read', conversation_id: c.id }).catch(() => {})
  }

  async function send() {
    if (!text.trim() || !active || sending) return
    setSending(true)
    try {
      await callFn('chat-manage', { action: 'send', conversation_id: active.id, text: text.trim() })
      setText('')
    } catch (e) { alert((e as Error).message) }
    setSending(false)
  }

  async function toggleMode() {
    if (!active) return
    if (active.mode === 'ai') { setPickingOp(true); return }
    await callFn('chat-manage', { action: 'release', conversation_id: active.id })
    setActive({ ...active, mode: 'ai', ai_state: { ...(active as any).ai_state, taken_by: undefined } })
  }

  async function assumeAs(professionalId: string | null, pin: string) {
    if (!active) return
    const r = await callFn<{ operator: { id: string | null; name: string; color: string } }>('chat-manage', {
      action: 'takeover', conversation_id: active.id,
      ...(professionalId ? { professional_id: professionalId } : {}),
      ...(pin ? { pin } : {}),
    })
    setPickingOp(false)
    setActive({ ...active, mode: 'human', ai_state: { ...(active as any).ai_state, taken_by: r.operator } })
  }

  const filtered = convs.filter(c => {
    const name = `${c.contacts?.name ?? ''} ${c.contacts?.push_name ?? ''} ${c.contacts?.phone ?? ''}`
    if (!name.toLowerCase().includes(search.toLowerCase())) return false
    if (stageFilter !== 'all' && c.contacts?.stage !== stageFilter) return false
    if (filter === 'unread') return c.unread_count > 0
    if (filter === 'attention') return needsAttention(c)
    if (filter === 'ai') return c.mode === 'ai'
    if (filter === 'human') return c.mode === 'human'
    return true
  })
  const attentionCount = convs.filter(needsAttention).length

  return (
    <div className="card-lux overflow-hidden flex" style={{ height: 'calc(100vh - 9rem)' }}>
      {/* lista de conversas */}
      <div className={clsx('w-full sm:w-80 shrink-0 border-r border-line flex flex-col', active && 'hidden sm:flex')}>
        <div className="p-3 border-b border-line space-y-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input className="input pl-9 !rounded-full text-sm" placeholder="Buscar conversa…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {/* filtros inteligentes */}
          <div className="flex flex-wrap gap-1">
            {([
              ['all', 'Todas'],
              ['unread', 'Não lidas'],
              ['attention', `🆘 precisa atendimento${attentionCount ? ` (${attentionCount})` : ''}`],
              ['ai', 'IA'],
              ['human', 'Humano'],
            ] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={clsx('text-[10px] rounded-full px-2.5 py-1 border transition',
                  filter === k ? 'bg-brand-500 text-white border-brand-500' : 'border-line text-ink-muted hover:border-brand-300',
                  k === 'attention' && filter !== k && attentionCount > 0 && 'border-red-300 text-red-500')}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select className="input !w-auto !py-1 !px-2 text-[11px] flex-1" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
              <option value="all">Todas as etapas</option>
              {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button onClick={() => setShowClosed(!showClosed)} className="text-[11px] text-ink-muted hover:text-brand-600 transition flex items-center gap-1 shrink-0">
              {showClosed ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
              {showClosed ? 'abertas' : 'arquivadas'}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(c => {
            const contact = c.contacts
            return (
              <button key={c.id} onClick={() => open(c)}
                className={clsx('w-full text-left px-4 py-3 border-b border-line/60 hover:bg-brand-50/60 transition-all flex items-center gap-3 relative',
                  active?.id === c.id && 'bg-gradient-to-r from-brand-50 to-transparent',
                  active?.id === c.id && 'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-gradient-to-b before:from-brand-400 before:to-accent-500')}>
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-brand-200 to-accent-300 grid place-items-center text-sm font-semibold text-white shrink-0 overflow-hidden ring-2 ring-white shadow-soft">
                  {contact?.avatar_url ? <img src={contact.avatar_url} className="h-full w-full object-cover" /> : (contact?.name ?? contact?.push_name ?? '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate flex items-center gap-1.5">
                      {contact?.name ?? contact?.push_name ?? fmtPhone(contact?.phone)}
                      {needsAttention(c) && (
                        <span className="badge bg-red-500 text-white !px-1.5 text-[9px] animate-pulse shrink-0">🆘 ajuda</span>
                      )}
                    </p>
                    {c.last_message_at && <span className="text-[10px] text-ink-muted shrink-0">{fmtTime(c.last_message_at)}</span>}
                  </div>
                  {contact?.stage && (
                    <span className={clsx('badge text-[8px] !py-0 mt-0.5', stageInfo(contact.stage).soft, stageInfo(contact.stage).text)}>
                      {stageInfo(contact.stage).label}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    {c.mode === 'ai'
                      ? <Bot className="h-3 w-3 text-brand-500 shrink-0" />
                      : <User className="h-3 w-3 text-amber-500 shrink-0" />}
                    <p className="text-xs text-ink-muted truncate">{c.last_message_preview ?? '—'}</p>
                    {c.unread_count > 0 && <span className="ml-auto badge bg-red-500 text-white !px-1.5 text-[10px]">{c.unread_count}</span>}
                  </div>
                </div>
              </button>
            )
          })}
          {filtered.length === 0 && <p className="text-xs text-ink-muted text-center py-10">Nenhuma conversa {showClosed ? 'arquivada' : 'aberta'} ainda.<br />Quando clientes falarem no WhatsApp, aparecem aqui.</p>}
        </div>
      </div>

      {/* janela da conversa */}
      <div className="flex-1 flex flex-col min-w-0">
        {active ? (
          <>
            <div className="h-14 px-4 border-b border-line flex items-center gap-3 bg-surface/90 backdrop-blur shrink-0">
              <button className="sm:hidden btn-ghost !p-1.5" onClick={() => setActive(null)}>‹</button>
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-200 to-accent-300 grid place-items-center text-sm font-semibold text-white overflow-hidden">
                {active.contacts?.avatar_url ? <img src={active.contacts.avatar_url} className="h-full w-full object-cover" /> : (active.contacts?.name ?? '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{active.contacts?.name ?? active.contacts?.push_name ?? fmtPhone(active.contacts?.phone)}</p>
                <p className="text-[11px] text-ink-muted">{fmtPhone(active.contacts?.phone)}</p>
              </div>
              {active.mode === 'human' && (active as any).ai_state?.taken_by?.name ? (
                <span className="badge text-white" style={{ background: (active as any).ai_state.taken_by.color ?? '#a78bfa' }}>
                  <User className="h-3 w-3" /> {(active as any).ai_state.taken_by.name}
                </span>
              ) : (
                <span className={clsx('badge', active.mode === 'ai' ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700')}>
                  {active.mode === 'ai' ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                  {active.mode === 'ai' ? 'IA atendendo' : 'Humano'}
                </span>
              )}
              <button onClick={toggleMode} className="btn-outline text-xs !py-1.5">
                <Hand className="h-3.5 w-3.5" /> {active.mode === 'ai' ? 'Assumir' : 'Devolver à IA'}
              </button>
              <button onClick={() => setShowProfile(!showProfile)} title="Perfil do contato"
                className={clsx('btn-ghost !p-2', showProfile && 'bg-brand-50 text-brand-600')}>
                <PanelRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-canvas/50 texture-dots">
              {msgs.map(m => <Bubble key={m.id} m={m} />)}
              <div ref={endRef} />
            </div>

            {pickingOp && (
              <OperatorPicker profs={profs} ownerHasPin={!!(company as any)?.owner_pin_hash} onPick={assumeAs} onClose={() => setPickingOp(false)} />
            )}
            <div className="p-3 border-t border-line flex items-center gap-2 bg-surface">
              <button className="btn-ghost !p-2" title="Enviar imagem (cole a URL na mensagem por enquanto)" disabled>
                <Paperclip className="h-4.5 w-4.5 h-[18px] w-[18px]" />
              </button>
              <input className="input !rounded-full" placeholder={active.mode === 'human' ? 'Digite como atendente…' : 'Escreva para enviar como humano (a IA fica pausada se assumir)…'}
                value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
              <button onClick={send} disabled={sending || !text.trim()} className="btn-primary !rounded-full h-10 w-10 !p-0 shrink-0">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-center p-8 relative overflow-hidden">
            <div className="orb bg-brand-300 h-52 w-52 -top-16 -right-16" />
            <div className="orb bg-accent-300 h-40 w-40 bottom-0 -left-10" style={{ animationDelay: '-6s' }} />
            <div className="relative">
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }}
                className="h-16 w-16 rounded-3xl bg-gradient-to-br from-brand-100 to-accent-100 grid place-items-center mx-auto mb-4 ring-1 ring-brand-200 shadow-soft">
                <MessageCircle className="h-7 w-7 text-brand-500" />
              </motion.div>
              <p className="font-display font-semibold text-lg">Selecione uma conversa</p>
              <p className="text-sm text-ink-muted mt-1">As mensagens chegam em tempo real.<br />A IA responde sozinha até você assumir.</p>
            </div>
          </div>
        )}
      </div>

      {/* perfil do contato */}
      {showProfile && active?.contacts && (
        <ContactPanel contact={active.contacts} onClose={() => setShowProfile(false)} />
      )}
    </div>
  )
}

function ContactPanel({ contact, onClose }: { contact: any; onClose: () => void }) {
  const [fuJobs, setFuJobs] = useState<any[]>([])
  const [lastAppt, setLastAppt] = useState<any>(null)
  useEffect(() => {
    supabase.from('followup_jobs').select('scheduled_at,status,followup_rules(name)').eq('contact_id', contact.id).eq('status', 'pending')
      .order('scheduled_at').limit(5).then(({ data }) => setFuJobs(data ?? []))
    supabase.from('appointments').select('service_name,starts_at,status').eq('contact_id', contact.id)
      .order('starts_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => setLastAppt(data))
  }, [contact.id])
  const st = stageInfo(contact.stage)
  return (
    <div className="hidden md:flex w-64 shrink-0 border-l border-line flex-col overflow-y-auto p-4 space-y-4 bg-surface/60">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Perfil</p>
        <button className="btn-ghost !p-1" onClick={onClose}><X className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-col items-center text-center">
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-brand-200 to-accent-300 grid place-items-center text-xl font-bold text-white overflow-hidden ring-2 ring-white shadow-soft">
          {contact.avatar_url ? <img src={contact.avatar_url} className="h-full w-full object-cover" /> : (contact.name ?? contact.push_name ?? '?')[0].toUpperCase()}
        </div>
        <p className="font-semibold text-sm mt-2">{contact.name ?? contact.push_name ?? 'Sem nome'}</p>
        <p className="text-[11px] text-ink-muted">{fmtPhone(contact.phone)}</p>
        <span className={clsx('badge text-[10px] mt-2', st.soft, st.text)}>{st.label}</span>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between"><span className="text-ink-muted">Visitas</span><b>{contact.visits ?? 0}</b></div>
        <div className="flex justify-between"><span className="text-ink-muted">Total gasto</span><b className="text-brand-700">{brl(contact.total_spent_cents ?? 0)}</b></div>
        <div className="flex justify-between"><span className="text-ink-muted">Desde</span><b>{contact.created_at ? fmtDate(contact.created_at) : '—'}</b></div>
        {contact.birthday && <div className="flex justify-between"><span className="text-ink-muted">Aniversário</span><b>{fmtDate(contact.birthday)}</b></div>}
        {contact.ai_paused && <span className="badge bg-amber-100 text-amber-700 w-full justify-center">IA pausada pra este contato</span>}
      </div>
      {(contact.tags?.length ?? 0) > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Tags</p>
          <div className="flex flex-wrap gap-1">{contact.tags.map((t: string) => <span key={t} className="badge bg-brand-50 text-brand-700 text-[10px]">{t}</span>)}</div>
        </div>
      )}
      {lastAppt && (
        <div>
          <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Último agendamento</p>
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs">
            <p className="font-medium">{lastAppt.service_name}</p>
            <p className="text-ink-muted">{fmtDate(lastAppt.starts_at)} · {lastAppt.status}</p>
          </div>
        </div>
      )}
      <div>
        <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Follow-ups</p>
        {fuJobs.length ? fuJobs.map(j => (
          <div key={j.scheduled_at} className="flex items-center gap-2 text-xs rounded-lg bg-brand-50 px-3 py-2 mb-1">
            <Bell className="h-3 w-3 text-brand-500 shrink-0" />
            <div className="min-w-0"><p className="font-medium truncate">{(j.followup_rules as any)?.name ?? 'Follow-up'}</p><p className="text-[10px] text-ink-muted">{fmtTime(j.scheduled_at)}</p></div>
          </div>
        )) : <p className="text-[11px] text-ink-muted">Nenhum agendado.</p>}
      </div>
      {contact.notes && (
        <div>
          <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wide mb-1.5">Observações</p>
          <p className="text-xs text-ink-soft whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}
    </div>
  )
}

function Bubble({ m }: { m: Message }) {
  if (m.sender === 'system' || m.type === 'system') {
    return <div className="text-center"><span className="text-[10px] text-ink-muted bg-brand-50 rounded-full px-3 py-1">{m.content}</span></div>
  }
  const isIn = m.direction === 'in'
  const opColor = (m as any).meta?.operator_color as string | undefined
  const opName = (m as any).operator_name as string | undefined
  const icon = m.sender === 'ai' ? <Bot className="h-3 w-3" /> : m.sender === 'human' ? <User className="h-3 w-3" /> : null
  const outBg = m.sender === 'ai'
    ? 'bg-gradient-to-br from-brand-500 to-brand-600 text-white rounded-br-sm shadow-soft'
    : 'text-white rounded-br-sm'
  return (
    <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25, ease: 'easeOut' }}
      style={!isIn && m.sender === 'human' ? { background: opColor ?? '#f59e0b' } : undefined}
      className={clsx('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
      isIn ? 'bg-surface border border-line rounded-bl-sm' : 'ml-auto',
      !isIn && outBg)}>
      {m.type === 'audio' && <p className="flex items-center gap-1.5 text-xs opacity-80 mb-1"><Volume2 className="h-3.5 w-3.5" /> áudio{m.transcription ? ' transcrito:' : ''}</p>}
      {m.type === 'image' && (
        <div className="mb-1">
          {m.media_url ? <img src={m.media_url} className="rounded-lg max-h-48" /> : <p className="flex items-center gap-1.5 text-xs opacity-80"><ImageIcon className="h-3.5 w-3.5" /> imagem</p>}
        </div>
      )}
      {m.transcription && <p className="italic text-xs opacity-90 mb-1">“{m.transcription}”</p>}
      {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
      <div className={clsx('flex items-center gap-1.5 mt-1', isIn ? 'justify-start' : 'justify-end')}>
        {icon && <span className={clsx('text-[9px] flex items-center gap-0.5', isIn ? 'text-ink-muted' : 'text-white/75')}>{icon}{m.sender === 'ai' ? 'IA' : (opName ?? 'você')}</span>}
        <span className={clsx('text-[9px]', isIn ? 'text-ink-muted' : 'text-white/75')}>{fmtTime(m.created_at)}</span>
      </div>
    </motion.div>
  )
}

function OperatorPicker({ profs, ownerHasPin, onPick, onClose }: {
  profs: { id: string; name: string; color: string | null; hasPin: boolean }[]
  ownerHasPin: boolean
  onPick: (profId: string | null, pin: string) => Promise<void>
  onClose: () => void
}) {
  const [sel, setSel] = useState<string | null | undefined>(undefined) // undefined = nada escolhido, null = dono
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const selected = profs.find(p => p.id === sel)
  const needsPin = sel === null ? ownerHasPin : !!selected?.hasPin

  async function go() {
    if (sel === undefined || (needsPin && !pin.trim())) return
    setBusy(true); setErr('')
    try { await onPick(sel ?? null, pin) }
    catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="card-lux anim-pop w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold">Quem está assumindo?</h3>
          <button className="btn-ghost !p-1.5" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-2">
          <button onClick={() => { setSel(null); setPin('') }}
            className={clsx('w-full flex items-center gap-3 rounded-xl border p-3 text-left transition', sel === null ? 'border-brand-500 bg-brand-50' : 'border-line hover:border-brand-300')}>
            <span className="h-9 w-9 rounded-full grid place-items-center text-white text-sm font-semibold" style={{ background: '#a78bfa' }}>EU</span>
            <div><p className="text-sm font-medium">Eu (proprietário)</p><p className="text-[11px] text-ink-muted flex items-center gap-1">{ownerHasPin ? <><Lock className="h-3 w-3" /> exige senha</> : 'sem senha'}</p></div>
          </button>
          {profs.map(p => (
            <button key={p.id} onClick={() => { setSel(p.id); setPin('') }}
              className={clsx('w-full flex items-center gap-3 rounded-xl border p-3 text-left transition', sel === p.id ? 'border-brand-500 bg-brand-50' : 'border-line hover:border-brand-300')}>
              <span className="h-9 w-9 rounded-full grid place-items-center text-white text-sm font-semibold" style={{ background: p.color ?? '#a78bfa' }}>{p.name[0]?.toUpperCase()}</span>
              <div><p className="text-sm font-medium">{p.name}</p><p className="text-[11px] text-ink-muted flex items-center gap-1">{p.hasPin ? <><Lock className="h-3 w-3" /> exige senha</> : 'sem senha'}</p></div>
            </button>
          ))}
        </div>
        {needsPin && (
          <div className="mt-3">
            <label className="label flex items-center gap-1"><Lock className="h-3 w-3" /> Senha de {selected?.name}</label>
            <input type="password" className="input" value={pin} onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && go()} autoFocus placeholder="Digite a senha" />
          </div>
        )}
        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
        <button className="btn-primary w-full mt-4" onClick={go} disabled={busy || sel === undefined || (needsPin && !pin.trim())}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />} Assumir atendimento
        </button>
      </div>
    </div>
  )
}
