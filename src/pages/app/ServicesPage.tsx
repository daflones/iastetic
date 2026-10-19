import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { supabase, brl } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Pagination, { usePaged } from '@/components/ui/Pagination'
import { useDraft } from '@/hooks/useDraft'
import { NICHES } from '@/lib/niches'
import type { Professional, Service } from '@/lib/types'
import clsx from 'clsx'

export default function ServicesPage() {
  const { company } = useAuth()
  const [items, setItems] = useState<Service[]>([])
  const [profs, setProfs] = useState<Professional[]>([])
  const [editing, setEditing] = useState<Partial<Service> | null>(null)

  const niche = company ? NICHES[company.niche] : null

  useEffect(() => {
    if (!company) return
    load()
    supabase.from('professionals').select('*').eq('company_id', company.id).eq('active', true).then(({ data }) => setProfs((data as Professional[]) ?? []))
  }, [company?.id])

  async function load() {
    const { data } = await supabase.from('services').select('*').eq('company_id', company!.id).order('sort')
    setItems((data as Service[]) ?? [])
  }

  async function toggle(s: Service) {
    await supabase.from('services').update({ active: !s.active }).eq('id', s.id); load()
  }

  const pg = usePaged(items, 12)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="h-display text-2xl sm:text-3xl">{niche?.serviceLabel ?? 'Serviço'}s</h1>
          <p className="text-sm text-ink-muted">A IA usa nome, preço e duração para responder e agendar.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ name: '', duration_min: 60, price_cents: 0, category: '', description: '', professional_ids: [], buffer_min: 0, active: true })}>
          <Plus className="h-4 w-4" /> Novo
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pg.slice.map(s => (
          <div key={s.id} className={clsx('card-lux p-5', !s.active && 'opacity-50')}>
            <div className="flex items-start justify-between">
              <div>
                <span className="badge bg-brand-50 text-brand-700 text-[10px]">{s.category || 'Geral'}</span>
                <h3 className="font-semibold mt-1.5">{s.name}</h3>
                {s.description && <p className="text-xs text-ink-muted mt-1 line-clamp-2">{s.description}</p>}
              </div>
              <button className="btn-ghost !p-1.5" onClick={() => setEditing(s)}><Pencil className="h-3.5 w-3.5" /></button>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="font-bold text-brand-600">{brl(s.price_cents)}</span>
              <span className="text-ink-muted text-xs">{s.duration_min} min{s.buffer_min ? ` +${s.buffer_min} buffer` : ''}</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-ink-muted">{s.professional_ids?.length ? `${s.professional_ids.length} profissional(is)` : 'qualquer profissional'}</span>
              <button onClick={() => toggle(s)} className="text-xs font-medium text-ink-soft hover:text-brand-600">{s.active ? 'Desativar' : 'Ativar'}</button>
            </div>
          </div>
        ))}
      </div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onChange={pg.setPage} />
      {items.length === 0 && <p className="card-lux p-10 text-center text-sm text-ink-muted">Nenhum serviço cadastrado.</p>}

      {editing && <ServiceModal service={editing} profs={profs} companyId={company!.id} onClose={reload => { setEditing(null); if (reload) load() }} />}
    </div>
  )
}

function ServiceModal({ service, profs, companyId, onClose }: { service: Partial<Service>; profs: Professional[]; companyId: string; onClose: (r: boolean) => void }) {
  const isNew = !service.id
  const [f, setF, clearF] = useDraft(`service:${service.id ?? 'new'}`, {
    name: service.name ?? '', category: service.category ?? '', description: service.description ?? '',
    duration_min: service.duration_min ?? 60, price: (service.price_cents ?? 0) / 100, buffer_min: service.buffer_min ?? 0,
    professional_ids: service.professional_ids ?? [],
  })
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const payload = { name: f.name, category: f.category || null, description: f.description || null, duration_min: f.duration_min, price_cents: Math.round(f.price * 100), buffer_min: f.buffer_min, professional_ids: f.professional_ids }
    if (isNew) await supabase.from('services').insert({ ...payload, company_id: companyId })
    else await supabase.from('services').update(payload).eq('id', service.id)
    setBusy(false); clearF(); onClose(true)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => onClose(false)}>
      <div className="card-lux anim-pop w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-semibold text-lg">{isNew ? 'Novo serviço' : 'Editar serviço'}</h3>
          <button className="btn-ghost !p-1.5" onClick={() => onClose(false)}><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div><label className="label">Nome *</label><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Categoria</label><input className="input" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} /></div>
            <div><label className="label">Preço (R$)</label><input type="number" min={0} step={5} className="input" value={f.price} onChange={e => setF({ ...f, price: +e.target.value })} /></div>
            <div><label className="label">Duração (min)</label><input type="number" min={5} step={5} className="input" value={f.duration_min} onChange={e => setF({ ...f, duration_min: +e.target.value })} /></div>
            <div><label className="label">Intervalo pós (min)</label><input type="number" min={0} step={5} className="input" value={f.buffer_min} onChange={e => setF({ ...f, buffer_min: +e.target.value })} /></div>
          </div>
          <div><label className="label">Descrição (a IA usa nas respostas)</label><textarea className="input min-h-[60px]" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
          <div>
            <label className="label">Quem faz? (vazio = qualquer)</label>
            <div className="flex flex-wrap gap-1.5">
              {profs.map(p => (
                <button key={p.id} type="button"
                  onClick={() => setF({ ...f, professional_ids: f.professional_ids.includes(p.id) ? f.professional_ids.filter(x => x !== p.id) : [...f.professional_ids, p.id] })}
                  className={clsx('text-xs rounded-full px-3 py-1.5 border transition', f.professional_ids.includes(p.id) ? 'bg-brand-500 text-white border-brand-500' : 'border-line text-ink-soft')}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          {!isNew && (
            <button className="btn-danger" onClick={async () => { await supabase.from('services').delete().eq('id', service.id); onClose(true) }}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button className="btn-primary flex-1" onClick={save} disabled={busy || !f.name.trim()}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
