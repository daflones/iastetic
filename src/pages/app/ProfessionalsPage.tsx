import { useEffect, useState } from 'react'
import { Lock, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useDraft } from '@/hooks/useDraft'
import { NICHES } from '@/lib/niches'
import { onlyDigits } from '@/lib/validators'
import type { Professional } from '@/lib/types'
import clsx from 'clsx'

const DAYS = [{ k: 'sun', l: 'Dom' }, { k: 'mon', l: 'Seg' }, { k: 'tue', l: 'Ter' }, { k: 'wed', l: 'Qua' }, { k: 'thu', l: 'Qui' }, { k: 'fri', l: 'Sex' }, { k: 'sat', l: 'Sáb' }]

const PROF_COLORS = ['#a78bfa', '#f472b6', '#fb923c', '#34d399', '#38bdf8', '#facc15', '#f87171', '#94a3b8']

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function ProfessionalsPage() {
  const { company, refresh } = useAuth() as any
  const [items, setItems] = useState<Professional[]>([])
  const [editing, setEditing] = useState<Partial<Professional> | null>(null)
  const niche = company ? NICHES[company.niche as keyof typeof NICHES] : null

  useEffect(() => { if (company) load() }, [company?.id])
  async function load() {
    const { data } = await supabase.from('professionals').select('*').eq('company_id', company!.id).order('name')
    setItems((data as Professional[]) ?? [])
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="h-display text-2xl sm:text-3xl">{niche?.professionalLabelPlural ?? 'Profissionais'}</h1>
          <p className="text-sm text-ink-muted">Cada um pode ter horários próprios; a IA respeita na hora de agendar.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ name: '', specialties: [], working_hours: null, active: true })}>
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>

      {company && <OwnerCard company={company} onSaved={refresh} />}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(p => (
          <button key={p.id} onClick={() => setEditing(p)} className={clsx('card-lux p-5 text-left hover:shadow-glow transition-shadow', !p.active && 'opacity-50')}>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full grid place-items-center text-white font-semibold shadow-sm" style={{ background: p.color ?? '#a78bfa' }}>
                {p.name[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-[11px] text-ink-muted">{p.active ? (p.working_hours ? 'horário próprio' : 'horário do estabelecimento') : 'inativo(a)'}</p>
              </div>
            </div>
            {p.specialties?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">{p.specialties.map(s => <span key={s} className="badge bg-brand-50 text-brand-700 text-[10px]">{s}</span>)}</div>
            )}
          </button>
        ))}
      </div>
      {items.length === 0 && <p className="card-lux p-10 text-center text-sm text-ink-muted">Nenhum profissional ainda. Adicione quem atende.</p>}

      {editing && <ProfModal prof={editing} companyId={company!.id} onClose={r => { setEditing(null); if (r) load() }} />}
    </div>
  )
}

function OwnerCard({ company, onSaved }: { company: any; onSaved?: () => Promise<void> | void }) {
  const hasPin = !!company.owner_pin_hash
  const [editing, setEditing] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  async function savePin() {
    if (!pin.trim()) return
    setBusy(true)
    await supabase.from('companies').update({ owner_pin_hash: await sha256(pin.trim()) }).eq('id', company.id)
    setBusy(false); setPin(''); setEditing(false)
    await onSaved?.()
  }

  return (
    <div className="card-lux p-5 flex items-center gap-4">
      <div className="h-11 w-11 rounded-full grid place-items-center text-white font-semibold shadow-sm" style={{ background: '#a78bfa' }}>EU</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Você (proprietário)</p>
        <p className="text-[11px] text-ink-muted">Também assume conversas no chat — proteja com sua senha.</p>
      </div>
      {hasPin && !editing ? (
        <div className="flex items-center gap-2">
          <span className="badge bg-emerald-100 text-emerald-700 text-[10px]"><Lock className="h-3 w-3" /> senha definida</span>
          <button className="text-xs text-brand-600 underline" onClick={() => setEditing(true)}>definir nova senha</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input type="password" className="input !w-48" value={pin} onChange={e => setPin(onlyDigits(e.target.value, 8))}
            placeholder={hasPin ? 'Nova senha' : 'Crie sua senha'} autoComplete="new-password"
            onKeyDown={e => e.key === 'Enter' && savePin()} />
          <button className="btn-primary !py-2 text-xs" onClick={savePin} disabled={busy || !pin.trim()}>
            {busy ? 'Salvando…' : <><Lock className="h-3.5 w-3.5" /> Salvar</>}
          </button>
          {editing && <button className="btn-ghost !p-1.5" onClick={() => { setEditing(false); setPin('') }}><X className="h-4 w-4" /></button>}
        </div>
      )}
    </div>
  )
}

