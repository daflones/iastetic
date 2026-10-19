import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, LifeBuoy, Loader2, MessageSquarePlus, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import clsx from 'clsx'

const CATS = [
  ['duvida', 'Dúvida / ajuda'], ['bug', 'Algo quebrou'], ['whatsapp', 'WhatsApp / IA'],
  ['financeiro', 'Financeiro / plano'], ['sugestao', 'Sugestão'],
] as const
const STATUS: Record<string, [string, string]> = {
  aberto: ['Aberto', 'bg-amber-100 text-amber-700'],
  em_atendimento: ['Em atendimento', 'bg-blue-100 text-blue-700'],
  aguardando_empresa: ['Aguardando você', 'bg-violet-100 text-violet-700'],
  resolvido: ['Resolvido', 'bg-emerald-100 text-emerald-700'],
}
const CAT_LABEL = Object.fromEntries(CATS.map(([k, l]) => [k, l]))

interface Ticket { id: string; subject: string; category: string; status: string; created_at: string; updated_at: string }
interface Msg { id: string; sender: 'company' | 'admin'; body: string; created_at: string }

export default function SupportPage() {
  const { company } = useAuth() as any
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [open, setOpen] = useState<Ticket | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [form, setForm] = useState({ subject: '', category: 'duvida', body: '' })
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const { data } = await supabase.from('support_tickets').select('*').eq('company_id', company.id).order('updated_at', { ascending: false })
    setTickets((data as Ticket[]) ?? [])
  }
  useEffect(() => { if (company) load() }, [company?.id])

  async function openTicket(t: Ticket) {
    setOpen(t)
    const { data } = await supabase.from('support_messages').select('*').eq('ticket_id', t.id).order('created_at')
    setMsgs((data as Msg[]) ?? [])
  }

  async function create() {
    if (!form.subject.trim() || !form.body.trim()) { setError('Preencha assunto e descrição.'); return }
    setBusy(true); setError('')
    const { data: t, error: e } = await supabase.from('support_tickets')
      .insert({ company_id: company.id, subject: form.subject.trim(), category: form.category })
      .select().single()
    if (e) { setError(e.message); setBusy(false); return }
    await supabase.from('support_messages').insert({ ticket_id: t.id, sender: 'company', body: form.body.trim() })
    setForm({ subject: '', category: 'duvida', body: '' }); setCreating(false); setBusy(false)
    load()
  }

  async function sendReply() {
    const text = reply.trim(); if (!text || !open) return
    setBusy(true)
    await supabase.from('support_messages').insert({ ticket_id: open.id, sender: 'company', body: text })
    if (['aguardando_empresa', 'resolvido'].includes(open.status))
      await supabase.from('support_tickets').update({ status: 'aberto' }).eq('id', open.id)
    setReply(''); setBusy(false)
    openTicket(open); load()
  }

  const st = (s: string) => STATUS[s] ?? STATUS.aberto

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="h-display text-2xl sm:text-3xl flex items-center gap-2"><LifeBuoy className="h-7 w-7 text-brand-500" /> Suporte</h1>
          <p className="text-sm text-ink-muted">Abra um chamado contando sua dor — nossa equipe analisa e responde por aqui.</p>
        </div>
        {!creating && <button className="btn-primary" onClick={() => { setCreating(true); setOpen(null) }}><MessageSquarePlus className="h-4 w-4" /> Novo chamado</button>}
      </div>

      <AnimatePresence mode="wait">
        {creating ? (
          <motion.div key="new" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card-lux p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Novo chamado</h3>
              <button className="btn-ghost text-xs" onClick={() => setCreating(false)}><ArrowLeft className="h-3.5 w-3.5" /> voltar</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Assunto *</label>
                <input className="input" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Ex.: IA não respondeu cliente" />
              </div>
              <div>
                <label className="label">Categoria</label>
                <select className="input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  {CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Descreva o que precisa *</label>
              <textarea className="input min-h-28" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
                placeholder="Conta pra gente o que aconteceu, o que você esperava e o que precisa de ajuda…" />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button className="btn-primary" onClick={create} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Enviar chamado
            </button>
          </motion.div>
        ) : open ? (
          <motion.div key="thread" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card-lux overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <div>
                <button className="btn-ghost text-xs mb-1" onClick={() => setOpen(null)}><ArrowLeft className="h-3.5 w-3.5" /> chamados</button>
                <h3 className="font-semibold">{open.subject}</h3>
                <p className="text-[11px] text-ink-muted">{CAT_LABEL[open.category]} · aberto em {new Date(open.created_at).toLocaleString('pt-BR')}</p>
              </div>
              <span className={clsx('badge text-[10px]', st(open.status)[1])}>{st(open.status)[0]}</span>
            </div>
            <div className="p-5 space-y-3 max-h-[50vh] overflow-y-auto">
              {msgs.map(m => (
                <div key={m.id} className={clsx('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                  m.sender === 'company' ? 'ml-auto bg-brand-600 text-white rounded-br-md' : 'bg-ink/5 rounded-bl-md')}>
                  {m.body}
                  <div className={clsx('text-[9px] mt-1', m.sender === 'company' ? 'text-white/60' : 'text-ink-muted')}>
                    {m.sender === 'admin' ? 'Suporte IAstetic · ' : ''}{new Date(m.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-line flex gap-2">
              <input className="input flex-1" placeholder="Responder…" value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendReply()} />
              <button className="btn-primary !px-4" onClick={sendReply} disabled={busy || !reply.trim()}><Send className="h-4 w-4" /></button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2.5">
            {tickets.map(t => (
              <button key={t.id} onClick={() => openTicket(t)} className="card-lux p-4 w-full text-left flex items-center gap-4 hover:shadow-soft transition">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{t.subject}</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">{CAT_LABEL[t.category]} · {new Date(t.updated_at).toLocaleString('pt-BR')}</p>
                </div>
                <span className={clsx('badge text-[10px] shrink-0', st(t.status)[1])}>{st(t.status)[0]}</span>
              </button>
            ))}
            {!tickets.length && (
              <div className="card-lux p-10 text-center text-sm text-ink-muted">
                Nenhum chamado ainda. Precisa de ajuda? <button className="text-brand-600 underline" onClick={() => setCreating(true)}>Abra o primeiro</button>.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
