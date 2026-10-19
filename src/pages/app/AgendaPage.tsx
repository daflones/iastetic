import { useEffect, useMemo, useState } from 'react'
import { addDays, addWeeks, format, isSameDay, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Plus, Bot, User, X } from 'lucide-react'
import { supabase, brl, fmtPhone } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useDraft } from '@/hooks/useDraft'
import type { Appointment, Contact, Professional, Service } from '@/lib/types'
import clsx from 'clsx'

const STATUS_LABEL: Record<string, string> = { scheduled: 'Agendado', awaiting_payment: 'Aguardando sinal', confirmed: 'Confirmado', done: 'Concluído', cancelled: 'Cancelado', no_show: 'Não veio' }
const STATUS_COLOR: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700 border-blue-200', awaiting_payment: 'bg-amber-100 text-amber-800 border-amber-300',
  confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  done: 'bg-brand-100 text-brand-700 border-brand-200', cancelled: 'bg-red-50 text-red-500 border-red-200', no_show: 'bg-amber-100 text-amber-700 border-amber-200',
}

export default function AgendaPage() {
  const { company } = useAuth()
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [appts, setAppts] = useState<Appointment[]>([])
  const [profs, setProfs] = useState<Professional[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [modal, setModal] = useState<{ day: Date; appt?: Appointment } | null>(null)
  const [filterProf, setFilterProf] = useState('')

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  useEffect(() => {
    if (!company) return
    supabase.from('professionals').select('*').eq('company_id', company.id).eq('active', true).then(({ data }) => setProfs((data as Professional[]) ?? []))
    supabase.from('services').select('*').eq('company_id', company.id).eq('active', true).then(({ data }) => setServices((data as Service[]) ?? []))
    supabase.from('contacts').select('*').eq('company_id', company.id).order('name').then(({ data }) => setContacts((data as Contact[]) ?? []))
  }, [company?.id])

  useEffect(() => { if (company) load() }, [company?.id, weekStart])

  // realtime
  useEffect(() => {
    if (!company) return
    const ch = supabase.channel('agenda-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `company_id=eq.${company.id}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [company?.id, weekStart])

  async function load() {
    const { data } = await supabase.from('appointments')
      .select('*, contacts(name,phone,push_name), professionals(name)')
      .eq('company_id', company!.id)
      .gte('starts_at', weekStart.toISOString())
      .lt('starts_at', addWeeks(weekStart, 1).toISOString())
      .order('starts_at')
    setAppts((data as Appointment[]) ?? [])
  }

  const visible = appts.filter(a => !filterProf || a.professional_id === filterProf)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h-display text-2xl sm:text-3xl">Agenda</h1>
          <p className="text-sm text-ink-muted">Agendamentos criados pela IA e por você, em tempo real.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input !w-auto !py-2 text-sm" value={filterProf} onChange={e => setFilterProf(e.target.value)}>
            <option value="">Todos os profissionais</option>
            {profs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <button className="btn-ghost !p-2" onClick={() => setWeekStart(addWeeks(weekStart, -1))}><ChevronLeft className="h-4 w-4" /></button>
            <button className="btn-outline !py-1.5 text-xs" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>hoje</button>
            <button className="btn-ghost !p-2" onClick={() => setWeekStart(addWeeks(weekStart, 1))}><ChevronRight className="h-4 w-4" /></button>
          </div>
          <button className="btn-primary" onClick={() => setModal({ day: new Date() })}><Plus className="h-4 w-4" /> Agendar</button>
        </div>
      </div>

      <div className="card-lux overflow-x-auto">
        <div className="grid grid-cols-7 min-w-[900px]">
          {days.map((d, di) => {
            const dayAppts = visible.filter(a => isSameDay(new Date(a.starts_at), d))
            const isToday = isSameDay(d, new Date())
            return (
              <motion.div key={d.toISOString()} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: di * 0.04, duration: 0.35 }}
                className={clsx('border-r border-line last:border-0 min-h-[420px]', isToday && 'bg-gradient-to-b from-brand-50/70 to-transparent')}>
                <div className={clsx('px-3 py-2.5 border-b border-line text-center sticky top-0 bg-surface/90 backdrop-blur', isToday && 'bg-brand-50/90')}>
                  <p className="text-[11px] uppercase text-ink-muted">{format(d, 'EEE', { locale: ptBR })}</p>
                  <p className={clsx('font-display font-bold text-lg', isToday && 'text-brand-600')}>
                    {isToday
                      ? <span className="inline-grid place-items-center h-8 w-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-white text-sm shadow-soft">{format(d, 'd')}</span>
                      : format(d, 'd')}
                  </p>
                </div>
                <div className="p-1.5 space-y-1.5">
                  {dayAppts.map((a, ai) => (
                    <motion.button key={a.id} onClick={() => setModal({ day: d, appt: a })}
                      initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: di * 0.04 + ai * 0.03 }}
                      whileHover={{ y: -2, scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      className={clsx('w-full text-left rounded-lg border px-2 py-1.5 text-[11px] leading-tight hover:shadow-card transition-shadow', STATUS_COLOR[a.status])}>
                      <p className="font-semibold">{format(new Date(a.starts_at), 'HH:mm')} – {format(new Date(a.ends_at), 'HH:mm')}</p>
                      <p className="font-medium truncate">{a.service_name ?? 'Serviço'}</p>
                      <p className="truncate opacity-80">{(a.contacts as any)?.name ?? (a.contacts as any)?.push_name ?? 'Cliente'}</p>
                      <p className="flex items-center gap-1 opacity-70 mt-0.5">
                        {a.created_by === 'ai' ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                        {a.professionals?.name ?? ''}
                      </p>
                    </motion.button>
                  ))}
                  <button onClick={() => setModal({ day: d })}
                    className="w-full rounded-lg border border-dashed border-line text-ink-muted text-[10px] py-1.5 hover:border-brand-300 hover:text-brand-500 hover:bg-brand-50/50 transition">
                    + novo
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {modal && <ApptModal day={modal.day} appt={modal.appt} services={services} contacts={contacts} profs={profs} companyId={company!.id}
        onClose={() => { setModal(null); load() }} />}
    </div>
  )
}

function ApptModal({ day, appt, services, contacts, profs, companyId, onClose }: {
  day: Date; appt?: Appointment; services: Service[]; contacts: Contact[]; profs: Professional[]; companyId: string; onClose: () => void
}) {
  const [form, setForm, clearForm] = useDraft(`appt:${appt?.id ?? 'new'}`, {
    contact_id: appt?.contact_id ?? '', service_id: appt?.service_id ?? '', professional_id: appt?.professional_id ?? '',
    date: format(appt ? new Date(appt.starts_at) : day, 'yyyy-MM-dd'),
    time: appt ? format(new Date(appt.starts_at), 'HH:mm') : '09:00',
    status: appt?.status ?? 'scheduled', notes: appt?.notes ?? '',
  })
  const [busy, setBusy] = useState(false)

  const service = services.find(s => s.id === form.service_id)

  async function save() {
    setBusy(true)
    const starts = new Date(`${form.date}T${form.time}:00`)
    const dur = service?.duration_min ?? 60
    const payload = {
      company_id: companyId, contact_id: form.contact_id || null, service_id: form.service_id || null,
      professional_id: form.professional_id || null, service_name: service?.name ?? null,
      starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + dur * 60000).toISOString(),
      status: form.status, price_cents: service?.price_cents ?? 0, notes: form.notes || null, created_by: 'human',
    }
    const q = appt ? supabase.from('appointments').update(payload).eq('id', appt.id) : supabase.from('appointments').insert(payload)
    await q
    setBusy(false); clearForm(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="card-lux w-full max-w-md p-6 anim-pop" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-semibold text-lg">{appt ? 'Editar agendamento' : 'Novo agendamento'}</h3>
          <button className="btn-ghost !p-1.5" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">Cliente</label>
            <select className="input" value={form.contact_id} onChange={e => setForm({ ...form, contact_id: e.target.value })}>
              <option value="">Selecione…</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name ?? c.push_name ?? fmtPhone(c.phone)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Serviço</label>
            <select className="input" value={form.service_id} onChange={e => setForm({ ...form, service_id: e.target.value })}>
              <option value="">Selecione…</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name} — {brl(s.price_cents)} · {s.duration_min}min</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label className="label">Data</label><input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div><label className="label">Hora</label><input type="time" className="input" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Profissional</label>
              <select className="input" value={form.professional_id} onChange={e => setForm({ ...form, professional_id: e.target.value })}>
                <option value="">Qualquer</option>
                {profs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div><label className="label">Observações</label><textarea className="input min-h-[60px]" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <div className="mt-6 flex gap-2">
          {appt && appt.status !== 'cancelled' && (
            <button className="btn-danger" onClick={async () => { await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id); onClose() }}>Cancelar</button>
          )}
          <button className="btn-primary flex-1" onClick={save} disabled={busy || !form.contact_id || !form.service_id}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