function ProfModal({ prof, companyId, onClose }: { prof: Partial<Professional>; companyId: string; onClose: (r: boolean) => void }) {
  const isNew = !prof.id
  const dk = `prof:${prof.id ?? 'new'}`
  const [name, setName, c1] = useDraft(`${dk}:name`, prof.name ?? '')
  const [specialties, setSpecialties, c2] = useDraft(`${dk}:spec`, (prof.specialties ?? []).join(', '))
  const [customHours, setCustomHours, c3] = useDraft(`${dk}:ch`, !!prof.working_hours)
  const [hours, setHours, c4] = useDraft<Record<string, [string, string][] | null>>(`${dk}:hours`, prof.working_hours ?? { sun: null, mon: [['09:00', '18:00']], tue: [['09:00', '18:00']], wed: [['09:00', '18:00']], thu: [['09:00', '18:00']], fri: [['09:00', '18:00']], sat: null })
  const [active, setActive, c5] = useDraft(`${dk}:active`, prof.active ?? true)
  const [color, setColor, c6] = useDraft(`${dk}:color`, prof.color ?? PROF_COLORS[0])
  const clearDrafts = () => { c1(); c2(); c3(); c4(); c5(); c6() }
  const [busy, setBusy] = useState(false)
  const [pin, setPin] = useState('')
  const [resetPin, setResetPin] = useState(false)
  const hasPin = !!prof.pin_hash

  async function save() {
    setBusy(true)
    const payload: any = { name, specialties: specialties.split(',').map(s => s.trim()).filter(Boolean), working_hours: customHours ? hours : null, active, color }
    // senha só pode ser criada ou substituída por uma NOVA — nunca exibida/editada
    if (pin.trim()) payload.pin_hash = await sha256(pin.trim())
    if (isNew) await supabase.from('professionals').insert({ ...payload, company_id: companyId })
    else await supabase.from('professionals').update(payload).eq('id', prof.id)
    setBusy(false); clearDrafts(); onClose(true)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => onClose(false)}>
      <div className="card-lux anim-pop w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-semibold text-lg">{isNew ? 'Novo profissional' : `Editar ${prof.name}`}</h3>
          <button className="btn-ghost !p-1.5" onClick={() => onClose(false)}><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4">
          <div><label className="label">Nome</label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label className="label">Especialidades (vírgula)</label><input className="input" value={specialties} onChange={e => setSpecialties(e.target.value)} placeholder="Ex.: Corte, Coloração" /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand-500 h-4 w-4" checked={customHours} onChange={e => setCustomHours(e.target.checked)} />
            Horário próprio (diferente do estabelecimento)
          </label>
          {customHours && (
            <div className="space-y-2">
              {DAYS.map(d => (
                <div key={d.k} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm w-14">
                    <input type="checkbox" className="accent-brand-500 h-4 w-4" checked={!!hours[d.k]}
                      onChange={e => setHours({ ...hours, [d.k]: e.target.checked ? [['09:00', '18:00']] : null })} />
                    {d.l}
                  </label>
                  {hours[d.k] && hours[d.k]![0] && (
                    <div className="flex items-center gap-1.5">
                      <input type="time" className="input !w-[105px] !py-1.5" value={hours[d.k]![0][0]} onChange={e => setHours({ ...hours, [d.k]: [[e.target.value, hours[d.k]![0][1]]] })} />
                      <span className="text-ink-muted text-xs">–</span>
                      <input type="time" className="input !w-[105px] !py-1.5" value={hours[d.k]![0][1]} onChange={e => setHours({ ...hours, [d.k]: [[hours[d.k]![0][0], e.target.value]] })} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="label">Cor no chat/agenda</label>
            <div className="flex gap-2">
              {PROF_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={clsx('h-8 w-8 rounded-full transition-all', color === c ? 'ring-2 ring-offset-2 ring-ink scale-110' : 'hover:scale-105')}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-line p-3 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-brand-500" /> Senha de atendimento (chat)</p>
            <p className="text-[11px] text-ink-muted">Usada pra assumir conversas como este profissional. Por segurança, a senha não pode ser vista nem editada — só substituída por uma nova.</p>
            {hasPin && !resetPin ? (
              <div className="flex items-center gap-2">
                <span className="badge bg-emerald-100 text-emerald-700 text-[10px]"><Lock className="h-3 w-3" /> senha definida</span>
                <button type="button" className="text-xs text-brand-600 underline" onClick={() => setResetPin(true)}>definir nova senha</button>
              </div>
            ) : (
              <input type="password" className="input" value={pin} onChange={e => setPin(onlyDigits(e.target.value, 8))}
                placeholder={hasPin ? 'Nova senha (substitui a atual)' : 'Senha (opcional, ex.: 4-6 dígitos)'} autoComplete="new-password" />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-brand-500 h-4 w-4" checked={active} onChange={e => setActive(e.target.checked)} />
            Ativo(a)
          </label>
        </div>
        <div className="mt-6 flex gap-2">
          {!isNew && <button className="btn-danger" onClick={async () => { await supabase.from('professionals').delete().eq('id', prof.id); onClose(true) }}>Excluir</button>}
          <button className="btn-primary flex-1" onClick={save} disabled={busy || !name.trim()}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
