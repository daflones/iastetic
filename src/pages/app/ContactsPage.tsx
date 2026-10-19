import { useEffect, useState } from 'react'
import { Bell, Bot, Columns2, GripVertical, List, MessageCircle, Phone, Search, X } from 'lucide-react'
import { supabase, brl, fmtDate, fmtPhone, fmtTime } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Pagination, { usePaged } from '@/components/ui/Pagination'
import { useDraft } from '@/hooks/useDraft'
import type { Contact } from '@/lib/types'
import clsx from 'clsx'

export const STAGES = [
  { id: 'novo', label: 'Novos', color: 'bg-blue-400', text: 'text-blue-700', soft: 'bg-blue-100' },
  { id: 'interessado', label: 'Interessadas', color: 'bg-accent-500', text: 'text-amber-700', soft: 'bg-amber-100' },
  { id: 'agendado', label: 'Agendadas', color: 'bg-amber-400', text: 'text-amber-800', soft: 'bg-amber-100' },
  { id: 'cliente', label: 'Clientes', color: 'bg-emerald-500', text: 'text-emerald-700', soft: 'bg-emerald-100' },
  { id: 'inativo', label: 'Inativas', color: 'bg-neutral-300', text: 'text-neutral-600', soft: 'bg-neutral-100' },
  { id: 'perdido', label: 'Perdidas', color: 'bg-red-400', text: 'text-red-700', soft: 'bg-red-100' },
] as const

export const stageInfo = (id?: string) => STAGES.find(s => s.id === id) ?? STAGES[0]

export default function ContactsPage() {
  const { company } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [view, setView] = useDraft<'kanban' | 'list'>(`contacts-view:${company?.id ?? 'x'}`, 'kanban')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [editing, setEditing] = useState<Contact | null>(null)
  const [pendingFu, setPendingFu] = useState<Record<string, number>>({})

  useEffect(() => { if (company) load() }, [company?.id])

  useEffect(() => {
    if (!company) return
    const ch = supabase.channel('contacts-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `company_id=eq.${company.id}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [company?.id])

  async function load() {
    const [{ data }, { data: fu }] = await Promise.all([
      supabase.from('contacts').select('*').eq('company_id', company!.id).order('last_message_at', { ascending: false, nullsFirst: false }),
      supabase.from('followup_jobs').select('contact_id').eq('company_id', company!.id).eq('status', 'pending'),
    ])
    setContacts((data as Contact[]) ?? [])
    const map: Record<string, number> = {}
    for (const j of fu ?? []) if (j.contact_id) map[j.contact_id] = (map[j.contact_id] ?? 0) + 1
    setPendingFu(map)
  }

  async function moveStage(c: Contact, stage: string) {
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, stage: stage as Contact['stage'] } : x))
    await supabase.from('contacts').update({ stage }).eq('id', c.id)
  }

  const filtered = contacts.filter(c => {
    const s = `${c.name ?? ''} ${c.push_name ?? ''} ${c.phone} ${(c.tags ?? []).join(' ')}`.toLowerCase()
    return s.includes(search.toLowerCase()) && (stageFilter === 'all' || c.stage === stageFilter)
  })
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({})
  const pg = usePaged(filtered, 15, [search, stageFilter])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h-display text-2xl sm:text-3xl">Clientes & Leads</h1>
          <p className="text-sm text-ink-muted">{contacts.length} contatos · arraste entre etapas no kanban ou use a lista.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-52">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input className="input pl-9" placeholder="Buscar nome, fone, tag…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input !w-auto text-sm" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
            <option value="all">Todas as etapas</option>
            {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div className="flex rounded-xl border border-line overflow-hidden">
            <button onClick={() => setView('kanban')} title="Kanban" className={clsx('px-3 py-2 text-xs transition', view === 'kanban' ? 'bg-brand-500 text-white' : 'text-ink-muted hover:bg-brand-50')}><Columns2 className="h-4 w-4" /></button>
            <button onClick={() => setView('list')} title="Lista" className={clsx('px-3 py-2 text-xs transition', view === 'list' ? 'bg-brand-500 text-white' : 'text-ink-muted hover:bg-brand-50')}><List className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {view === 'kanban' ? (
        /* kanban vertical: uma etapa abaixo da outra, cards em grade */
        <div className="space-y-4">
          {STAGES.filter(s => stageFilter === 'all' || s.id === stageFilter).map(stage => {
            const items = filtered.filter(c => c.stage === stage.id)
            return (
              <div key={stage.id}>
                <div className="flex items-center gap-2 mb-2.5 px-1">
                  <span className={clsx('h-2.5 w-2.5 rounded-full', stage.color)} />
                  <p className="text-sm font-semibold">{stage.label}</p>
                  <span className="text-xs text-ink-muted">{items.length}</span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 min-h-[70px] rounded-2xl bg-brand-50/40 p-2"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    const id = e.dataTransfer.getData('contact')
                    const c = contacts.find(x => x.id === id)
                    if (c) moveStage(c, stage.id)
                  }}>
                  {(expandedStages[stage.id] ? items : items.slice(0, 8)).map(c => <ContactCard key={c.id} c={c} fu={pendingFu[c.id] ?? 0} onClick={() => setEditing(c)} />)}
                  {items.length > 8 && !expandedStages[stage.id] && (
                    <button onClick={() => setExpandedStages(x => ({ ...x, [stage.id]: true }))}
                      className="rounded-xl border border-dashed border-line py-3 text-[11px] text-ink-muted hover:border-brand-300 hover:text-brand-600 transition col-span-full">
                      +{items.length - 8} mais nesta etapa — clique pra ver
                    </button>
                  )}
                  {items.length === 0 && <p className="text-[11px] text-ink-muted py-5 text-center col-span-full">vazio — arraste contatos pra cá</p>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* lista detalhada */
        <div className="card-lux overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-[11px] text-ink-muted border-b border-line">
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Etapa</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium">Gasto</th>
                <th className="px-4 py-3 font-medium">Visitas</th>
                <th className="px-4 py-3 font-medium">Última msg</th>
                <th className="px-4 py-3 font-medium">Sinais</th>
              </tr>
            </thead>
            <tbody>
              {pg.slice.map(c => {
                const st = stageInfo(c.stage)
                return (
                  <tr key={c.id} onClick={() => setEditing(c)} className="border-b border-line/50 hover:bg-brand-50/50 cursor-pointer transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-200 to-accent-300 grid place-items-center text-xs font-bold text-white shrink-0 overflow-hidden">
                          {c.avatar_url ? <img src={c.avatar_url} className="h-full w-full object-cover" /> : (c.name ?? c.push_name ?? '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{c.name ?? c.push_name ?? 'Sem nome'}</p>
                          <p className="text-[11px] text-ink-muted">{fmtPhone(c.phone)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className={clsx('badge text-[10px]', st.soft, st.text)}>{st.label}</span></td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1 max-w-[160px]">{(c.tags ?? []).slice(0, 3).map(t => <span key={t} className="badge bg-canvas text-ink-soft text-[9px]">{t}</span>)}</div></td>
                    <td className="px-4 py-3 text-xs font-semibold text-brand-700">{c.total_spent_cents ? brl(c.total_spent_cents) : '—'}</td>
                    <td className="px-4 py-3 text-xs">{c.visits}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{c.last_message_at ? fmtTime(c.last_message_at) : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {pendingFu[c.id] > 0 && <span className="badge bg-brand-50 text-brand-700 text-[9px]"><Bell className="h-2.5 w-2.5" /> {pendingFu[c.id]} follow-up</span>}
                        {c.ai_paused && <span className="badge bg-amber-100 text-amber-700 text-[9px]">IA pausada</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-xs text-ink-muted text-center py-10">Nenhum contato encontrado.</p>}
          <div className="px-4 pb-4"><Pagination page={pg.page} pages={pg.pages} total={pg.total} onChange={pg.setPage} /></div>
        </div>
      )}

      {editing && <ContactModal contact={editing} companyId={company!.id} onClose={reload => { setEditing(null); if (reload) load() }} />}
    </div>
  )
}

function ContactCard({ c, fu, onClick }: { c: Contact; fu: number; onClick: () => void }) {
  return (
    <div draggable onDragStart={e => e.dataTransfer.setData('contact', c.id)} onClick={onClick}
      className="card-lux !rounded-xl p-3 cursor-grab active:cursor-grabbing hover:shadow-glow transition-shadow">
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-ink-muted shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-sm truncate flex-1">{c.name ?? c.push_name ?? 'Sem nome'}</p>
            {c.ai_paused ? <span className="badge bg-amber-100 text-amber-700 text-[9px]">IA pausada</span> : <Bot className="h-3 w-3 text-brand-400 shrink-0" />}
          </div>
          <p className="text-[11px] text-ink-muted flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" />{fmtPhone(c.phone)}</p>
          {(c.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {c.tags.slice(0, 3).map(t => <span key={t} className="badge bg-canvas text-ink-soft text-[9px]">{t}</span>)}
              {c.tags.length > 3 && <span className="text-[9px] text-ink-muted">+{c.tags.length - 3}</span>}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-ink-muted">
            <span>{c.visits} visitas</span>
            {c.total_spent_cents > 0 && <span className="font-semibold text-brand-600">{brl(c.total_spent_cents)}</span>}
            {fu > 0 && <span className="badge bg-brand-50 text-brand-700 !px-1.5"><Bell className="h-2.5 w-2.5" /> {fu}</span>}
            {c.last_message_at && <span className="ml-auto">{fmtTime(c.last_message_at)}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function ContactModal({ contact, companyId, onClose }: { contact: Contact; companyId: string; onClose: (reload: boolean) => void }) {
  const [form, setForm, clearForm] = useDraft(`contact:${contact.id}`, {
    name: contact.name ?? '', email: contact.email ?? '', birthday: contact.birthday ?? '',
    notes: contact.notes ?? '', stage: contact.stage, ai_paused: contact.ai_paused,
    tags: (contact.tags ?? []).join(', '),
  })
  const [busy, setBusy] = useState(false)
  const [appts, setAppts] = useState<any[]>([])
  const [fuJobs, setFuJobs] = useState<any[]>([])

  useEffect(() => {
    supabase.from('appointments').select('id,service_name,starts_at,status,price_cents').eq('contact_id', contact.id)
      .order('starts_at', { ascending: false }).limit(10).then(({ data }) => setAppts(data ?? []))
    supabase.from('followup_jobs').select('id,scheduled_at,status,sent_content,followup_rules(name,trigger)').eq('contact_id', contact.id)
      .order('scheduled_at', { ascending: false }).limit(8).then(({ data }) => setFuJobs(data ?? []))
  }, [contact.id])

  async function save() {
    setBusy(true)
    await supabase.from('contacts').update({
      name: form.name || null, email: form.email || null, birthday: form.birthday || null,
      notes: form.notes || null, stage: form.stage, ai_paused: form.ai_paused,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    }).eq('id', contact.id)
    setBusy(false); clearForm(); onClose(true)
  }

  async function openChat() {
    const { data } = await supabase.from('conversations').select('id').eq('company_id', companyId).eq('contact_id', contact.id).maybeSingle()
    onClose(false)
    if (data) location.href = `/app/chat?c=${data.id}`
  }

  const st = stageInfo(contact.stage)
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => onClose(false)}>
      <div className="card-lux anim-pop w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-lg flex items-center gap-2">{contact.name ?? contact.push_name ?? fmtPhone(contact.phone)}</h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={clsx('badge text-[10px]', st.soft, st.text)}>{st.label}</span>
              <span className="text-[11px] text-ink-muted">{contact.visits} visitas · {brl(contact.total_spent_cents ?? 0)} gasto</span>
            </div>
          </div>
          <button className="btn-ghost !p-1.5" onClick={() => onClose(false)}><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label">Nome</label><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">WhatsApp</label><input className="input" value={fmtPhone(contact.phone)} disabled /></div>
          <div><label className="label">Aniversário</label><input type="date" className="input" value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} /></div>
          <div><label className="label">E-mail</label><input className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Etapa do funil</label>
            <select className="input" value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value as any })}>
              {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="col-span-2"><label className="label">Tags (separadas por vírgula)</label><input className="input" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} /></div>
          <div className="col-span-2"><label className="label">Observações</label><textarea className="input min-h-[70px]" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand-500 h-4 w-4" checked={form.ai_paused} onChange={e => setForm({ ...form, ai_paused: e.target.checked })} />
            Pausar a IA para este contato (atendimento sempre humano)
          </label>
        </div>

        {fuJobs.length > 0 && (
          <div className="mt-5">
            <p className="label">Follow-ups</p>
            <div className="space-y-1.5">
              {fuJobs.map(j => (
                <div key={j.id} className="flex justify-between items-center text-xs rounded-lg bg-brand-50 px-3 py-2">
                  <span className="flex items-center gap-1.5"><Bell className="h-3 w-3 text-brand-500" /> {(j.followup_rules as any)?.name ?? 'Follow-up'}</span>
                  <span className={clsx('text-ink-muted', j.status === 'pending' && 'text-amber-600 font-medium')}>
                    {j.status === 'pending' ? `agendado ${fmtTime(j.scheduled_at)}` : j.status === 'sent' ? `enviado ${fmtTime(j.sent_at ?? j.scheduled_at)}` : 'falhou'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {appts.length > 0 && (
          <div className="mt-5">
            <p className="label">Histórico de agendamentos</p>
            <div className="space-y-1.5">
              {appts.map(a => (
                <div key={a.id} className="flex justify-between text-xs rounded-lg bg-brand-50 px-3 py-2">
                  <span>{a.service_name}</span>
                  <span className="text-ink-muted">{fmtDate(a.starts_at)} · {a.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button className="btn-outline" onClick={openChat}><MessageCircle className="h-4 w-4" /> Abrir conversa</button>
          <button className="btn-primary flex-1" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
